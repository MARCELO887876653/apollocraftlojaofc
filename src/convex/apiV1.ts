import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sha256Hex, tokenPrefix } from "./lib/hash";
import { API_SCOPES } from "./lib/apiSchema";

// ─────────────────────────────────────────────────────────────
// API v1 — roteador HTTP
//
// Autenticação: header `Authorization: Bearer sk_live_...`
// (o http.ts também aceita `X-Api-Key`). A chave nunca vem pela URL.
// Erros no padrão: { errors: [{ message, code }] }.
// Rate limit: GET 120/min, POST/PATCH 30/min (por chave).
// ─────────────────────────────────────────────────────────────

const GET_LIMIT = 120;
const WRITE_LIMIT = 30;
const WINDOW_MS = 60_000;

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
  },
  handler: async (ctx, { method, path, token, bodyText, query, ip }): Promise<ApiResult> => {
    const started = Date.now();
    const q = (query ?? {}) as Record<string, string>;

    // ── 1. Autenticação ──
    if (!token) {
      return fail(401, "MISSING_API_KEY", "Cabeçalho Authorization com Bearer token ausente.");
    }
    const key = await ctx.runQuery(internal.apiKeysV1.internalFindByHash, {
      hash: sha256Hex(token),
    });
    if (!key) {
      return fail(401, "INVALID_API_KEY", "Chave de API inválida.");
    }
    if (!token.startsWith("sk_live_") || key.prefix !== tokenPrefix(token)) {
      return fail(401, "INVALID_API_KEY", "Chave de API inválida.");
    }
    if (!key.active || key.revokedAt) {
      return fail(401, "API_KEY_REVOKED", "Esta chave de API foi revogada ou desativada.");
    }

    // ── 2. Rota ──
    const segs = path.split("/").filter(Boolean);
    const isV1 = segs[0] === "api" && segs[1] === "v1" && segs[2] === "app";
    const rest = isV1 ? segs.slice(3) : [];
    const route = rest.join("/");

    const isWrite = method === "POST" || method === "PATCH";
    const limit = isWrite ? WRITE_LIMIT : GET_LIMIT;
    const bucket = isWrite ? "write" : "read";

    const log = async (statusCode: number, error?: string, deliveryId?: string) => {
      try {
        await ctx.runMutation(internal.apiV1Data.internalLog, {
          apiKeyId: key._id,
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

    // ── 3. Rate limit (por chave + bucket) ──
    const rl = await ctx.runMutation(internal.apiV1Data.internalCheckRateLimit, {
      apiKeyId: key._id,
      bucket,
      limit,
      windowMs: WINDOW_MS,
    });
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
      // ── GET /me ──
      if (route === "me" && method === "GET") {
        await ctx.runMutation(internal.apiKeysV1.internalTouchKey, { id: key._id });
        await log(200);
        return ok(
          {
            name: key.name,
            server_id: effectiveServerId,
            addon_id: key.addonId ?? null,
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
        await ctx.runMutation(internal.apiKeysV1.internalTouchKey, { id: key._id });
        await log(200);
        return ok(data, rlHeaders);
      }

      // ── POST /queued_commands/claim ──
      if (route === "queued_commands/claim" && method === "POST") {
        const denied = requireScope(API_SCOPES.deliveriesUpdate);
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
          apiKeyId: key._id,
          serverId: effectiveServerId,
          addonId: addonFilter,
          limit: limitN,
        });
        await ctx.runMutation(internal.apiKeysV1.internalTouchKey, { id: key._id });
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
          apiKeyId: key._id,
          serverId: effectiveServerId,
        });
        if (!res.ok) {
          await log(404, "not found", deliveryId);
          return fail(404, "DELIVERY_NOT_FOUND", "Entrega não encontrada.", rlHeaders);
        }
        await ctx.runMutation(internal.apiKeysV1.internalTouchKey, { id: key._id });
        await log(200, undefined, deliveryId);
        return ok({ id: deliveryId, status: res.status, updated: true }, rlHeaders);
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
          version: body.version ? String(body.version) : undefined,
          minecraftVersion: body.minecraft_version
            ? String(body.minecraft_version)
            : undefined,
          ip,
        });
        await ctx.runMutation(internal.apiKeysV1.internalTouchKey, { id: key._id });
        await log(200);
        return ok({ ...result, server_id: serverId }, rlHeaders);
      }

      await log(404, "unknown route");
      return fail(404, "NOT_FOUND", `Rota desconhecida: ${path}`, rlHeaders);
    } catch (e: any) {
      // nunca expõe stack trace / detalhes internos
      await log(500, e?.message ?? "internal error");
      return fail(500, "INTERNAL_ERROR", "Erro interno no servidor.", rlHeaders);
    }
  },
});
