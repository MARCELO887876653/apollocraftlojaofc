import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import { sha256Hex, tokenPrefix } from "./lib/hash";
import { hotRouteResponse, resolveHotRoute } from "./lib/apiV1HotRoute";

const http = httpRouter();

auth.addHttpRoutes(http);

// ─── CORS (chamadas de navegador entre origens) ───
// O addon (BDS/Node) NÃO precisa de CORS. Isto habilita consumidores de
// navegador (ex.: testar /api/v1 pela página /docs/api) sem afetar em nada as
// verificações de autenticação/autorização, que continuam rodando no servidor.
const ALLOWED_ORIGINS = new Set([
  "https://apollocraft.online",
  "https://www.apollocraft.online",
]);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    // Preview do Freebuff e desenvolvimento local.
    if (hostname.endsWith(".vly.sh")) return true;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return protocol === "http:" || protocol === "https:";
    }
  } catch {
    // origem malformada → não autorizada
  }
  return false;
}

function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
  };
  const origin = request.headers.get("origin") ?? "";
  if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

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

// ─── API v1 (fila de entregas automáticas) ───
// Autenticada por `Authorization: Bearer sk_live_...` (ou X-Api-Key).
// GET /api/v1/app/queued_commands
// POST /api/v1/app/queued_commands/claim
// GET /api/v1/app/user_queue/{id}
// GET /api/v1/app/user_schedules/{id}
// PATCH /api/v1/app/command/{id}
// POST /api/v1/app/heartbeat
// GET /api/v1/app/me

const apiV1 = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const xApiKey = (request.headers.get("x-api-key") ?? "").trim();
  const token = bearer || xApiKey;
  // Se os dois cabeçalhos vierem com valores DIFERENTES, é ambíguo → rejeita.
  const ambiguousAuth = Boolean(bearer && xApiKey && bearer !== xApiKey);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, k) => {
    query[k] = value;
  });
  const bodyText = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method)
    ? await request.text()
    : undefined;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;

  // ── Rotas quentes: autenticação + trabalho numa ÚNICA mutation ──
  //
  // O Convex cobra por chamada de função. Antes, uma requisição do addon
  // custava TRÊS: este httpAction, a action `apiV1.handle` (que só roteava e
  // traduzia a resposta) e a mutation `internalAuthorizedCall`. Chamando a
  // mutation direto daqui, a mesma requisição custa DUAS. É o caso de
  // `sync/changes`, `queued_commands`, `queued_commands/claim` e `heartbeat`.
  //
  // Nada de segurança muda: a mutation continua checando hash da chave,
  // revogação, prefixo do token, rate limit, `lastUsedAt` e scope. O roteamento
  // vem do MESMO resolvedor puro usado pela action (lib/apiV1HotRoute), então
  // não há regra duplicada. Corpo inválido, token ausente ou autenticação
  // ambígua caem no caminho antigo (`apiV1.handle`), com a resposta idêntica.
  const hot =
    token && !ambiguousAuth
      ? resolveHotRoute({
          method: request.method,
          path: url.pathname,
          query,
          bodyText,
        })
      : null;
  if (hot) {
    try {
      const res = await ctx.runMutation(internal.apiV1Data.internalAuthorizedCall, {
        hash: sha256Hex(token),
        expectedPrefix: tokenPrefix(token),
        tokenIsLive: token.startsWith("sk_live_"),
        bucket: hot.bucket,
        rateLimit: hot.rateLimit,
        windowMs: hot.windowMs,
        method: request.method,
        path: url.pathname,
        ip,
        kind: hot.kind,
        ...hot.args,
      });
      const out = hotRouteResponse(res);
      return Response.json(out.body ?? {}, {
        status: out.status,
        headers: { ...out.headers, ...corsHeaders(request) },
      });
    } catch (e: any) {
      console.error("[api/v1] hot route error:", e);
      // Mesmo desfecho do caminho antigo: registra o erro e responde 500.
      try {
        await ctx.runMutation(internal.apiV1Data.internalLog, {
          endpoint: url.pathname,
          method: request.method,
          statusCode: 500,
          durationMs: 0,
          ip,
          error: e?.message ?? "internal error",
        });
      } catch {
        // o log nunca derruba a resposta
      }
      return Response.json(
        { errors: [{ message: "Erro interno no servidor.", code: "INTERNAL_ERROR" }] },
        { status: 500, headers: corsHeaders(request) },
      );
    }
  }

  try {
    const result = await ctx.runAction(api.apiV1.handle, {
      method: request.method,
      path: url.pathname,
      token,
      bodyText,
      query,
      ip,
      idempotencyKey,
      ambiguousAuth,
    });
    return Response.json(result.body ?? {}, {
      status: result.status,
      headers: { ...(result.headers ?? {}), ...corsHeaders(request) },
    });
  } catch (e) {
    console.error("[api/v1] error:", e);
    return Response.json(
      { errors: [{ message: "Erro interno no servidor.", code: "INTERNAL_ERROR" }] },
      { status: 500, headers: corsHeaders(request) },
    );
  }
});

for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
  http.route({
    pathPrefix: "/api/v1/",
    method,
    handler: apiV1,
  });
}

// Preflight CORS: responde ANTES de qualquer autenticação (o navegador não
// envia credenciais no OPTIONS) e nunca toca em dados.
http.route({
  pathPrefix: "/api/v1/",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }),
});

export default http;
