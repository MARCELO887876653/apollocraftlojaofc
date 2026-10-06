import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin";
import { generateClaimToken } from "./lib/hash";

// ─────────────────────────────────────────────────────────────
// Dados da API v1: rate limit, claim/lease, confirmação, heartbeat, logs.
// Todo o estado é persistido no banco (nada em memória/arrays).
// ─────────────────────────────────────────────────────────────

const CLAIM_LEASE_MS = 5 * 60 * 1000; // 5 minutos
const HEARTBEAT_ONLINE_MS = 90 * 1000; // considerado online nos últimos 90s

// Códigos de erro semânticos aceitos na confirmação (PATCH command).
export const ERROR_CODES = {
  PLAYER_OFFLINE: "PLAYER_OFFLINE",
  HANDLER_NOT_FOUND: "HANDLER_NOT_FOUND",
  REFERENCE_NOT_FOUND: "REFERENCE_NOT_FOUND",
  REFERENCE_REVISION_NOT_FOUND: "REFERENCE_REVISION_NOT_FOUND",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  TEMPORARY_STORAGE_ERROR: "TEMPORARY_STORAGE_ERROR",
  CLAIM_EXPIRED: "CLAIM_EXPIRED",
  CLAIM_INVALID: "CLAIM_INVALID",
  MAX_ATTEMPTS_REACHED: "MAX_ATTEMPTS_REACHED",
} as const;

// Erros que NUNCA devem ser reagendados automaticamente (falha definitiva).
const NON_RETRYABLE_CODES = new Set<string>([
  ERROR_CODES.HANDLER_NOT_FOUND,
  ERROR_CODES.REFERENCE_NOT_FOUND,
  ERROR_CODES.REFERENCE_REVISION_NOT_FOUND,
  ERROR_CODES.INVALID_PAYLOAD,
  ERROR_CODES.MAX_ATTEMPTS_REACHED,
]);

const BACKOFFS_MS = [60_000, 300_000, 900_000, 3_600_000, 7_200_000];

function backoffFor(attempts: number): number {
  return BACKOFFS_MS[Math.max(0, Math.min(attempts - 1, BACKOFFS_MS.length - 1))];
}

export { CLAIM_LEASE_MS, HEARTBEAT_ONLINE_MS, NON_RETRYABLE_CODES, backoffFor };

// ─── Rate limit por API Key + bucket (GET vs escrita) ───

export const internalCheckRateLimit = internalMutation({
  args: {
    apiKeyId: v.id("apiKeysV1"),
    bucket: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, { apiKeyId, bucket, limit, windowMs }) => {
    const now = Date.now();
    const key = `apiv1:${apiKeyId}:${bucket}`;
    const doc = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (!doc || now - doc.windowStart >= windowMs) {
      if (doc) await ctx.db.patch(doc._id, { windowStart: now, count: 1 });
      else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
      return { allowed: true, remaining: limit - 1, limit, retryAfterSec: 0 };
    }
    if (doc.count >= limit) {
      const resetAt = doc.windowStart + windowMs;
      return {
        allowed: false,
        remaining: 0,
        limit,
        retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }
    await ctx.db.patch(doc._id, { count: doc.count + 1 });
    return {
      allowed: true,
      remaining: Math.max(0, limit - (doc.count + 1)),
      limit,
      retryAfterSec: 0,
    };
  },
});

// ─── Claim/lease atômico ───

function visibleServers(serverId: string): string[] {
  return serverId === "GLOBAL" ? ["GLOBAL"] : [serverId, "GLOBAL"];
}

export const internalClaim = internalMutation({
  args: {
    apiKeyId: v.id("apiKeysV1"),
    serverId: v.string(),
    addonId: v.optional(v.string()),
    limit: v.number(),
    leaseMs: v.optional(v.number()),
  },
  handler: async (ctx, { apiKeyId, serverId, addonId, limit, leaseMs }) => {
    const now = Date.now();
    const lease = leaseMs ?? CLAIM_LEASE_MS;

    // 1) libera claims expirados (addon caiu depois de pegar a entrega)
    for (const sid of visibleServers(serverId)) {
      const processing = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) => q.eq("serverId", sid).eq("status", "PROCESSING"))
        .collect();
      for (const p of processing) {
        if (p.claimExpiresAt && p.claimExpiresAt < now) {
          await ctx.db.patch(p._id, {
            status: "PENDING",
            claimedBy: undefined,
            claimedAt: undefined,
            claimExpiresAt: undefined,
            claimToken: undefined,
            updatedAt: now,
          });
        }
      }
    }

    // 2) seleciona entregas disponíveis (PENDING e FAILED retryable vencidas)
    const candidates: any[] = [];
    for (const sid of visibleServers(serverId)) {
      const pending = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) => q.eq("serverId", sid).eq("status", "PENDING"))
        .collect();
      for (const r of pending) {
        if (r.executeAt > now) continue;
        if (addonId && r.addonId !== addonId) continue;
        candidates.push(r);
      }
      // retries agendados: status FAILED + retryable=true + nextAttemptAt vencido
      const failed = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) => q.eq("serverId", sid).eq("status", "FAILED"))
        .collect();
      for (const r of failed) {
        if (r.retryable !== true) continue;
        if (r.requiresManualIntervention) continue;
        if ((r.nextAttemptAt ?? r.executeAt) > now) continue;
        if (addonId && r.addonId !== addonId) continue;
        candidates.push(r);
      }
    }
    candidates.sort((a, b) => a.executeAt - b.executeAt || a.createdAt - b.createdAt);
    const chosen = candidates.slice(0, Math.max(1, Math.min(limit, 100)));

    // 3) reserva atomicamente (a mutation é serializável: ninguém pega o mesmo doc)
    const claimed: any[] = [];
    for (const c of chosen) {
      const claimToken = generateClaimToken();
      await ctx.db.patch(c._id, {
        status: "PROCESSING",
        claimedBy: apiKeyId,
        claimedAt: now,
        claimExpiresAt: now + lease,
        claimToken,
        attempts: c.attempts + 1,
        lastAttemptAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("deliveryAttempts", {
        deliveryId: c._id,
        apiKeyId,
        serverId,
        status: "PROCESSING",
        startedAt: now,
        createdAt: now,
      });
      claimed.push({
        id: c.publicId,
        server_id: c.serverId,
        addon_id: c.addonId,
        action: c.action,
        action_id: c.actionId ?? null,
        step_index: c.stepIndex ?? null,
        delivery_group_id: c.deliveryGroupId ?? null,
        mode: c.deliveryMode ?? "SERVER",
        reference_id: c.referenceId ?? null,
        reference_revision: c.referenceRevision ?? null,
        command: c.command ?? null,
        payload: c.payload ?? {},
        offline_execute: c.offlineExecute,
        execute_at: new Date(c.executeAt).toISOString(),
        status: "PROCESSING",
        attempts: c.attempts + 1,
        max_attempts: c.maxAttempts,
        claim_token: claimToken,
        claimed_at: new Date(now).toISOString(),
        claimed_by: apiKeyId,
        claim_expires_at: new Date(now + lease).toISOString(),
        order: {
          id: c.orderNumber,
          client_identifier: c.clientIdentifier,
          variables: c.variables,
        },
      });
    }
    return claimed;
  },
});

// ─── Confirmação (PATCH command) ───

function commandVisible(commandServerId: string, keyServerId: string): boolean {
  if (keyServerId === "GLOBAL" || !keyServerId) return true;
  return commandServerId === keyServerId || commandServerId === "GLOBAL";
}

export const internalConfirm = internalMutation({
  args: {
    publicId: v.string(),
    status: v.union(
      v.literal("DONE"),
      v.literal("FAILED"),
      v.literal("PENDING"),
      v.literal("CANCELED"),
    ),
    response: v.optional(v.string()),
    reason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    claimToken: v.optional(v.string()),
    apiKeyId: v.id("apiKeysV1"),
    serverId: v.string(),
    addonId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { publicId, status, response, reason, errorCode, retryable, claimToken, apiKeyId, serverId, addonId },
  ) => {
    const c: any = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
      .first();
    if (!c) return { ok: false as const, code: "NOT_FOUND" as const };

    // ── autorização por objeto: uma chave não confirma entrega de outro servidor/addon ──
    if (!commandVisible(c.serverId, serverId)) {
      return { ok: false as const, code: "FORBIDDEN" as const };
    }
    if (addonId && c.addonId !== addonId) {
      return { ok: false as const, code: "FORBIDDEN" as const };
    }

    const now = Date.now();

    // ── claim_token: só exigido quando a entrega foi de fato reservada (PROCESSING) ──
    if (c.status === "PROCESSING") {
      if (!claimToken || c.claimToken !== claimToken) {
        return { ok: false as const, code: "CLAIM_INVALID" as const };
      }
      if (c.claimExpiresAt !== undefined && c.claimExpiresAt < now) {
        return { ok: false as const, code: "CLAIM_EXPIRED" as const };
      }
    }

    const clearClaim = {
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      claimToken: undefined,
    };

    if (status === "DONE") {
      if (c.status === "DONE") return { ok: true as const, status: "DONE" as const, idempotent: true };
      await ctx.db.patch(c._id, {
        status: "DONE",
        response: response ?? "Entregue com sucesso",
        completedAt: now,
        errorCode: undefined,
        lastError: undefined,
        retryable: false,
        nextAttemptAt: undefined,
        requiresManualIntervention: false,
        ...clearClaim,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "DONE", response, reason);
      return { ok: true as const, status: "DONE" as const };
    }

    if (status === "CANCELED") {
      await ctx.db.patch(c._id, {
        status: "CANCELED",
        response: response ?? undefined,
        reason: reason ?? "Cancelado pelo addon",
        completedAt: now,
        ...clearClaim,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "CANCELED", response, reason);
      return { ok: true as const, status: "CANCELED" as const };
    }

    if (status === "PENDING") {
      // devolve para a fila sem consumir tentativa (ex.: jogador offline)
      const isOffline = errorCode === ERROR_CODES.PLAYER_OFFLINE || /PLAYER_OFFLINE/i.test(response ?? "");
      await ctx.db.patch(c._id, {
        status: "PENDING",
        response: response ?? ERROR_CODES.PLAYER_OFFLINE,
        reason: reason ?? undefined,
        errorCode: errorCode ?? (isOffline ? ERROR_CODES.PLAYER_OFFLINE : undefined),
        // offline não consome max_attempts: restaura a tentativa consumida no claim
        attempts: isOffline ? Math.max(0, c.attempts - 1) : c.attempts,
        executeAt: now,
        retryable: undefined,
        nextAttemptAt: undefined,
        requiresManualIntervention: false,
        ...clearClaim,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "PENDING", response, reason);
      return { ok: true as const, status: "PENDING" as const, playerOffline: isOffline };
    }

    // ── FAILED ──
    const attempts = c.attempts;
    const code = errorCode ?? undefined;
    const forcedFinal = retryable === false || (code ? NON_RETRYABLE_CODES.has(code) : false);
    const exhausted = attempts >= c.maxAttempts;

    if (forcedFinal || exhausted) {
      const finalCode = exhausted ? ERROR_CODES.MAX_ATTEMPTS_REACHED : code;
      await ctx.db.patch(c._id, {
        status: "FAILED",
        response: response ?? "Falha na entrega",
        reason: reason ?? undefined,
        errorCode: finalCode,
        lastError: response ?? reason ?? undefined,
        retryable: false,
        nextAttemptAt: undefined,
        requiresManualIntervention: true,
        lastAttemptAt: now,
        completedAt: now,
        ...clearClaim,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "FAILED", response, reason);
      return { ok: true as const, status: "FAILED" as const, permanent: true, errorCode: finalCode };
    }

    // falha temporária → FAILED + retryable=true + backoff
    const delay = backoffFor(attempts);
    await ctx.db.patch(c._id, {
      status: "FAILED",
      response: response ?? "Falha temporária — nova tentativa agendada",
      reason: reason ?? undefined,
      errorCode: code ?? ERROR_CODES.TEMPORARY_STORAGE_ERROR,
      lastError: response ?? reason ?? undefined,
      retryable: true,
      nextAttemptAt: now + delay,
      requiresManualIntervention: false,
      lastAttemptAt: now,
      ...clearClaim,
      updatedAt: now,
    });
    await finishOpenAttempt(ctx, c._id, "FAILED", response, reason);
    return { ok: true as const, status: "FAILED" as const, retryInMs: delay };
  },
});

async function finishOpenAttempt(
  ctx: any,
  deliveryId: any,
  status: string,
  response?: string,
  reason?: string,
) {
  const attempts = await ctx.db
    .query("deliveryAttempts")
    .withIndex("by_delivery", (q: any) => q.eq("deliveryId", deliveryId))
    .collect();
  const open = attempts
    .filter((a: any) => a.finishedAt === undefined)
    .sort((a: any, b: any) => b.startedAt - a.startedAt)[0];
  const now = Date.now();
  if (open) {
    await ctx.db.patch(open._id, {
      status,
      response: response ?? undefined,
      reason: reason ?? undefined,
      finishedAt: now,
    });
  } else {
    await ctx.db.insert("deliveryAttempts", {
      deliveryId,
      status,
      response: response ?? undefined,
      reason: reason ?? undefined,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
    });
  }
}

// ─── Heartbeat de servidores/addons ───

export const internalHeartbeat = internalMutation({
  args: {
    serverId: v.string(),
    addonId: v.optional(v.string()),
    version: v.optional(v.string()),
    minecraftVersion: v.optional(v.string()),
    apiClientVersion: v.optional(v.string()),
    capabilities: v.optional(v.any()),
    errorCode: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { serverId, addonId, version, minecraftVersion, apiClientVersion, capabilities, errorCode, ip },
  ) => {
    const now = Date.now();
    const existing = addonId
      ? await ctx.db
          .query("addonServers")
          .withIndex("by_server_addon", (q) => q.eq("serverId", serverId).eq("addonId", addonId))
          .first()
      : await ctx.db
          .query("addonServers")
          .withIndex("by_server", (q) => q.eq("serverId", serverId))
          .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        addonId: addonId ?? existing.addonId,
        version: version ?? existing.version,
        minecraftVersion: minecraftVersion ?? existing.minecraftVersion,
        apiClientVersion: apiClientVersion ?? existing.apiClientVersion,
        capabilities: capabilities ?? existing.capabilities,
        lastErrorCode: errorCode ?? existing.lastErrorCode,
        lastErrorAt: errorCode ? now : existing.lastErrorAt,
        lastSeenAt: now,
        lastIp: ip ?? existing.lastIp,
        status: "online",
        updatedAt: now,
      });
      return { ok: true as const, serverId, server_time: new Date(now).toISOString() };
    }
    await ctx.db.insert("addonServers", {
      serverId,
      addonId: addonId ?? undefined,
      version: version ?? undefined,
      minecraftVersion: minecraftVersion ?? undefined,
      apiClientVersion: apiClientVersion ?? undefined,
      capabilities: capabilities ?? undefined,
      lastErrorCode: errorCode ?? undefined,
      lastErrorAt: errorCode ? now : undefined,
      lastSeenAt: now,
      lastIp: ip ?? undefined,
      status: "online",
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, serverId, server_time: new Date(now).toISOString() };
  },
});

export const internalListServers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const servers = await ctx.db.query("addonServers").collect();
    const now = Date.now();
    return servers
      .map((s) => ({
        serverId: s.serverId,
        addonId: s.addonId ?? "",
        version: s.version ?? "",
        minecraftVersion: s.minecraftVersion ?? "",
        apiClientVersion: s.apiClientVersion ?? "",
        capabilities: s.capabilities ?? null,
        lastErrorCode: s.lastErrorCode ?? "",
        lastErrorAt: s.lastErrorAt ?? null,
        lastSeenAt: s.lastSeenAt,
        lastIp: s.lastIp ?? "",
        online: now - s.lastSeenAt <= HEARTBEAT_ONLINE_MS,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  },
});

// ─── Idempotência persistente (Idempotency-Key) ───

export const internalIdempotencyGet = internalQuery({
  args: { apiKeyId: v.id("apiKeysV1"), key: v.string() },
  handler: async (ctx, { apiKeyId, key }) => {
    const doc = await ctx.db
      .query("idempotencyKeysV1")
      .withIndex("by_key", (q) => q.eq("apiKeyId", apiKeyId).eq("key", key))
      .first();
    if (!doc) return null;
    if (doc.expiresAt && doc.expiresAt < Date.now()) return null;
    return { requestHash: doc.requestHash, status: doc.status, response: doc.response };
  },
});

export const internalIdempotencyStore = internalMutation({
  args: {
    apiKeyId: v.id("apiKeysV1"),
    key: v.string(),
    method: v.string(),
    endpoint: v.string(),
    requestHash: v.string(),
    status: v.number(),
    response: v.any(),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("idempotencyKeysV1")
      .withIndex("by_key", (q) => q.eq("apiKeyId", args.apiKeyId).eq("key", args.key))
      .first();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24h
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, createdAt: now, expiresAt });
      return;
    }
    await ctx.db.insert("idempotencyKeysV1", { ...args, createdAt: now, expiresAt });
  },
});

// ─── Logs de chamadas ───

export const internalLog = internalMutation({
  args: {
    apiKeyId: v.optional(v.id("apiKeysV1")),
    serverId: v.optional(v.string()),
    addonId: v.optional(v.string()),
    deliveryId: v.optional(v.string()),
    endpoint: v.string(),
    method: v.string(),
    statusCode: v.number(),
    durationMs: v.number(),
    ip: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("apiLogs", { ...args, createdAt: Date.now() });
  },
});

export const adminListLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "logs.view");
    // Índice por data: pega os 200 mais recentes sem carregar a tabela inteira.
    return await ctx.db
      .query("apiLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(200);
  },
});

/** Lista os servidores para o painel de entregas. */
export const adminListServers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "deliveries.view");
    const servers = await ctx.db.query("addonServers").collect();
    const now = Date.now();
    return servers
      .map((s) => ({
        _id: s._id as string,
        serverId: s.serverId,
        addonId: s.addonId ?? "",
        version: s.version ?? "",
        minecraftVersion: s.minecraftVersion ?? "",
        apiClientVersion: s.apiClientVersion ?? "",
        capabilities: s.capabilities ?? null,
        lastErrorCode: s.lastErrorCode ?? "",
        lastErrorAt: s.lastErrorAt ?? null,
        lastSeenAt: s.lastSeenAt,
        online: now - s.lastSeenAt <= HEARTBEAT_ONLINE_MS,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  },
});
