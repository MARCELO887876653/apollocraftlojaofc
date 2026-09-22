import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAdmin, logAudit } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Admin: fila de entregas (listar, reprocessar, marcar entregue)
// ─────────────────────────────────────────────────────────────

export const adminList = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx, "deliveries.view");
    let list = await ctx.db.query("deliveries").collect();
    if (status) list = list.filter((d) => d.status === status);
    return list.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminRetry = mutation({
  args: { id: v.id("deliveries") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    const d = await ctx.db.get(id);
    if (!d) throw new Error("Entrega não encontrada");
    if (d.status === "delivered") throw new Error("Entrega já concluída");
    await ctx.db.patch(id, { status: "pending", nextRetryAt: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.deliveriesQueue.processOrder, { orderId: d.orderId });
    await logAudit(ctx, admin, "delivery.retry", "delivery", id, { order: d.orderNumber });
  },
});

export const adminMarkDelivered = mutation({
  args: { id: v.id("deliveries") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    const d = await ctx.db.get(id);
    if (!d) throw new Error("Entrega não encontrada");
    if (d.status === "delivered") return;
    await ctx.db.patch(id, {
      status: "delivered",
      deliveredAt: Date.now(),
      updatedAt: Date.now(),
    });
    // recalcula status do pedido (mesma lógica de maybeCompleteOrder)
    const remaining = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", d.orderId))
      .collect();
    if (remaining.every((r) => r.status === "delivered")) {
      const order = await ctx.db.get(d.orderId);
      if (order && order.deliveryStatus !== "delivered") {
        await ctx.db.patch(d.orderId, {
          deliveryStatus: "delivered",
          updatedAt: Date.now(),
          statusHistory: [
            ...order.statusHistory,
            { status: "delivered", at: Date.now(), note: "Entrega concluída" },
          ],
        });
      }
    }
    await logAudit(ctx, admin, "delivery.mark_delivered", "delivery", id, { order: d.orderNumber });
  },
});
