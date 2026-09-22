import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────
// Fila de entrega automática (runtime padrão)
// pending → processing → delivered | failed (com retry/backoff)
// ─────────────────────────────────────────────────────────────

export const internalGetDelivery = internalQuery({
  args: { id: v.id("deliveries") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const internalGetOrder = internalQuery({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

/** Processa as entregas pendentes de um pedido (agendado no pagamento). */
export const processOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const pending = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    for (const d of pending) {
      if (
        d.status === "pending" ||
        (d.status === "failed" && d.nextRetryAt && d.nextRetryAt <= Date.now())
      ) {
        await ctx.db.patch(d._id, { status: "processing", updatedAt: Date.now() });
        await ctx.scheduler.runAfter(0, internal.deliveriesQueue.executeDelivery, {
          deliveryId: d._id,
        });
      }
    }
  },
});

/** Prepara e executa uma entrega individual com placeholders substituídos. */
export const executeDelivery = internalMutation({
  args: { deliveryId: v.id("deliveries") },
  handler: async (ctx, { deliveryId }) => {
    const d: any = await ctx.db.get(deliveryId);
    if (!d) return;
    if (d.status === "delivered") return; // nunca entrega duas vezes
    const order: any = await ctx.db.get(d.orderId);
    if (!order || order.paymentStatus !== "paid") {
      // pagamento não confirmado: volta para pendente
      await ctx.db.patch(deliveryId, { status: "pending", updatedAt: Date.now() });
      return;
    }

    const product: any = await ctx.db.get(d.productId);
    const config = (product?.delivery ?? {}) as any;
    const placeholders: Record<string, string> = {
      "{player}": d.target ?? "",
      "{quantity}": String(d.quantity),
      "{order_id}": order.number,
      "{product_id}": d.productId,
    };
    const replace = (text: string) =>
      Object.entries(placeholders).reduce(
        (acc, [ph, val]) => acc.split(ph).join(val),
        text,
      );

    switch (config.type) {
      case "code": {
        // consome códigos digitais do estoque do produto
        const codes = config.codes ?? [];
        if (codes.length < d.quantity) {
          await failOrRetry(ctx, d, `Sem códigos disponíveis (precisa ${d.quantity}, há ${codes.length})`);
          return;
        }
        const consumed = codes.slice(0, d.quantity);
        await ctx.db.patch(deliveryId, {
          status: "delivered",
          deliveredAt: Date.now(),
          attempts: d.attempts + 1,
          lastError: undefined,
          payload: consumed.map((c: string) => replace(c)),
          updatedAt: Date.now(),
        });
        await ctx.db.patch(d.productId, {
          delivery: { ...config, codes: codes.slice(d.quantity) },
        });
        await finishOrderIfDone(ctx, d.orderId);
        return;
      }
      case "message": {
        await ctx.db.patch(deliveryId, {
          status: "delivered",
          deliveredAt: Date.now(),
          attempts: d.attempts + 1,
          lastError: undefined,
          payload: replace(config.message ?? ""),
          updatedAt: Date.now(),
        });
        await finishOrderIfDone(ctx, d.orderId);
        return;
      }
      case "command":
      case "api":
      case "webhook": {
        // executa via action Node (HTTP externo)
        await ctx.scheduler.runAfter(0, internal.deliveries.executeHttp, {
          deliveryId,
          type: config.type,
          url: config.apiUrl ? replace(config.apiUrl) : undefined,
          method: config.apiMethod ?? "POST",
          headers: (config.apiHeaders ?? []).map((h: any) => ({ k: h.k, v: replace(h.v) })),
          body: config.apiBody ? replace(config.apiBody) : undefined,
          commands: (config.commands ?? []).map((c: string) => replace(c)),
          orderNumber: order.number,
          productId: d.productId,
          productName: d.productName,
          target: d.target,
          quantity: d.quantity,
          attempts: d.attempts,
          orderId: d.orderId,
        });
        return; // resultado persistido pela action
      }
      case "manual":
        // aguarda o admin marcar como entregue
        await ctx.db.patch(deliveryId, {
          status: "pending",
          attempts: d.attempts + 1,
          updatedAt: Date.now(),
        });
        return;
      case "none":
      default:
        return;
    }
  },
});

async function failOrRetry(ctx: any, d: any, error: string) {
  const attempts = d.attempts + 1;
  if (attempts >= d.maxAttempts) {
    await ctx.db.patch(d._id, {
      status: "failed",
      attempts,
      lastError: error,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
      event: "delivery.failed",
      payload: { orderNumber: d.orderNumber, product: d.productName, error },
    });
    return;
  }
  // backoff exponencial: 1min, 5min, 15min, 60min
  const backoffs = [60_000, 300_000, 900_000, 3_600_000];
  const delay = backoffs[Math.min(attempts - 1, backoffs.length - 1)];
  await ctx.db.patch(d._id, {
    status: "failed",
    attempts,
    lastError: error,
    nextRetryAt: Date.now() + delay,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(delay, internal.deliveriesQueue.processOrder, {
    orderId: d.orderId,
  });
}

/** Marca sucesso (chamado pela action HTTP no Node). */
export const completeSuccess = internalMutation({
  args: {
    deliveryId: v.id("deliveries"),
    attempts: v.number(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, { deliveryId, attempts, payload }) => {
    await ctx.db.patch(deliveryId, {
      status: "delivered",
      deliveredAt: Date.now(),
      attempts,
      lastError: undefined,
      payload,
      updatedAt: Date.now(),
    });
  },
});

/** Marca falha e agenda retry com backoff (chamado pela action HTTP no Node). */
export const scheduleRetry = internalMutation({
  args: {
    deliveryId: v.id("deliveries"),
    attempts: v.number(),
    error: v.string(),
  },
  handler: async (ctx, { deliveryId, attempts, error }) => {
    const d: any = await ctx.db.get(deliveryId);
    if (!d) return;
    await failOrRetry(ctx, d, error);
  },
});

/** Finaliza o pedido quando todas as entregas terminarem. */
export const completeOrderIfDone = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await finishOrderIfDone(ctx, orderId);
  },
});

async function finishOrderIfDone(ctx: any, orderId: any) {
  const remaining = await ctx.db
    .query("deliveries")
    .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
    .collect();
  if (!remaining.every((r: any) => r.status === "delivered")) return;
  const order = await ctx.db.get(orderId);
  if (!order || order.deliveryStatus === "delivered") return;
  await ctx.db.patch(orderId, {
    deliveryStatus: "delivered",
    updatedAt: Date.now(),
    statusHistory: [
      ...order.statusHistory,
      { status: "delivered", at: Date.now(), note: "Entrega automática concluída" },
    ],
  });
  await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
    event: "order.delivered",
    payload: { orderNumber: order.number },
  });
}
