import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getSetting } from "./lib/data";
import { applyPaidOrderToCustomer } from "./lib/customerTotals";
import { applyOrderStatusChange } from "./lib/statsRollups";
import { scheduleWebhookEvent } from "./lib/webhookDispatch";

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

/**
 * Pedido + configuração do gateway numa única ida ao banco.
 *
 * A consulta de status do cliente (`refreshPaymentStatus`) chamava duas queries
 * internas por rodada; juntando as duas leituras, cada verificação custa uma
 * função a menos.
 */
export const internalGetPaymentContext = internalQuery({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }) => {
    const order = await ctx.db.get(id);
    const config = (await getSetting(ctx, "gateway_mercadopago")) as any;
    return { order, config: config ?? null };
  },
});

export const internalGetStoreName = internalQuery({
  args: {},
  handler: async (ctx) => {
    const store = (await getSetting(ctx, "store")) as any;
    return store?.name ?? "Loja";
  },
});

/** Pedidos pendentes que já têm cobrança no gateway — usados pela
 *  reconciliação periódica (convex/crons.ts).
 *
 * Lê no máximo `SCAN_CAP` pedidos pendentes (o índice já traz só os pendentes),
 * em vez de carregar a fila inteira de documentos a cada rodada do cron. */
const SCAN_CAP = 60;

export const internalListPendingPayments = internalQuery({
  args: { since: v.number(), limit: v.number() },
  handler: async (ctx, { since, limit }) => {
    const pending = await ctx.db
      .query("orders")
      .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", "pending"))
      .take(SCAN_CAP);
    return pending
      .filter((o) => Boolean(o.gatewayPaymentId) && o.createdAt >= since)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((o) => ({ id: o._id as string, gatewayPaymentId: o.gatewayPaymentId! }));
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
    const now = Date.now();
    // O pedido guarda só o que TODA listagem/estatística precisa.
    await ctx.db.patch(orderId, {
      gateway: "mercadopago",
      gatewayPaymentId,
      paymentMethod: "pix",
      updatedAt: now,
    });
    // O QR Code (imagem em base64) fica em `orderPix`: ele era 78% do documento
    // do pedido (medido: 65 KB de 91 KB) e viajava em toda leitura de pedidos —
    // listagens do painel, dashboard, cron de reconciliação — sem ser usado.
    const row = await ctx.db
      .query("orderPix")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .first();
    const payload = { pixQrCode, pixQrCodeBase64, pixTicketUrl };
    if (row) await ctx.db.patch(row._id, payload);
    else await ctx.db.insert("orderPix", { orderId, ...payload, createdAt: now });
  },
});

/**
 * Migração de dados (rodar uma vez): move o QR Code PIX que estava DENTRO do
 * documento do pedido para `orderPix`.
 *
 * Nada é perdido — a cópia é gravada ANTES de os campos antigos serem limpos,
 * e `readOrderPix` lê as duas origens. O ganho é imediato: o documento de
 * pedido cai de ~4,8 KB para ~1 KB na base real (19 pedidos: 91 KB → 19 KB).
 *
 * Roda em lotes por `createdAt`; chame de novo com `cursor = nextCursor` até
 * ele voltar `null` (na base atual, uma chamada resolve tudo).
 */
export const migratePixToOrderPix = internalMutation({
  args: { cursor: v.optional(v.number()), batch: v.optional(v.number()) },
  handler: async (ctx, { cursor, batch }) => {
    const size = Math.max(1, Math.min(batch ?? 100, 200));
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_createdAt", (q) =>
        cursor === undefined ? q : q.gt("createdAt", cursor),
      )
      .take(size);

    let moved = 0;
    for (const order of orders) {
      if (!order.pixQrCode && !order.pixQrCodeBase64 && !order.pixTicketUrl) continue;
      const payload = {
        pixQrCode: order.pixQrCode,
        pixQrCodeBase64: order.pixQrCodeBase64,
        pixTicketUrl: order.pixTicketUrl,
      };
      const row = await ctx.db
        .query("orderPix")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .first();
      if (row) await ctx.db.patch(row._id, payload);
      else await ctx.db.insert("orderPix", { orderId: order._id, ...payload, createdAt: Date.now() });
      await ctx.db.patch(order._id, {
        pixQrCode: undefined,
        pixQrCodeBase64: undefined,
        pixTicketUrl: undefined,
      });
      moved++;
    }

    const last = orders[orders.length - 1]?.createdAt;
    return {
      scanned: orders.length,
      moved,
      nextCursor: orders.length === size && last !== undefined ? last : null,
    };
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
    // dispara processamento da fila de entrega (legado)
    await ctx.scheduler.runAfter(0, internal.deliveriesQueue.processOrder, { orderId: order._id });
    // cria a fila de entregas automáticas (API v1) — idempotente
    await ctx.scheduler.runAfter(0, internal.deliveryCommands.internalCreateForOrder, {
      orderId: order._id,
    });
    // pagamento confirmado = compra: entra no acumulado do cliente.
    // (O checkout não soma mais; pedido pendente nunca virou "total gasto".)
    await applyPaidOrderToCustomer(ctx, order, 1);
    // estatísticas incrementais: pending → paid no dia do pagamento
    await applyOrderStatusChange(
      ctx,
      { createdAt: order.createdAt, paidAt: now, totalCents: order.totalCents, items: order.items },
      current,
      "paid",
    );
    // dispara webhooks de saída (só quando existe webhook escutando)
    await scheduleWebhookEvent(ctx, "order.paid", {
      orderNumber: order.number,
      total: order.totalCents / 100,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      items: order.items.map((i: any) => ({ name: i.name, variant: i.variantName, quantity: i.quantity })),
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
    // reembolso/cancelamento: o valor pago sai do acumulado do cliente
    if (current === "paid") {
      await applyPaidOrderToCustomer(ctx, order, -1);
    }
    // estatísticas incrementais: estorno sai do faturamento do dia do pagamento
    await applyOrderStatusChange(ctx, order, current, mpStatus);
    // reembolso/cancelamento: cancela entregas pendentes e agenda reversão
    await ctx.scheduler.runAfter(0, internal.deliveryCommands.internalCancelForOrder, {
      orderId: order._id,
      reason: `Pagamento ${mpStatus} pelo gateway`,
    });
    await scheduleWebhookEvent(ctx, "order.cancelled", {
      orderNumber: order.number,
      status: mpStatus,
      total: order.totalCents / 100,
      customerEmail: order.customerEmail,
    });
  }
}
