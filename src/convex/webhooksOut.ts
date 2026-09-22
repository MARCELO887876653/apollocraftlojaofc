"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import crypto from "node:crypto";

/* Referências resolvidas em runtime para evitar dependência circular de tipos. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function dataApi(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./_generated/api").api.webhooksOutData;
}

// ─────────────────────────────────────────────────────────────
// Webhooks de saída — notificam sistemas externos sobre eventos
// da loja (order.paid, order.delivered, delivery.failed...)
// Assinados com HMAC-SHA256 no header X-Nexa-Signature.
// ─────────────────────────────────────────────────────────────

export const EVENTS = [
  "order.created",
  "order.paid",
  "order.delivered",
  "order.cancelled",
  "delivery.failed",
  "test",
] as const;

/** Dispara um evento para todos os webhooks inscritos. */
export const sendEvent = internalAction({
  args: {
    event: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, { event, payload }) => {
    const hooks: any[] = await ctx.runQuery(dataApi().internalListActive, {});
    if (!hooks.length) return;

    const body = JSON.stringify({ event, data: payload, timestamp: Date.now() });
    await Promise.allSettled(
      hooks.map(async (hook) => {
        if (!hook.events?.includes(event) && !hook.events?.includes("*")) return;
        const signature = crypto
          .createHmac("sha256", hook.secret)
          .update(body)
          .digest("hex");
        try {
          const res = await fetch(hook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Nexa-Event": event,
              "X-Nexa-Signature": `sha256=${signature}`,
            },
            body,
          });
          await ctx.runMutation(dataApi().log, {
            webhookId: hook._id,
            event,
            url: hook.url,
            statusCode: res.status,
            attempt: (hook.failureCount ?? 0) + 1,
          });
          if (!res.ok) {
            await ctx.runMutation(dataApi().registerFailure, {
              id: hook._id,
            });
          }
        } catch (e: any) {
          await ctx.runMutation(dataApi().log, {
            webhookId: hook._id,
            event,
            url: hook.url,
            error: e?.message ?? "network error",
            attempt: (hook.failureCount ?? 0) + 1,
          });
          await ctx.runMutation(dataApi().registerFailure, {
            id: hook._id,
          });
        }
      }),
    );
  },
});
