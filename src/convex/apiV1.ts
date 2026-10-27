import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { sha256Hex, tokenPrefix } from "./lib/hash";
import { API_SCOPES } from "./lib/apiSchema";
import {
  GET_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  WRITE_RATE_LIMIT,
  hotRouteResponse,
  resolveHotRoute,
} from "./lib/apiV1HotRoute";

// ─────────────────────────────────────────────────────────────
// API v1 — roteador HTTP
//
// Autenticação: header `Authorization: Bearer sk_live_...`
// (o http.ts também aceita `X-Api-Key`). A chave nunca vem pela URL.
// Erros no padrão: { errors: [{ message, code }] }.
// Rate limit: GET 120/min, POST/PATCH 30/min (por chave).
// ─────────────────────────────────────────────────────────────

type ApiResult = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

function ok(body: unknown, headers: Record<string, string> = {}): ApiResult {
  return { status: 200, body, headers };
}

function fail(status: number, code: string, message: string, headers: Record<string, string> = {}): ApiResult {
  return { status, body: { errors: [{ message, code }] }, headers };
}

export const handle = action({
  args: {
    method: v.string(),
    path: v.string(),
    token: v.string(),
    bodyText: v.optional(v.string()),
    query: v.optional(v.any()),
    ip: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    ambiguousAuth: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { method, path, token, bodyText, query, ip, idempotencyKey, ambiguousAuth },
  ): Promise<ApiResult> => {
    const started = Date.now();
    const q = (query ?? {}) as Record<string, string>;

    // Rota (cálculo puro) — necessária antes da autenticação para escolher
    // entre o caminho fundido e o caminho antigo.
    const segs = path.split("/").filter(Boolean);
    const isV1 = segs[0] === "api" && segs[1] === "v1";
    const afterV1 = isV1 ? segs.slice(2) : [];
    const isApp = afterV1[0] === "app";
    const rest = isApp ? afterV1.slice(1) : afterV1;
    const route = rest.join("/");

    // ── 0. Cabeçalhos de autenticação ambíguos ──
    if (ambiguousAuth) {
      return fail(
        400,
        "AMBIGUOUS_AUTH",
        "Envie apenas um método de autenticação: 'Authorization: Bearer' OU 'X-Api-Key'.",
      );
    }

    // ── 1. Autenticação + rate limit + último uso + log amostrado ──
    if (!token) {
      return fail(401, "MISSING_API_KEY", "Cabeçalho Authorization com Bearer token ausente.");
    }

    // ── 1b. Rotas quentes (todo o tráfego do addon) ──
    //
    // Autentica E executa numa única mutation, com o MESMO roteamento puro
    // usado pelo httpAction (lib/apiV1HotRoute). O httpAction chama a mutation
    // direto (2 chamadas de função por requisição); este bloco continua aqui
    // para quem passa pela action — chamadas internas e testes — com
    // comportamento idêntico. Corpo inválido cai no caminho antigo, que
    // responde o mesmo 422 de antes.
    const hot = resolveHotRoute({ method, path, query: q, bodyText });
    if (hot) {
      try {
        const res = await ctx.runMutation(internal.apiV1Data.internalAuthorizedCall, {
          hash: sha256Hex(token),
          expectedPrefix: tokenPrefix(token),
          tokenIsLive: token.startsWith("sk_live_"),
          bucket: hot.bucket,
          rateLimit: hot.rateLimit,
          windowMs: hot.windowMs,
          method,
          path,
          ip,
          kind: hot.kind,
          ...hot.args,
        });
        return hotRouteResponse(res);
      } catch (e: any) {
        // Mesma resposta estruturada de antes para falha inesperada.
        try {
          await ctx.runMutation(internal.apiV1Data.internalLog, {
            endpoint: path,
            method,
            statusCode: 500,
            durationMs: Date.now() - started,
            ip,
            error: e?.message ?? "internal error",
          });
        } catch {
          // o log nunca derruba a resposta
        }
        return fail(500, "INTERNAL_ERROR", "Erro interno no servidor.");
      }
    }

    const isWrite = method !== "GET";
    const limit = isWrite ? WRITE_RATE_LIMIT : GET_RATE_LIMIT;
    const bucket = isWrite ? "write" : "read";

    const auth = await ctx.runMutation(internal.apiV1Data.internalAuthorize, {
      hash: sha256Hex(token),
      bucket,
      limit,
      windowMs: RATE_LIMIT_WINDOW_MS,
      method,
      path,
      ip,
    });
    if (!auth.ok) {
      return auth.code === "API_KEY_REVOKED"
        ? fail(401, "API_KEY_REVOKED", "Esta chave de API foi revogada ou desativada.")
        : fail(401, "INVALID_API_KEY", "Chave de API inválida.");
    }
    const key = auth.key;
    if (!token.startsWith("sk_live_") || key.prefix !== tokenPrefix(token)) {
      return fail(401, "INVALID_API_KEY", "Chave de API inválida.");
    }

    // ── 2. Rota (já calculada acima) ──
    const log = async (statusCode: number, error?: string, deliveryId?: string) => {
      // Sucesso não é logado: a autorização já grava 1 amostra por minuto.
      // Só erros (>= 400) entram em `apiLogs`, que é o que interessa no painel.
      if (statusCode < 400) return;
      try {
        await ctx.runMutation(internal.apiV1Data.internalLog, {
          apiKeyId: key.id,
          serverId: key.serverId,
          addonId: key.addonId,
          deliveryId,
          endpoint: path,
          method,
          statusCode,
          durationMs: Date.now() - started,
          ip,
          error,
        });
      } catch {
        // nunca deixa o log derrubar a resposta
      }
    };

    if (!isV1 || rest.length === 0) {
      await log(404, "unknown route");
      return fail(404, "NOT_FOUND", `Rota desconhecida: ${path}`);
    }

    // ── 3. Rate limit (já aplicado na autorização; headers abaixo) ──
    const rl = auth.rate;
    const rlHeaders: Record<string, string> = {
      "X-RateLimit-Limit": String(rl.limit),
      "X-RateLimit-Remaining": String(rl.remaining),
    };
    if (!rl.allowed) {
      await log(429, "rate limit");
      return fail(429, "RATE_LIMIT_REACHED", "Limite de requisições excedido.", {
        ...rlHeaders,
        "Retry-After": String(rl.retryAfterSec),
      });
    }

    const scopes: string[] = key.scopes ?? [];
    const requireScope = (scope: string): ApiResult | null =>
      scopes.includes(scope)
        ? null
        : fail(403, "FORBIDDEN_SCOPE", `A chave não possui a permissão '${scope}'.`, rlHeaders);
    const requireAnyScope = (list: string[]): ApiResult | null =>
      list.some((s) => scopes.includes(s))
        ? null
        : fail(
            403,
            "FORBIDDEN_SCOPE",
            `A chave precisa de uma das permissões: ${list.join(", ")}.`,
            rlHeaders,
          );

    type Parsed = { ok: true; value: Record<string, any> } | { ok: false; result: ApiResult };
    const parseBody = (): Parsed => {
      if (!bodyText) return { ok: true, value: {} };
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return {
            ok: false,
            result: fail(422, "INVALID_PAYLOAD", "O corpo da requisição deve ser um objeto JSON."),
          };
        }
        return { ok: true, value: parsed };
      } catch {
        return {
          ok: false,
          result: fail(422, "INVALID_PAYLOAD", "JSON inválido no corpo da requisição."),
        };
      }
    };

    const effectiveServerId = key.serverId || "GLOBAL";
    const effectiveAddonId = key.addonId || undefined;

    try {
      // ── GET /me — handshake da integração (usado no botão "Testar conexão") ──
      if (route === "me" && method === "GET") {
                await log(200);
        const canWriteCatalog = scopes.some(
          (s) => s.startsWith("products:") || s.startsWith("categories:"),
        );
        return ok(
          {
            // campos legados (compatibilidade com integrações já existentes)
            name: key.name,
            server_id: effectiveServerId,
            addon_id: key.addonId ?? null,
            // handshake estruturado
            api_version: "v1",
            authenticated: true,
            key: {
              id: String(key.id),
              name: key.name,
              // nunca o token completo nem o hash
              prefix: key.prefix,
              last_four: key.lastFour,
              scopes,
            },
            binding: {
              server_id: effectiveServerId,
              addon_id: key.addonId ?? null,
            },
            server_time: new Date().toISOString(),
            capabilities: {
              delivery_claim: true,
              catalog_write: canWriteCatalog,
              local_reference: true,
              delivery_recipe_version: 1,
              supported_delivery_recipe_versions: [1],
              supports_claim: true,
              supports_local_reference: true,
              supports_upsert: true,
              supports_sync: true,
            },
            scopes,
            created_at: new Date(key.createdAt).toISOString(),
            last_used_at: new Date().toISOString(),
          },
          rlHeaders,
        );
      }

      // ── GET /queued_commands ──
      if (route === "queued_commands" && method === "GET") {
        const denied = requireScope(API_SCOPES.deliveriesRead);
        if (denied) { await log(denied.status, "scope"); return { ...denied, headers: { ...denied.headers, ...rlHeaders } }; }
        const addonFilter = effectiveAddonId ?? (q.addon_id || undefined);
        const limitN = Math.min(Number(q.limit) || 50, 200);
        const data = await ctx.runQuery(internal.deliveryCommands.internalListQueued, {
          serverId: effectiveServerId,
          addonId: addonFilter,
          limit: limitN,
          now: Date.now(),
        });
                await log(200);
        return ok(data, rlHeaders);
      }

      // ── POST /queued_commands/claim ──
      // Scope oficial: deliveries:claim. Aceita deliveries:update para
      // compatibilidade com chaves antigas (documentado como legado).
      if (route === "queued_commands/claim" && method === "POST") {
        const denied = requireAnyScope([API_SCOPES.deliveriesClaim, API_SCOPES.deliveriesUpdate]);
        if (denied) { await log(denied.status, "scope"); return { ...denied, headers: { ...denied.headers, ...rlHeaders } }; }
        const parsed = parseBody();
        if (!parsed.ok) {
          await log(422, "invalid body");
          return { ...parsed.result, headers: rlHeaders };
        }
        const body = parsed.value;
        const addonFilter = effectiveAddonId ?? (body.addon_id || undefined);
        const limitN = Math.min(Number(body.limit) || 20, 100);
        const claimed = await ctx.runMutation(internal.apiV1Data.internalClaim, {
          apiKeyId: key.id,
          serverId: effectiveServerId,
          addonId: addonFilter,
          limit: limitN,
        });
                await log(200);
        return ok({ data: claimed, count: claimed.length }, rlHeaders);
      }

      // ── GET /user_queue/{id} ──
      if (rest[0] === "user_queue" && rest[1] && method === "GET") {
        const denied = requireScope(API_SCOPES.usersQueue);
        if (denied) { await log(denied.status, "scope"); return { ...denied, headers: { ...denied.headers, ...rlHeaders } }; }
        const client = decodeURIComponent(rest[1]);
        const data = await ctx.runQuery(internal.deliveryCommands.internalUserQueue, {
          clientIdentifier: client,
          serverId: effectiveServerId,
          now: Date.now(),
        });
        await log(200);
        return ok(data, rlHeaders);
      }

      // ── GET /user_schedules/{id} ──
      if (rest[0] === "user_schedules" && rest[1] && method === "GET") {
        const denied = requireScope(API_SCOPES.usersSchedules);
        if (denied) { await log(denied.status, "scope"); return { ...denied, headers: { ...denied.headers, ...rlHeaders } }; }
        const client = decodeURIComponent(rest[1]);
        const data = await ctx.runQuery(internal.deliveryCommands.internalUserSchedules, {
          clientIdentifier: client,
          serverId: effectiveServerId,
          now: Date.now(),
        });
        await log(200);
        return ok(data, rlHeaders);
      }

      // ── PATCH /command/{id} ──
      if (rest[0] === "command" && rest[1] && method === "PATCH") {
        const denied = requireScope(API_SCOPES.deliveriesUpdate);
        if (denied) { await log(denied.status, "scope"); return { ...denied, headers: { ...denied.headers, ...rlHeaders } }; }
        const deliveryId = decodeURIComponent(rest[1]);
        const parsed = parseBody();
        if (!parsed.ok) {
          await log(422, "invalid body");
          return { ...parsed.result, headers: rlHeaders };
        }
        const body = parsed.value;
        const status = String(body.status ?? "");
        const allowed = ["DONE", "FAILED", "PENDING", "CANCELED"];
        if (!allowed.includes(status)) {
          await log(422, "invalid status");
          return fail(
            422,
            "INVALID_PAYLOAD",
            "status deve ser um de: DONE, FAILED, PENDING, CANCELED.",
            rlHeaders,
          );
        }
        const res = await ctx.runMutation(internal.apiV1Data.internalConfirm, {
          publicId: deliveryId,
          status: status as "DONE" | "FAILED" | "PENDING" | "CANCELED",
          response: body.response ? String(body.response).slice(0, 2000) : undefined,
          reason: body.reason ? String(body.reason).slice(0, 2000) : undefined,
          errorCode: body.error_code ? String(body.error_code).slice(0, 64) : undefined,
          retryable: typeof body.retryable === "boolean" ? body.retryable : undefined,
          claimToken: body.claim_token ? String(body.claim_token) : undefined,
          apiKeyId: key.id,
          serverId: effectiveServerId,
          addonId: effectiveAddonId,
        });
        if (!res.ok) {
          const code = (res as any).code;
          if (code === "CLAIM_INVALID") {
            await log(409, "claim invalid", deliveryId);
            return fail(409, "CLAIM_INVALID", "claim_token inválido para esta entrega. Refaça o claim.", rlHeaders);
          }
          if (code === "CLAIM_EXPIRED") {
            await log(409, "claim expired", deliveryId);
            return fail(409, "CLAIM_EXPIRED", "O claim expirou. A entrega voltou para a fila; refaça o claim.", rlHeaders);
          }
          if (code === "FORBIDDEN") {
            await log(403, "forbidden", deliveryId);
            return fail(403, "FORBIDDEN_OBJECT", "Esta entrega pertence a outro servidor/addon.", rlHeaders);
          }
          await log(404, "not found", deliveryId);
          return fail(404, "DELIVERY_NOT_FOUND", "Entrega não encontrada.", rlHeaders);
        }
                await log(200, undefined, deliveryId);
        return ok(
          {
            id: deliveryId,
            status: res.status,
            updated: true,
            error_code: (res as any).errorCode ?? null,
            retry_in_ms: (res as any).retryInMs ?? null,
            permanent: (res as any).permanent ?? false,
          },
          rlHeaders,
        );
      }

      // ── POST /heartbeat ──
      if (route === "heartbeat" && method === "POST") {
        const denied = requireScope(API_SCOPES.serverHeartbeat);
        if (denied) { await log(denied.status, "scope"); return { ...denied, headers: { ...denied.headers, ...rlHeaders } }; }
        const parsed = parseBody();
        if (!parsed.ok) {
          await log(422, "invalid body");
          return { ...parsed.result, headers: rlHeaders };
        }
        const body = parsed.value;
        const serverId = String(body.server_id || effectiveServerId);
        const result = await ctx.runMutation(internal.apiV1Data.internalHeartbeat, {
          serverId,
          addonId: effectiveAddonId,
          version: body.version || body.addon_version ? String(body.version ?? body.addon_version) : undefined,
          minecraftVersion: body.minecraft_version
            ? String(body.minecraft_version)
            : undefined,
          apiClientVersion: body.api_client_version
            ? String(body.api_client_version)
            : undefined,
          capabilities: body.capabilities ?? undefined,
          errorCode: body.error_code ? String(body.error_code) : undefined,
          ip,
        });
                await log(200);
        return ok({ ...result, server_id: serverId, online: true }, rlHeaders);
      }

      // ─── Catálogo pela API (categorias / produtos / receita / imagens) ───
      const catMeta = {
        apiKeyId: String(key.id),
        keyName: key.name,
        serverId: effectiveServerId,
        addonId: effectiveAddonId,
        idempotencyKey,
        createdSource: key.addonId ? "MINECRAFT_ADDON" : "API",
      };
      const scopeDenied = (denied: ApiResult | null) =>
        denied ? { ...denied, headers: { ...denied.headers, ...rlHeaders } } : null;
      const withBody = () => {
        const parsed = parseBody();
        return parsed.ok
          ? parsed
          : { ok: false as const, res: { ...parsed.result, headers: rlHeaders } };
      };

      // ── Idempotency-Key persistente (replay seguro) ──
      const requestHash = sha256Hex(`${method}:${path}:${bodyText ?? ""}`);
      const idemReplay = async (): Promise<ApiResult | null> => {
        if (!idempotencyKey) return null;
        const prior = await ctx.runQuery(internal.apiV1Data.internalIdempotencyGet, {
          apiKeyId: key.id,
          key: idempotencyKey,
        });
        if (!prior) return null;
        if (prior.requestHash !== requestHash) {
          return fail(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "Esta Idempotency-Key já foi usada com um corpo diferente.",
            rlHeaders,
          );
        }
        return { status: prior.status, body: prior.response, headers: rlHeaders };
      };
      const idemStore = async (statusCode: number, responseBody: unknown, resourceId?: string) => {
        if (!idempotencyKey) return;
        try {
          await ctx.runMutation(internal.apiV1Data.internalIdempotencyStore, {
            apiKeyId: key.id,
            key: idempotencyKey,
            method,
            endpoint: path,
            requestHash,
            status: statusCode,
            response: responseBody,
            resourceId,
          });
        } catch {
          // a idempotência nunca derruba a resposta principal
        }
      };

      // POST /api/v1/files/upload-url  |  POST /api/v1/files/finalize
      if (rest[0] === "files" && method === "POST") {
        const denied = scopeDenied(
          requireAnyScope([
            API_SCOPES.productsCreate,
            API_SCOPES.productsUpdate,
            API_SCOPES.categoriesCreate,
            API_SCOPES.categoriesUpdate,
          ]),
        );
        if (denied) { await log(denied.status, "scope"); return denied; }
        if (rest[1] === "upload-url") {
          const uploadUrl = await ctx.runMutation(internal.apiV1Files.internalGenerateUploadUrl, {});
          await log(200);
          return ok({ upload_url: uploadUrl }, rlHeaders);
        }
        if (rest[1] === "finalize") {
          const parsed = withBody();
          if (!parsed.ok) { await log(422, "invalid body"); return parsed.res; }
          const storageId = String(parsed.value.storage_id ?? "");
          if (!storageId) {
            await log(422, "missing storage_id");
            return fail(422, "INVALID_PAYLOAD", "storage_id é obrigatório.", rlHeaders);
          }
          const res = await ctx.runMutation(internal.apiV1Files.internalFinalizeUpload, { storageId });
          await log(200);
          return ok(res, rlHeaders);
        }
      }

      // ─── Categorias ───
      if (rest[0] === "categories") {
        const ref = rest[1] ? decodeURIComponent(rest[1]) : undefined;

        if (rest.length === 1 && method === "GET") {
          const denied = scopeDenied(requireScope(API_SCOPES.categoriesRead));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const data = await ctx.runQuery(internal.apiV1Catalog.internalListCategories, { meta: catMeta });
          await log(200);
          return ok(data, rlHeaders);
        }

        // POST /api/v1/categories/upsert — criar-ou-atualizar por external_id
        if (rest.length === 2 && rest[1] === "upsert" && method === "POST") {
          const denied = scopeDenied(requireAnyScope([API_SCOPES.categoriesCreate, API_SCOPES.categoriesUpdate]));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const replay = await idemReplay();
          if (replay) { await log(replay.status); return replay; }
          const parsed = withBody();
          if (!parsed.ok) { await log(422, "invalid body"); return parsed.res; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalUpsertCategory, {
            data: parsed.value,
            meta: catMeta,
          });
                    const statusCode = res.created ? 201 : 200;
          await idemStore(statusCode, res.category, String((res.category as any)?.id ?? ""));
          await log(statusCode);
          return { status: statusCode, body: res.category, headers: rlHeaders };
        }

        if (rest.length === 1 && method === "POST") {
          const denied = scopeDenied(requireScope(API_SCOPES.categoriesCreate));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const replay = await idemReplay();
          if (replay) { await log(replay.status); return replay; }
          const parsed = withBody();
          if (!parsed.ok) { await log(422, "invalid body"); return parsed.res; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalCreateCategory, {
            data: parsed.value,
            meta: catMeta,
          });
                    const statusCode = res.idempotent ? 200 : 201;
          await idemStore(statusCode, res.category, String((res.category as any)?.id ?? ""));
          await log(statusCode);
          return { status: statusCode, body: res.category, headers: rlHeaders };
        }

        if (ref && ref !== "upsert" && rest.length === 2 && method === "GET") {
          const denied = scopeDenied(requireScope(API_SCOPES.categoriesRead));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const data = await ctx.runQuery(internal.apiV1Catalog.internalGetCategory, { ref, meta: catMeta });
          if (!data) { await log(404, "not found"); return fail(404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.", rlHeaders); }
          await log(200);
          return ok(data, rlHeaders);
        }

        if (ref && rest.length === 2 && method === "PATCH") {
          const denied = scopeDenied(requireScope(API_SCOPES.categoriesUpdate));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const parsed = withBody();
          if (!parsed.ok) { await log(422, "invalid body"); return parsed.res; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalUpdateCategory, {
            ref,
            data: parsed.value,
            meta: catMeta,
          });
                    await log(200);
          return ok(res.category, rlHeaders);
        }

        if (ref && rest.length === 2 && method === "DELETE") {
          const denied = scopeDenied(requireScope(API_SCOPES.categoriesDelete));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalDeleteCategory, {
            ref,
            meta: catMeta,
          });
                    await log(200);
          return ok(res, rlHeaders);
        }
      }

      // ─── Produtos ───
      if (rest[0] === "products") {
        const ref = rest[1] ? decodeURIComponent(rest[1]) : undefined;

        if (rest.length === 1 && method === "GET") {
          const denied = scopeDenied(requireScope(API_SCOPES.productsRead));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const data = await ctx.runQuery(internal.apiV1Catalog.internalListProducts, { meta: catMeta });
          await log(200);
          return ok(data, rlHeaders);
        }

        // POST /api/v1/products/upsert — criar-ou-atualizar por external_id
        if (rest.length === 2 && rest[1] === "upsert" && method === "POST") {
          const denied = scopeDenied(requireAnyScope([API_SCOPES.productsCreate, API_SCOPES.productsUpdate]));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const replay = await idemReplay();
          if (replay) { await log(replay.status); return replay; }
          const parsed = withBody();
          if (!parsed.ok) { await log(422, "invalid body"); return parsed.res; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalUpsertProduct, {
            data: parsed.value,
            meta: catMeta,
          });
                    const statusCode = res.created ? 201 : 200;
          await idemStore(statusCode, res.product, String((res.product as any)?.id ?? ""));
          await log(statusCode);
          return { status: statusCode, body: res.product, headers: rlHeaders };
        }

        if (rest.length === 1 && method === "POST") {
          const denied = scopeDenied(requireScope(API_SCOPES.productsCreate));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const replay = await idemReplay();
          if (replay) { await log(replay.status); return replay; }
          const parsed = withBody();
          if (!parsed.ok) { await log(422, "invalid body"); return parsed.res; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalCreateProduct, {
            data: parsed.value,
            meta: catMeta,
          });
                    const statusCode = res.idempotent ? 200 : 201;
          await idemStore(statusCode, res.product, String((res.product as any)?.id ?? ""));
          await log(statusCode);
          return { status: statusCode, body: res.product, headers: rlHeaders };
        }

        // /products/{id}/delivery-recipe
        if (ref && rest.length === 3 && rest[2] === "delivery-recipe") {
          if (method === "GET") {
            const denied = scopeDenied(requireScope(API_SCOPES.deliveryRecipesRead));
            if (denied) { await log(denied.status, "scope"); return denied; }
            const product = await ctx.runQuery(internal.apiV1Catalog.internalGetProduct, { ref });
            if (!product) { await log(404, "not found"); return fail(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.", rlHeaders); }
            const recipe = await ctx.runQuery(internal.apiV1Catalog.internalGetDeliveryRecipe, { ref });
            await log(200);
            return ok({ product_id: product.id, delivery_recipe: recipe }, rlHeaders);
          }
          if (method === "PUT") {
            const denied = scopeDenied(requireScope(API_SCOPES.deliveryRecipesWrite));
            if (denied) { await log(denied.status, "scope"); return denied; }
            const parsed = withBody();
            if (!parsed.ok) { await log(422, "invalid body"); return parsed.res; }
            const res = await ctx.runMutation(internal.apiV1Catalog.internalSetDeliveryRecipe, {
              ref,
              recipe: parsed.value,
              meta: catMeta,
            });
                        await log(200);
            return ok(res, rlHeaders);
          }
        }

        // /products/{id}/publish  |  /products/{id}/unpublish
        if (ref && rest.length === 3 && (rest[2] === "publish" || rest[2] === "unpublish") && method === "POST") {
          const denied = scopeDenied(requireScope(API_SCOPES.productsPublish));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalPublishProduct, {
            ref,
            publish: rest[2] === "publish",
            meta: catMeta,
          });
                    await log(200);
          return ok(res.product, rlHeaders);
        }

        if (ref && ref !== "upsert" && rest.length === 2 && method === "GET") {
          const denied = scopeDenied(requireScope(API_SCOPES.productsRead));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const data = await ctx.runQuery(internal.apiV1Catalog.internalGetProduct, { ref, meta: catMeta });
          if (!data) { await log(404, "not found"); return fail(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.", rlHeaders); }
          await log(200);
          return ok(data, rlHeaders);
        }

        if (ref && rest.length === 2 && method === "PATCH") {
          const denied = scopeDenied(requireScope(API_SCOPES.productsUpdate));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const parsed = withBody();
          if (!parsed.ok) { await log(422, "invalid body"); return parsed.res; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalUpdateProduct, {
            ref,
            data: parsed.value,
            meta: catMeta,
          });
                    await log(200);
          return ok(res.product, rlHeaders);
        }

        if (ref && rest.length === 2 && method === "DELETE") {
          const denied = scopeDenied(requireScope(API_SCOPES.productsDelete));
          if (denied) { await log(denied.status, "scope"); return denied; }
          const res = await ctx.runMutation(internal.apiV1Catalog.internalDeleteProduct, {
            ref,
            meta: catMeta,
          });
                    await log(200);
          return ok(res, rlHeaders);
        }
      }

      // ── GET /sync/changes — sincronização incremental ──
      if (route === "sync/changes" && method === "GET") {
        const denied = requireAnyScope([API_SCOPES.productsRead, API_SCOPES.categoriesRead]);
        if (denied) { await log(denied.status, "scope"); return { ...denied, headers: { ...denied.headers, ...rlHeaders } }; }
        const cursor = q.cursor ? String(q.cursor) : undefined;
        const limitN = Math.min(Number(q.limit) || 100, 200);
        const data = await ctx.runQuery(internal.apiV1Sync.internalSyncChanges, {
          serverId: effectiveServerId,
          addonId: effectiveAddonId,
          cursor,
          limit: limitN,
        });
                await log(200);
        return ok(data, rlHeaders);
      }

      await log(404, "unknown route");
      return fail(404, "NOT_FOUND", `Rota desconhecida: ${path}`, rlHeaders);
    } catch (e: any) {
      // erros estruturados do catálogo (código/validação) → resposta padronizada
      const data = e instanceof ConvexError ? (e.data as any) : undefined;
      if (data && typeof data === "object" && data.code) {
        await log(data.status ?? 422, String(data.code));
        const base = {
          errors: [{ message: String(data.message ?? "Dados inválidos."), code: String(data.code) }],
        };
        const body =
          data.extra && typeof data.extra === "object" ? { ...base, ...data.extra } : base;
        return { status: data.status ?? 422, body, headers: rlHeaders };
      }
      // nunca expõe stack trace / detalhes internos
      await log(500, e?.message ?? "internal error");
      return fail(500, "INTERNAL_ERROR", "Erro interno no servidor.", rlHeaders);
    }
  },
});
