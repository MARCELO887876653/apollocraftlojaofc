import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// ─── Webhook Mercado Pago ───
// Sempre responde 200 rapidamente para evitar loops de retry;
// a validação real acontece na API do gateway (nunca confiamos no payload).

const mpWebhook = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const body = await request.text();
  try {
    await ctx.runAction(api.payments.handleWebhook, {
      body,
      signatureHeader: request.headers.get("x-signature") ?? undefined,
      requestId: request.headers.get("x-request-id") ?? url.searchParams.get("data_id") ?? undefined,
    });
  } catch (e) {
    console.error("[MP webhook] error:", e);
  }
  return new Response(null, { status: 200 });
});

http.route({
  path: "/webhooks/mercadopago",
  method: "POST",
  handler: mpWebhook,
});

http.route({
  path: "/webhooks/mercadopago",
  method: "GET",
  handler: httpAction(async () => new Response("ok", { status: 200 })),
});

export default http;
