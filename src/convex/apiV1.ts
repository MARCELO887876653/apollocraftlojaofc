"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────
// API v1 — endpoints para addons Minecraft
//   GET   /api/v1/app/queued_commands
//   POST  /api/v1/app/queued_commands/claim
//   PATCH /api/v1/app/command/{id}
//   GET   /api/v1/app/user_queue/{user-id}
//   GET   /api/v1/app/user_schedules/{user-id}
//   POST  /api/v1/app/heartbeat
// Auth:  Authorization: Bearer sk_live_...
// Erros: { errors: [{ message, code }] }
// ─────────────────────────────────────────────────────────────

const RATE_GET = 120;    // req/min
const RATE_WRITE = 30;   // req/min

function json(status: number, body: any, headers?: Record<string, string>) {
  return { status, body, headers };
}

function errors(status: number, message: string, code: string, headers?: Record<string, string>) {
  return json(status, { errors: [{ message, code }] }, headers);
}

function mapCommand(c: any) {
  return {
    id: c._id,
    server_id: c.serverId,
    addon_id: c.addonId,
    action: c.action,
    command: c.command ?? null,
    payload: c.payload ?? null,
    offline_execute: c.offlineExecute,
    execute_at: new Date(c.executeAt).toISOString(),
    status: c.status,
    attempts: c.attempts,
    idempotency_key: c.idempotencyKey,
    order: {
      id: c.orderNumber,
      client_identifier: c.clientIdentifier,
      product: c.productName,
      quantity: c.quantity,
      variables: c.variables ?? [],
    },
  };
}

export const handle = internalAction({
  args: {
    method: v.string(),
    path: v.string(),
    token: v.string(),
    bodyText: v.string(),
    body: v.optional(v.any()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, { method, path, token, bodyText, body, ip }) => {
    const startedAt = Date.now();

    const finishLog = async (
      statusCode: number,
      opts?: { apiKeyId?: any; serverId?: string; addonId?: string; deliveryId?: any; error?: string },
    ) => {
      try {
        await ctx.runMutation(internal.apiV1Data.logApiCall, {
          apiKeyId: opts?.apiKeyId,
          serverId: opts?.serverId,
          addonId: opts?.addonId,
          deliveryId: opts?.deliveryId,
          endpoint: path,
          method,
          statusCode,
          durationMs: Date.now() - startedAt,
          error: opts?.error,
        });
      } catch {
        /* log não deve quebrar a API */
      }
    };

    // 1. autenticação
    if (!token) {
      await finishLog(401, { error: "token ausente" });
      return errors(401, "Envie o header Authorization: Bearer <sua chave>.", "MISSING_API_KEY");
    }
    const key: any = await ctx.runQuery(internal.apiKeysV1.internalAuthenticate, { token });
    if (!key) {
      await finishLog(401, { error: "token inválido" });
      return errors(401, "API key inválida.", "INVALID_API_KEY");
    }
    if (!key.active || key.revokedAt) {
      await finishLog(401, { apiKeyId: key._id, error: "revogada" });
      return errors(401, "API key revogada ou desativada.", "API_KEY_REVOKED");
    }

    const serverId = key.serverId ?? "GLOBAL";
    const rateHeaders = (limit: number, remaining: number, retryAfter?: number) => ({
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(Math.max(0, remaining)),
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    });

    const isWrite = method !== "GET";
    const maxPerMinute = isWrite ? RATE_WRITE : RATE_GET;
    const rl: any = await ctx.runQuery(
      internal.apiV1Data.checkRateLimit,
      { keyId: key._id, method: isWrite ? "write" : "read", maxPerMinute },
    );
    if (!rl.allowed) {
      await finishLog(429, { apiKeyId: key._id, error: "rate limit" });
      return errors(429, "Limite de requisições excedido.", "RATE_LIMIT_REACHED", rateHeaders(maxPerMinute, 0, rl.retryAfter));
    }
    await ctx.runMutation(internal.apiV1Data.incrementRateLimit, {
      keyId: key._id,
      method: isWrite ? "write" : "read",
    });

    const route = path.replace(/\/+$/, "") || "/";

    const requireScope = (scope: string) => key.scopes?.includes(scope);
    const deny = async (scope: string) => {
      await finishLog(403, { apiKeyId: key._id, error: `scope ${scope}` });
      return errors(403, `API key não possui a permissão "${scope}".`, "INSUFFICIENT_SCOPE");
    };

    // 2. GET /app/queued_commands
    if (route === "/app/queued_commands" && method === "GET") {
      if (!requireScope("deliveries:read") && !requireScope("users:queue")) {
        return await deny("deliveries:read");
      }
      const limit = Math.min(Number(body?.limit ?? 50) || 50, 200);
      const effectiveAddon = key.addonId ?? body?.addon_id ?? undefined;
      const cmds: any[] = await ctx.runQuery(internal.deliveryCommands.internalListQueued, {
        now: Date.now(),
        serverId,
        addonId: effectiveAddon,
        limit,
      });
      await ctx.runMutation(internal.apiKeysV1.internalTouchKey, { id: key._id, ip });
      await finishLog(200, { apiKeyId: key._id, serverId });
      return json(200, { commands: cmds.map(mapCommand) }, rateHeaders(maxPerMinute, rl.remaining));
    }

    // 3. POST /app/queued_commands/claim
    if (route === "/app/queued_commands/claim" && method === "POST") {
      if (!requireScope("deliveries:read")) return await deny("deliveries:read");
      const limit = Math.min(Number(body?.limit ?? 20) || 20, 100);
      const effectiveAddon = key.addonId ?? body?.addon_id ?? undefined;
      const claimToken = `clm_${crypto.randomUUID()}`;
      const res: any = await ctx.runMutation(internal.apiV1Data.claimCommands, {
        keyId: key._id,
        serverId,
        addonId: effectiveAddon,
        limit,
        claimToken,
      });
      await ctx.runMutation(internal.apiKeysV1.internalTouchKey, { id: key._id, ip });
      await finishLog(200, { apiKeyId: key._id, serverId });
      return json(200, {
        claim_token: claimToken,
        claimed_at: new Date().toISOString(),
        claim_expires_at: new Date(res.claimExpiresAt).toISOString(),
        commands: res.claimed.map(mapCommand),
      }, rateHeaders(maxPerMinute, rl.remaining));
    }

    // 4. PATCH /app/command/{id}
    const cmdMatch = route.match(/^\/app\/command\/(.+)$/);
    if (cmdMatch && (method === "PATCH" || method === "POST")) {
      if (!requireScope("deliveries:update")) return await deny("deliveries:update");
      const commandId = cmdMatch[1];
      const exists: any = await ctx.runQuery(
        internal.apiV1Data.internalGetCommand,
        { id: commandId as any },
      ).catch(() => null);
      if (!exists) {
        await finishLog(404, { apiKeyId: key._id, error: "command não encontrado" });
        return errors(404, "Entrega não encontrada.", "COMMAND_NOT_FOUND");
      }
      const status = String(body?.status ?? "").toUpperCase();
      if (!["DONE", "FAILED", "PENDING", "CANCELED"].includes(status)) {
        await finishLog(422, { apiKeyId: key._id, error: "status inválido" });
        return errors(422, "Status deve ser DONE, FAILED, PENDING ou CANCELED.", "INVALID_STATUS");
      }
      const res: any = await ctx.runMutation(internal.apiV1Data.confirmCommand, {
        id: commandId as any,
        apiKeyId: key._id,
        serverId,
        status,
        response: body?.response !== undefined ? String(body.response) : undefined,
        reason: body?.reason !== undefined ? String(body.reason) : undefined,
        ip,
      });
      if (!res.ok) {
        const map: Record<string, [number, string, string]> = {
          NOT_FOUND: [404, "Entrega não encontrada.", "COMMAND_NOT_FOUND"],
          FORBIDDEN: [403, "Esta entrega pertence a outro servidor.", "COMMAND_SERVER_MISMATCH"],
          ALREADY_CANCELED: [409, "Entrega já cancelada.", "COMMAND_CANCELED"],
          INVALID_STATUS: [422, "Status inválido.", "INVALID_STATUS"],
        };
        const [st, message, code] = map[res.code] ?? [500, "Erro interno.", "INTERNAL_ERROR"];
        await finishLog(st, { apiKeyId: key._id, deliveryId: commandId, error: code });
        return errors(st, message, code);
      }
      await finishLog(200, { apiKeyId: key._id, deliveryId: commandId });
      return json(200, { id: commandId, status, updated: true, idempotent: Boolean(res.idempotent) }, rateHeaders(maxPerMinute, rl.remaining));
    }

    // 5. GET /app/user_queue/{user-id}
    const uqMatch = route.match(/^\/app\/user_queue\/(.+)$/);
    if (uqMatch && method === "GET") {
      if (!requireScope("users:queue") && !requireScope("deliveries:read")) {
        return await deny("users:queue");
      }
      const identifier = decodeURIComponent(uqMatch[1]);
      const cmds: any[] = await ctx.runQuery(internal.deliveryCommands.internalUserQueue, {
        now: Date.now(),
        clientIdentifier: identifier,
        serverId,
        includeScheduled: false,
      });
      await finishLog(200, { apiKeyId: key._id, serverId });
      return json(200, { commands: cmds.map(mapCommand) }, rateHeaders(maxPerMinute, rl.remaining));
    }

    // 6. GET /app/user_schedules/{user-id}
    const usMatch = route.match(/^\/app\/user_schedules\/(.+)$/);
    if (usMatch && method === "GET") {
      if (!requireScope("users:schedules") && !requireScope("deliveries:read")) {
        return await deny("users:schedules");
      }
      const identifier = decodeURIComponent(usMatch[1]);
      const future: any[] = await ctx.runQuery(internal.deliveryCommands.internalUserQueue, {
        now: Date.now() - 1,
        clientIdentifier: identifier,
        serverId,
        includeScheduled: true,
      });
      await finishLog(200, { apiKeyId: key._id, serverId });
      return json(200, { schedules: future.map(mapCommand) }, rateHeaders(maxPerMinute, rl.remaining));
    }

    // 7. POST /app/heartbeat
    if (route === "/app/heartbeat" && method === "POST") {
      if (!requireScope("server:heartbeat")) return await deny("server:heartbeat");
      if (!body?.server_id) {
        await finishLog(422, { apiKeyId: key._id, error: "server_id ausente" });
        return errors(422, "server_id é obrigatório.", "INVALID_PAYLOAD");
      }
      await ctx.runMutation(internal.apiV1Data.heartbeat, {
        serverId: String(body.server_id),
        version: body.version ? String(body.version) : undefined,
        minecraftVersion: body.minecraft_version ? String(body.minecraft_version) : undefined,
        addonId: key.addonId ?? (body.addon_id ? String(body.addon_id) : undefined),
        ip,
      });
      await finishLog(200, { apiKeyId: key._id, serverId });
      return json(200, { ok: true, server_id: String(body.server_id) }, rateHeaders(maxPerMinute, rl.remaining));
    }

    await finishLog(404, { apiKeyId: key._id, error: "rota desconhecida" });
    return errors(404, `Rota desconhecida: ${method} ${route}`, "ROUTE_NOT_FOUND");
  },
});
