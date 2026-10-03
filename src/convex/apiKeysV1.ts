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
