import { internalQuery, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAdmin, logAudit } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Dados da API externa (runtime padrão) — usados por externalApi.ts
// ─────────────────────────────────────────────────────────────

/** Autentica a chave (constante-time-ish: compara prefixo + chave exata). */
export const findKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const prefix = key.slice(0, 12);
    const doc = await ctx.db
      .query("apiKeys")
      .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
      .first();
    if (!doc || !doc.active || doc.key !== key) return null;
    return doc;
  },
});

/** Pedidos pagos com entregas pendentes (para o sistema externo puxar). */
export const listPendingForProduct = internalQuery({
  args: {},
  handler: async (ctx) => {
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_status_retry", (q) => q.eq("status", "pending"))
      .collect();
    const byOrder = new Map<any, any[]>();
    const ordersCache = new Map<any, any>();
    for (const d of deliveries) {
      let order = ordersCache.get(d.orderId);
      if (order === undefined) {
        order = await ctx.db.get(d.orderId);
        ordersCache.set(d.orderId, order);
      }
      if (!order || order.paymentStatus !== "paid") continue;
      if (!byOrder.has(d.orderId)) byOrder.set(d.orderId, []);
      byOrder.get(d.orderId)!.push({
        productId: d.productId,
        productName: d.productName,
        quantity: d.quantity,
        target: d.target,
        type: d.type,
        createdAt: d.createdAt,
      });
    }
    const orders: any[] = [];
    for (const [orderId, items] of byOrder) {
      const order = ordersCache.get(orderId);
      orders.push({
        orderId,
        orderNumber: order.number,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        minecraftNick: order.minecraftNick,
        discord: order.discord,
        createdAt: order.createdAt,
        items,
      });
    }
    return orders.sort((a, b) => a.createdAt - b.createdAt);
  },
});

/** Registra entrega vinda de sistema externo (ex.: plugin executou os comandos). */
export const registerExternalDelivery = internalMutation({
  args: {
    orderNumber: v.string(),
    productId: v.id("products"),
    commands: v.optional(v.array(v.string())),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, { orderNumber, productId, commands, payload }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_number", (q) => q.eq("number", orderNumber))
      .first();
    if (!order) return { ok: false as const, status: 404, error: "Pedido não encontrado" };
    if (order.paymentStatus !== "paid") {
      return { ok: false as const, status: 409, error: "Pedido ainda não está pago" };
    }

    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const targets = deliveries.filter(
      (d) => d.productId === productId && d.status !== "delivered",
    );
    if (targets.length === 0) {
      const exists = deliveries.some((d) => d.productId === productId);
      if (exists) return { ok: true as const, delivered: 0 };
      return { ok: false as const, status: 404, error: "Nenhuma entrega pendente para este produto" };
    }

    const now = Date.now();
    for (const d of targets) {
      await ctx.db.patch(d._id, {
        status: "delivered",
        deliveredAt: now,
        attempts: d.attempts + 1,
        lastError: undefined,
        nextRetryAt: undefined,
        payload: payload ?? commands ?? `Entregue por integração externa (${now})`,
        updatedAt: now,
      });
    }

    // finaliza o pedido se todas as entregas terminaram
    const remaining = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    if (remaining.every((r) => r.status === "delivered") && order.deliveryStatus !== "delivered") {
      await ctx.db.patch(order._id, {
        deliveryStatus: "delivered",
        updatedAt: now,
        statusHistory: [
          ...order.statusHistory,
          { status: "delivered", at: now, note: "Entrega concluída via API externa" },
        ],
      });
    }

    return { ok: true as const, delivered: targets.length };
  },
});

/** Marca falha reportada por sistema externo (agenda retry com backoff). */
export const registerExternalFailure = internalMutation({
  args: {
    orderNumber: v.string(),
    productId: v.id("products"),
    error: v.string(),
  },
  handler: async (ctx, { orderNumber, productId, error }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_number", (q) => q.eq("number", orderNumber))
      .first();
    if (!order) return { ok: false as const, status: 404, error: "Pedido não encontrado" };

    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const targets = deliveries.filter(
      (d) => d.productId === productId && d.status !== "delivered",
    );
    if (targets.length === 0) {
      return { ok: false as const, status: 404, error: "Nenhuma entrega pendente para este produto" };
    }

    const now = Date.now();
    for (const d of targets) {
      const attempts = d.attempts + 1;
      const backoffs = [60_000, 300_000, 900_000, 3_600_000];
      const delay = backoffs[Math.min(attempts - 1, backoffs.length - 1)];
      await ctx.db.patch(d._id, {
        status: "failed",
        attempts,
        lastError: error,
        nextRetryAt: now + delay,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(delay, internal.deliveriesQueue.processOrder, {
        orderId: order._id,
      });
    }
    return { ok: true as const };
  },
});

// ─── Admin: testar chave rapidamente ───

export const adminTouchKey = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "integrations.manage");
    await ctx.db.patch(id, { lastUsedAt: Date.now() });
    await logAudit(ctx, null, "apikey.touch", "apiKey", id);
  },
});
