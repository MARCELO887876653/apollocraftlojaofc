"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

/* Referências resolvidas em runtime para evitar dependência circular de tipos. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function dataApi(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./_generated/api").api.externalApiData;
}

function json(status: number, body: any) {
  return { status, body };
}

// ─────────────────────────────────────────────────────────────
// API pública para integrações externas (plugin Minecraft, bots…)
// Autenticação: header `Authorization: Bearer ak_live_...` ou `X-Api-Key`.
// Endpoints:
//   GET  /me                → valida a chave e devolve a integração
//   GET  /orders/pending    → pedidos pagos com entregas pendentes
//   POST /deliveries        → registra entrega: { orderNumber, productId,
//                             commands?, payload?, markDelivered? }
//   POST /deliveries/failed → marca falha: { orderNumber, productId, error }
// ─────────────────────────────────────────────────────────────

export const handle = action({
  args: {
    key: v.string(),
    path: v.string(),
    bodyText: v.string(),
  },
  handler: async (ctx, { key, path, bodyText }) => {
    // 1. autenticação
    if (!key) return json(401, { ok: false, error: "API key ausente" });
    const integration: any = await ctx.runQuery(dataApi().findKey, { key });
    if (!integration) return json(401, { ok: false, error: "API key inválida" });

    let body: any = {};
    if (bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        return json(400, { ok: false, error: "JSON inválido" });
      }
    }

    const route = path.replace(/\/+$/, "") || "/";

    if (route === "/me" || route === "/") {
      return json(200, {
        ok: true,
        integration: { name: integration.name, createdAt: integration.createdAt },
      });
    }

    if (route === "/orders/pending") {
      const orders: any[] = await ctx.runQuery(dataApi().listPendingForProduct, {});
      return json(200, { ok: true, orders });
    }

    if (route === "/deliveries" && typeof body.orderNumber === "string") {
      if (!body.productId) {
        return json(400, { ok: false, error: "productId é obrigatório" });
      }
      const res: any = await ctx.runMutation(dataApi().registerExternalDelivery, {
        orderNumber: body.orderNumber,
        productId: body.productId,
        commands: Array.isArray(body.commands) ? body.commands.map(String) : undefined,
        payload: body.payload,
      });
      if (!res.ok) return json(res.status ?? 400, { ok: false, error: res.error });
      return json(200, { ok: true, delivered: res.delivered });
    }

    if (route === "/deliveries/failed" && typeof body.orderNumber === "string") {
      if (!body.productId) {
        return json(400, { ok: false, error: "productId é obrigatório" });
      }
      const res: any = await ctx.runMutation(dataApi().registerExternalFailure, {
        orderNumber: body.orderNumber,
        productId: body.productId,
        error: String(body.error ?? "Falha reportada pela integração"),
      });
      if (!res.ok) return json(res.status ?? 400, { ok: false, error: res.error });
      return json(200, { ok: true });
    }

    return json(404, { ok: false, error: `Rota desconhecida: ${route}` });
  },
});
