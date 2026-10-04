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
// da loja (order.created, order.paid, order.delivered...).
// Genéricos: assinados com HMAC-SHA256 no header X-Nexa-Signature.
// Discord: a URL discord.com/api/webhooks/... recebe um embed.
// ─────────────────────────────────────────────────────────────

export const EVENTS = [
  "order.created",
  "order.paid",
  "order.delivered",
  "order.cancelled",
  "delivery.failed",
  "test",
] as const;

export const DISCORD_URL_RE = /discord(?:app)?\.com\/api\/webhooks\//i;

const DISCORD_TITLES: Record<string, string> = {
  "order.created": "🛒 Novo pedido",
  "order.paid": "✅ Pagamento aprovado",
  "order.delivered": "📦 Entrega concluída",
  "order.cancelled": "❌ Pedido cancelado",
  "delivery.failed": "⚠️ Falha na entrega",
  test: "🔔 Teste de webhook",
};

const DISCORD_COLORS: Record<string, number> = {
  "order.created": 0x38bdf8,
  "order.paid": 0x22c55e,
  "order.delivered": 0x0ea5e9,
  "order.cancelled": 0xef4444,
  "delivery.failed": 0xf59e0b,
  test: 0x8b5cf6,
};

/** Monta o corpo enviado. Discord recebe embed; o resto recebe JSON assinado. */
export function buildBody(event: string, payload: Record<string, any>, url: string) {
  if (DISCORD_URL_RE.test(url)) {
    const fields = Object.entries(payload ?? {})
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .slice(0, 24)
      .map(([key, value]) => ({
        name: key,
        value: (typeof value === "object" ? JSON.stringify(value) : String(value)).slice(0, 1024),
        inline: false,
      }));
    return JSON.stringify({
      embeds: [
        {
          title: DISCORD_TITLES[event] ?? event,
          color: DISCORD_COLORS[event] ?? 0x38bdf8,
          fields,
          footer: { text: "Apollo Craft" },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }
  return JSON.stringify({ event, data: payload, timestamp: Date.now() });
}

/** Dispara um evento para todos os webhooks inscritos. */
export const sendEvent = internalAction({
  args: {
    event: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, { event, payload }) => {
    const hooks: any[] = await ctx.runQuery(dataApi().internalListActive, {});
    if (!hooks.length) return;

    await Promise.allSettled(
      hooks.map(async (hook) => {
        if (!hook.events?.includes(event) && !hook.events?.includes("*")) return;
        const body = buildBody(event, payload ?? {}, hook.url);
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
