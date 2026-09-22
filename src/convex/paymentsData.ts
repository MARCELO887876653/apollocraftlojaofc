import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getSetting } from "./lib/data";

// ─────────────────────────────────────────────────────────────
// Dados de pagamento (runtime padrão) — usados por payments.ts
// ─────────────────────────────────────────────────────────────

export const internalGetGatewayConfig = internalQuery({
  args: {},
  handler: async (ctx) => {
    return (await getSetting(ctx, "gateway_mercadopago")) as any;
  },
});

export const internalGetOrder = internalQuery({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const internalGetStoreName = internalQuery({
  args: {},
  handler: async (ctx) => {
    const store = (await getSetting(ctx, "store")) as any;
    return store?.name ?? "Loja";
  },
});

export const applyPaymentCreation = internalMutation({
  args: {
    orderId: v.id("orders"),
    gatewayPaymentId: v.string(),
    pixQrCode: v.optional(v.string()),
    pixQrCodeBase64: v.optional(v.string()),
    pixTicketUrl: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, gatewayPaymentId, pixQrCode, pixQrCodeBase64, pixTicketUrl }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.paymentStatus !== "pending") return;
    await ctx.db.patch(orderId, {
      gateway: "mercadopago",
      gatewayPaymentId,
      pixQrCode,
      pixQrCodeBase64,
      pixTicketUrl,
      paymentMethod: "pix",
      updatedAt: Date.now(),
    });
  },
});

/** Transição de estado idempotente — chamada pelo polling e pelo webhook. */
export const applyGatewayStatus = internalMutation({
  args: {
    gatewayPaymentId: v.string(),
    mpStatus: v.string(),
    amountApproved: v.optional(v.number()),
  },
  handler: async (ctx, { gatewayPaymentId, mpStatus }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_gatewayPaymentId", (q) => q.eq("gatewayPaymentId", gatewayPaymentId))
      .first();
    if (!order) return;
    await transitionOrder(ctx, order, mpStatus);
  },
});

// ─── Transição central de status (idempotente, nunca rebaixa "paid") ───

export async function transitionOrder(ctx: any, order: any, mpStatus: string) {
  const current = order.paymentStatus;
  if (current === mpStatus) return;
  const now = Date.now();

  if (mpStatus === "paid" && current === "pending") {
    await ctx.db.patch(order._id, {
      paymentStatus: "paid",
      paidAt: now,
      updatedAt: now,
      statusHistory: [...order.statusHistory, { status: "paid", at: now, note: "Pagamento confirmado pelo gateway" }],
    });
    // dispara processamento da fila de entrega
    await ctx.scheduler.runAfter(0, internal.deliveriesQueue.processOrder, { orderId: order._id });
    // dispara webhooks de saída
    await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
      event: "order.paid",
      payload: {
        orderNumber: order.number,
        total: order.totalCents / 100,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        items: order.items.map((i: any) => ({ name: i.name, variant: i.variantName, quantity: i.quantity })),
      },
    });
    return;
  }

  const allowed: Record<string, string[]> = {
    pending: ["cancelled", "expired", "failed"],
    paid: ["refunded"],
  };
  if (allowed[current]?.includes(mpStatus)) {
    await ctx.db.patch(order._id, {
      paymentStatus: mpStatus,
      updatedAt: now,
      statusHistory: [...order.statusHistory, { status: mpStatus, at: now, note: "Status atualizado pelo gateway" }],
    });
  }
}
