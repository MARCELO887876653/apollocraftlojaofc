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

export { CLAIM_LEASE_MS, HEARTBEAT_ONLINE_MS };

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

    // 2) seleciona entregas disponíveis
    const candidates: any[] = [];
    for (const sid of visibleServers(serverId)) {
      const rows = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) => q.eq("serverId", sid).eq("status", "PENDING"))
        .collect();
      for (const r of rows) {
        if (r.executeAt > now) continue;
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
        command: c.command ?? null,
        payload: c.payload ?? {},
        offline_execute: c.offlineExecute,
        execute_at: new Date(c.executeAt).toISOString(),
        status: "PROCESSING",
        attempts: c.attempts + 1,
        claim_token: claimToken,
        claimed_at: new Date(now).toISOString(),
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
    apiKeyId: v.id("apiKeysV1"),
    serverId: v.string(),
  },
  handler: async (ctx, { publicId, status, response, reason, apiKeyId, serverId }) => {
    const c: any = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
      .first();
    if (!c) return { ok: false as const, code: "NOT_FOUND" as const };

    const now = Date.now();

    if (status === "DONE") {
      if (c.status === "DONE") return { ok: true as const, status: "DONE" as const, idempotent: true };
      await ctx.db.patch(c._id, {
        status: "DONE",
        response: response ?? "Entregue com sucesso",
        completedAt: now,
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        claimToken: undefined,
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
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        claimToken: undefined,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "CANCELED", response, reason);
      return { ok: true as const, status: "CANCELED" as const };
    }

    if (status === "PENDING") {
      // devolve para a fila (ex.: jogador offline)
      await ctx.db.patch(c._id, {
        status: "PENDING",
        response: response ?? "PLAYER_OFFLINE",
        reason: reason ?? undefined,
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        claimToken: undefined,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "PENDING", response, reason);
      return { ok: true as const, status: "PENDING" as const };
    }

    // FAILED
    const attempts = c.attempts;
    if (attempts >= c.maxAttempts) {
      await ctx.db.patch(c._id, {
        status: "FAILED",
        response: response ?? "Falha na entrega",
        reason: reason ?? undefined,
        completedAt: now,
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        claimToken: undefined,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "FAILED", response, reason);
      return { ok: true as const, status: "FAILED" as const, permanent: true };
    }
    const backoffs = [60_000, 300_000, 900_000, 3_600_000, 7_200_000];
    const delay = backoffs[Math.max(0, Math.min(attempts - 1, backoffs.length - 1))];
    await ctx.db.patch(c._id, {
      status: "PENDING",
      response: response ?? "Falha temporária — nova tentativa agendada",
      reason: reason ?? undefined,
      executeAt: now + delay,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      claimToken: undefined,
      updatedAt: now,
    });
    await finishOpenAttempt(ctx, c._id, "FAILED", response, reason);
    return { ok: true as const, status: "PENDING" as const, retryInMs: delay };
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
    ip: v.optional(v.string()),
  },
  handler: async (ctx, { serverId, addonId, version, minecraftVersion, ip }) => {
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
        lastSeenAt: now,
        lastIp: ip ?? existing.lastIp,
        status: "online",
        updatedAt: now,
      });
      return { ok: true as const, serverId };
    }
    await ctx.db.insert("addonServers", {
      serverId,
      addonId: addonId ?? undefined,
      version: version ?? undefined,
      minecraftVersion: minecraftVersion ?? undefined,
      lastSeenAt: now,
      lastIp: ip ?? undefined,
      status: "online",
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, serverId };
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
        lastSeenAt: s.lastSeenAt,
        lastIp: s.lastIp ?? "",
        online: now - s.lastSeenAt <= HEARTBEAT_ONLINE_MS,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
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
    const logs = await ctx.db.query("apiLogs").collect();
    return logs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
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
        lastSeenAt: s.lastSeenAt,
        online: now - s.lastSeenAt <= HEARTBEAT_ONLINE_MS,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  },
});
