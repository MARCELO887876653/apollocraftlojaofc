import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { apiScopeValidator } from "./lib/apiSchema";
import {
  sha256Hex,
  generateApiToken,
  tokenPrefix,
  tokenLastFour,
} from "./lib/hash";

// ─────────────────────────────────────────────────────────────
// API Keys v1
// - O token completo (sk_live_...) é exibido UMA única vez na criação.
// - No banco guardamos apenas SHA-256 do token (nunca texto puro).
// - A autenticação da API é feita por hash do header Authorization.
// ─────────────────────────────────────────────────────────────

/** Normaliza o documento para o painel (nunca devolve o hash/token). */
function publicKey(doc: {
  _id: string;
  name: string;
  description?: string;
  prefix: string;
  lastFour: string;
  scopes: string[];
  serverId: string;
  addonId?: string;
  active: boolean;
  revokedAt?: number;
  lastUsedAt?: number;
  createdAt: number;
  createdBy?: string;
}) {
  return {
    _id: doc._id,
    name: doc.name,
    description: doc.description ?? "",
    prefix: doc.prefix,
    lastFour: doc.lastFour,
    scopes: doc.scopes,
    serverId: doc.serverId,
    addonId: doc.addonId ?? "",
    active: doc.active,
    revoked: Boolean(doc.revokedAt),
    lastUsedAt: doc.lastUsedAt,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy ?? "",
  };
}

// ─── Autenticação (usada pela action apiV1) ───

export const internalFindByHash = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    return await ctx.db
      .query("apiKeysV1")
      .withIndex("by_hash", (q) => q.eq("keyHash", hash))
      .first();
  },
});

export const internalTouchKey = internalMutation({
  args: { id: v.id("apiKeysV1") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { lastUsedAt: Date.now() });
  },
});

// ─── Admin: gerenciar chaves ───

/**
 * Só valida a sessão admin. Existe para as ACTIONS (que não têm `ctx.db`)
 * autorizarem por uma query antes de fazer chamadas externas.
 */
export const assertAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    return true;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    const keys = await ctx.db.query("apiKeysV1").collect();
    return keys
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((k) =>
        publicKey({
          _id: k._id as unknown as string,
          name: k.name,
          description: k.description,
          prefix: k.prefix,
          lastFour: k.lastFour,
          scopes: k.scopes,
          serverId: k.serverId,
          addonId: k.addonId,
          active: k.active,
          revokedAt: k.revokedAt,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
          createdBy: k.createdBy,
        }),
      );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    scopes: v.array(apiScopeValidator),
    serverId: v.optional(v.string()),
    addonId: v.optional(v.string()),
  },
  handler: async (ctx, { name, description, scopes, serverId, addonId }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const token = generateApiToken();
    const id = await ctx.db.insert("apiKeysV1", {
      name: name.trim() || "Integração",
      description: description?.trim() || undefined,
      prefix: tokenPrefix(token),
      keyHash: sha256Hex(token),
      lastFour: tokenLastFour(token),
      scopes,
      serverId: (serverId?.trim() || "GLOBAL"),
      addonId: addonId?.trim() || undefined,
      active: true,
      createdAt: Date.now(),
      createdBy: admin.name,
    });
    await logAudit(ctx, admin, "apikey_v1.create", "apiKeysV1", id, { name, scopes });
    // o token completo só é retornado aqui — nunca mais será exibido
    return { id, token };
  },
});

export const regenerate = mutation({
  args: { id: v.id("apiKeysV1") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error("Chave não encontrada");
    const token = generateApiToken();
    await ctx.db.patch(id, {
      prefix: tokenPrefix(token),
      keyHash: sha256Hex(token),
      lastFour: tokenLastFour(token),
      active: true,
      revokedAt: undefined,
      lastUsedAt: undefined,
    });
    await logAudit(ctx, admin, "apikey_v1.regenerate", "apiKeysV1", id, { name: doc.name });
    return { token };
  },
});

export const setActive = mutation({
  args: { id: v.id("apiKeysV1"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error("Chave não encontrada");
    await ctx.db.patch(id, {
      active,
      revokedAt: active ? undefined : Date.now(),
    });
    await logAudit(ctx, admin, active ? "apikey_v1.enable" : "apikey_v1.revoke", "apiKeysV1", id);
  },
});

export const remove = mutation({
  args: { id: v.id("apiKeysV1") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "apikey_v1.delete", "apiKeysV1", id);
  },
});

// ─── Admin: diagnóstico das integrações (nunca revela o segredo) ───

const HEARTBEAT_ONLINE_MS = 90_000;

export const adminDiagnostics = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    const keys = await ctx.db.query("apiKeysV1").collect();
    const servers = await ctx.db.query("addonServers").collect();
    const now = Date.now();
    return {
      keys: keys
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((k) => {
          const srv =
            servers.find((s) => s.serverId === k.serverId && k.addonId && s.addonId === k.addonId) ??
            servers.find((s) => s.serverId === k.serverId) ??
            null;
          return {
            id: k._id as unknown as string,
            name: k.name,
            prefix: k.prefix,
            lastFour: k.lastFour,
            scopes: k.scopes,
            serverId: k.serverId,
            addonId: k.addonId ?? "",
            active: k.active,
            revoked: Boolean(k.revokedAt),
            lastUsedAt: k.lastUsedAt ?? null,
            heartbeat: srv
              ? {
                  online: now - srv.lastSeenAt <= HEARTBEAT_ONLINE_MS,
                  lastSeenAt: srv.lastSeenAt,
                  version: srv.version ?? "",
                  minecraftVersion: srv.minecraftVersion ?? "",
                  apiClientVersion: srv.apiClientVersion ?? "",
                  lastErrorCode: srv.lastErrorCode ?? "",
                }
              : null,
          };
        }),
      servers: servers
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        .map((s) => ({
          serverId: s.serverId,
          addonId: s.addonId ?? "",
          online: now - s.lastSeenAt <= HEARTBEAT_ONLINE_MS,
          lastSeenAt: s.lastSeenAt,
          version: s.version ?? "",
          minecraftVersion: s.minecraftVersion ?? "",
          apiClientVersion: s.apiClientVersion ?? "",
          lastErrorCode: s.lastErrorCode ?? "",
        })),
    };
  },
});

/** Valida uma key: ativa, com scopes, com vínculo e com heartbeat recente. */
export const adminTestKey = query({
  args: { id: v.id("apiKeysV1") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "integrations.manage");
    const k = await ctx.db.get(id);
    if (!k) return { ok: false, checks: [], key: null, server: null };
    const servers = await ctx.db.query("addonServers").collect();
    const srv = servers.find((s) => s.serverId === k.serverId) ?? null;
    const now = Date.now();
    const checks = [
      { label: "Chave ativa", ok: k.active && !k.revokedAt },
      { label: "Possui permissões (scopes)", ok: (k.scopes?.length ?? 0) > 0 },
      { label: "Vínculo definido (server_id)", ok: Boolean(k.serverId) },
      { label: "Heartbeat recente do servidor", ok: Boolean(srv && now - srv.lastSeenAt <= HEARTBEAT_ONLINE_MS) },
    ];
    return {
      ok: checks.every((c) => c.ok),
      checks,
      key: {
        id: k._id as unknown as string,
        name: k.name,
        prefix: k.prefix,
        lastFour: k.lastFour,
        scopes: k.scopes,
        serverId: k.serverId,
        addonId: k.addonId ?? "",
        active: k.active,
        revoked: Boolean(k.revokedAt),
        lastUsedAt: k.lastUsedAt ?? null,
      },
      server: srv
        ? {
            serverId: srv.serverId,
            online: now - srv.lastSeenAt <= HEARTBEAT_ONLINE_MS,
            lastSeenAt: srv.lastSeenAt,
            version: srv.version ?? "",
            minecraftVersion: srv.minecraftVersion ?? "",
            lastErrorCode: srv.lastErrorCode ?? "",
          }
        : null,
    };
  },
});

/** Cria uma chave sem exigir admin — usado APENAS pelos testes (internal). */
export const devCreateForTests = internalMutation({
  args: {
    name: v.optional(v.string()),
    scopes: v.array(v.string()),
    serverId: v.optional(v.string()),
    addonId: v.optional(v.string()),
  },
  handler: async (ctx, { name, scopes, serverId, addonId }) => {
    const token = generateApiToken();
    const id = await ctx.db.insert("apiKeysV1", {
      name: name ?? "Teste",
      prefix: tokenPrefix(token),
      keyHash: sha256Hex(token),
      lastFour: tokenLastFour(token),
      scopes,
      serverId: serverId ?? "GLOBAL",
      addonId: addonId ?? undefined,
      active: true,
      createdAt: Date.now(),
      createdBy: "tests",
    });
    return { id, token };
  },
});
