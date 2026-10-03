import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────
// Operações atômicas da API v1
// ─────────────────────────────────────────────────────────────

const CLAIM_TTL_MS = 5 * 60 * 1000;

/** Rate limit por chave+método: janela deslizante de 60s. */
export const checkRateLimit = internalQuery({
  args: { keyId: v.id("apiKeysV1"), method: v.string(), maxPerMinute: v.number() },
  handler: async (ctx, { keyId, method, maxPerMinute }) => {
    const bucket = `${keyId}:${method}`;
    const doc: any = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q: any) => q.eq("key", bucket))
      .first();
    const now = Date.now();
    if (!doc || now - doc.windowStart > 60_000) {
      return { allowed: true, remaining: maxPerMinute - 1, retryAfter: undefined };
    }
    const retryAt = doc.windowStart + 60_000;
    return {
      allowed: doc.count < maxPerMinute,
      remaining: Math.max(0, maxPerMinute - doc.count - 1),
      retryAfter: Math.ceil((retryAt - now) / 1000),
    };
  },
});

export const incrementRateLimit = internalMutation({
  args: { keyId: v.id("apiKeysV1"), method: v.string() },
  handler: async (ctx, { keyId, method }) => {
    const bucket = `${keyId}:${method}`;
    const doc: any = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q: any) => q.eq("key", bucket))
      .first();
    const now = Date.now();
    if (!doc || now - doc.windowStart > 60_000) {
      if (doc) await ctx.db.patch(doc._id, { windowStart: now, count: 1 });
      else await ctx.db.insert("rateLimits", { key: bucket, windowStart: now, count: 1 });
    } else {
      await ctx.db.patch(doc._id, { count: doc.count + 1 });
    }
  },
});

export const internalGetCommand = internalQuery({
  args: { id: v.id("deliveryCommands") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

/**
 * Reserva atomicamente entregas PENDING para uma instância do addon.
 * Retorna claim_token + expiração (5 min). Duas chamadas concorrentes
 * nunca pegam a mesma entrega; a queda do addon libera a lease.
 */
export const claimCommands = internalMutation({
  args: {
    keyId: v.id("apiKeysV1"),
    serverId: v.string(),
    addonId: v.optional(v.string()),
    limit: v.number(),
    claimToken: v.string(),
  },
  handler: async (ctx, { keyId, serverId, addonId, limit, claimToken }) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_status_executeAt", (q: any) => q.eq("status", "PROCESSING"))
      .take(200);
    for (const s of stale) {
      if (s.claimExpiresAt && s.claimExpiresAt <= now) {
        await ctx.db.patch(s._id, {
          status: "PENDING",
          claimedBy: undefined,
          claimedAt: undefined,
          claimExpiresAt: undefined,
          updatedAt: now,
        });
      }
    }

    const candidates = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_status_executeAt", (q: any) => q.eq("status", "PENDING"))
      .order("asc")
      .take(300);
    const claimed: any[] = [];
    for (const c of candidates) {
      if (claimed.length >= limit) break;
      if (c.executeAt > now) continue;
      if (c.serverId !== "GLOBAL" && c.serverId !== serverId) continue;
      if (addonId && c.addonId !== addonId) continue;
      await ctx.db.patch(c._id, {
        status: "PROCESSING",
        claimedBy: claimToken,
        claimedAt: now,
        claimExpiresAt: now + CLAIM_TTL_MS,
        apiKeyId: keyId,
        lastAttemptAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("deliveryAttempts", {
        deliveryId: c._id,
        apiKeyId: keyId,
        serverId,
        addonId: c.addonId,
        status: "CLAIM",
        response: claimToken,
        startedAt: now,
        finishedAt: now,
      });
      claimed.push(c);
    }
    return { claimed, claimExpiresAt: now + CLAIM_TTL_MS };
  },
});

/** Libera leases expirados (addon caiu durante PROCESSING). */
export const releaseExpiredClaims = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_status_executeAt", (q: any) => q.eq("status", "PROCESSING"))
      .take(200);
    let released = 0;
    for (const s of stale) {
      if (s.claimExpiresAt && s.claimExpiresAt <= now) {
        await ctx.db.patch(s._id, {
          status: "PENDING",
          claimedBy: undefined,
          claimedAt: undefined,
          claimExpiresAt: undefined,
          updatedAt: now,
        });
        released++;
      }
    }
    return { released };
  },
});

/** Confirmação do addon (PATCH /command/{id}). */
export const confirmCommand = internalMutation({
  args: {
    id: v.id("deliveryCommands"),
    apiKeyId: v.id("apiKeysV1"),
    serverId: v.string(),
    status: v.string(),
    response: v.optional(v.string()),
    reason: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, { id, apiKeyId, serverId, status, response, reason, ip }) => {
    const c: any = await ctx.db.get(id);
    if (!c) return { ok: false, code: "NOT_FOUND" };
    if (c.serverId !== "GLOBAL" && c.serverId !== serverId) {
      return { ok: false, code: "FORBIDDEN" };
    }
    if (c.status === "CANCELED" && status !== "CANCELED") {
      return { ok: false, code: "ALREADY_CANCELED" };
    }
    const valid = ["DONE", "FAILED", "PENDING", "CANCELED"];
    if (!valid.includes(status)) return { ok: false, code: "INVALID_STATUS" };
    const now = Date.now();

    if (status === "DONE") {
      if (c.status === "DONE") return { ok: true, idempotent: true }; // idempotente
      await ctx.db.patch(id, {
        status: "DONE",
        response: response ?? "Entrega realizada com sucesso",
        reason: undefined,
        completedAt: now,
        attempts: c.attempts + 1,
        lastAttemptAt: now,
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        updatedAt: now,
      });
    } else if (status === "FAILED") {
      const attempts = c.attempts + 1;
      const exhausted = attempts >= c.maxAttempts;
      await ctx.db.patch(id, {
        status: exhausted ? "FAILED" : "PENDING",
        response: undefined,
        reason: response ?? reason ?? "Falha reportada pelo addon",
        attempts,
        lastAttemptAt: now,
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        executeAt: exhausted ? c.executeAt : now + 60_000,
        updatedAt: now,
      });
    } else if (status === "PENDING") {
      await ctx.db.patch(id, {
        status: "PENDING",
        response: undefined,
        reason: response ?? reason,
        attempts: c.attempts + 1,
        lastAttemptAt: now,
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        executeAt: now + 60_000,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(id, {
        status: "CANCELED",
        reason: reason ?? response ?? "Cancelada pela integração",
        completedAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("deliveryAttempts", {
      deliveryId: id,
      apiKeyId,
      serverId,
      addonId: c.addonId,
      status,
      response,
      reason,
      startedAt: now,
      finishedAt: now,
    });
    return { ok: true };
  },
});

export const heartbeat = internalMutation({
  args: {
    serverId: v.string(),
    version: v.optional(v.string()),
    minecraftVersion: v.optional(v.string()),
    addonId: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, version, minecraftVersion, addonId, ip }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("addonServers")
      .withIndex("by_server", (q: any) => q.eq("serverId", serverId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        version,
        minecraftVersion,
        addonId,
        lastIp: ip,
        lastSeenAt: now,
      });
    } else {
      await ctx.db.insert("addonServers", {
        serverId,
        addonId,
        version,
        minecraftVersion,
        lastIp: ip,
        lastSeenAt: now,
        createdAt: now,
      });
    }
    return { ok: true };
  },
});

export const logApiCall = internalMutation({
  args: {
    apiKeyId: v.optional(v.id("apiKeysV1")),
    serverId: v.optional(v.string()),
    addonId: v.optional(v.string()),
    deliveryId: v.optional(v.id("deliveryCommands")),
    endpoint: v.string(),
    method: v.string(),
    statusCode: v.number(),
    durationMs: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, entry) => {
    await ctx.db.insert("apiLogs", { ...entry, createdAt: Date.now() });
  },
});

export const internalListServers = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("addonServers").collect(),
});
