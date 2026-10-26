import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAdmin, logAudit } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Admin: fila de entregas (listar, reprocessar, marcar entregue)
// ─────────────────────────────────────────────────────────────

// Página por vez (cursor opaco do Convex), mais recentes primeiro. Antes a
// consulta lia o histórico INTEIRO de entregas para desenhar uma tabela.
const PAGE_SIZE = 50;

export const adminList = query({
  args: {
    status: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, cursor, limit }) => {
    await requireAdmin(ctx, "deliveries.view");
    const numItems = Math.min(Math.max(Math.floor(limit ?? PAGE_SIZE), 1), 100);
    const result = await (status
      ? ctx.db
          .query("deliveries")
          .withIndex("by_status_createdAt", (q) => q.eq("status", status as any))
          .order("desc")
      : ctx.db.query("deliveries").withIndex("by_createdAt").order("desc")
    ).paginate({ cursor: cursor ?? null, numItems });

    // A tabela do painel não usa o payload da entrega (códigos/mensagens);
    // removê-lo evita trafegar documentos grandes linha a linha.
    return {
      page: result.page.map((d) => ({
        _id: d._id,
        orderNumber: d.orderNumber,
        productName: d.productName,
        type: d.type,
        target: d.target,
        quantity: d.quantity,
        status: d.status,
        attempts: d.attempts,
        maxAttempts: d.maxAttempts,
        lastError: d.lastError,
        createdAt: d.createdAt,
        deliveredAt: d.deliveredAt,
      })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
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
