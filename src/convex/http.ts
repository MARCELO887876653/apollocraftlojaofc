import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
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

// ─── API pública para sistemas externos (autenticada por API key) ───
// Usada por plugins de servidor Minecraft, bots Discord etc. para consultar
// pedidos e registrar entregas sem acessar o painel.

const externalApi = httpAction(async (ctx, request) => {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? request.headers.get("x-api-key")
    ?? "";
  const url = new URL(request.url);
  const bodyText = request.method === "POST" ? await request.text() : "";
  try {
    const result = await ctx.runAction(api.externalApi.handle, {
      key,
      path: url.pathname.replace(/^\/api\/external/, "") || "/",
      bodyText,
    });
    return Response.json(result.body ?? { ok: true }, { status: result.status });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: e?.message ?? "Erro interno" },
      { status: 500 },
    );
  }
});

for (const method of ["GET", "POST"] as const) {
  http.route({
    pathPrefix: "/api/external/",
    method,
    handler: externalApi,
  });
}

// ─── API v1 — integração de entrega automática p/ addons Minecraft ───
// Rotas documentadas em /docs/api (arquivo e página pública).

const apiV1 = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const bodyText = request.method === "GET" ? "" : await request.text();
  try {
    const result: any = await ctx.runAction(internal.apiV1.handle, {
      method: request.method,
      path: url.pathname.replace(/^\/api\/v1/, ""),
      token: request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "",
      bodyText,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    });
    return Response.json(result.body, {
      status: result.status,
      headers: result.headers ?? {},
    });
  } catch (e: any) {
    return Response.json(
      { errors: [{ message: "Erro interno.", code: "INTERNAL_ERROR" }] },
      { status: 500 },
    );
  }
});

for (const method of ["GET", "POST", "PATCH"] as const) {
  http.route({
    pathPrefix: "/api/v1/",
    method,
    handler: apiV1,
  });
}

export default http;
