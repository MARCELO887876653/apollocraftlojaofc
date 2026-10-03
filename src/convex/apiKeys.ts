import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import crypto from "node:crypto";
import { API_SCOPES, apiScopeValidator } from "./lib/apiSchema";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────
// API Keys v1 (domina a tabela antiga `apiKeys` existente)
// ─────────────────────────────────────────────────────────────

const HEX = "0123456789abcdef";

function randomHex(n: number): string {
  const bytes = crypto.randomBytes(n);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i] >> 4 & 15] + HEX[bytes[i] & 15];
  return s;
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf-8").digest("hex");
}

/** Gera { token, prefix, hash, lastFour } — token aparece uma única vez. */
export function newApiKey(name: string): { token: string; prefix: string; hash: string; lastFour: string } {
  const token = `sk_live_${randomHex(24)}`;
  const encoder = new TextEncoder();
  return {
    token,
    prefix: token.slice(0, 13),
    lastFour: token.slice(-4),
    hash: sha256Hex(token),
  };
}

export const internalGetByKeyHash = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) =>
    await ctx.db.query("apiKeysV1").withIndex("by_hash", (q) => q.eq("keyHash", hash)).first(),
});

/** Converte um token em credencial autenticada (valida ativo/revogado/prefix). */
export const internalAuthenticate = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token.startsWith("sk_live_")) return null;
    const hash = sha256Hex(token);
    const doc = await ctx.db
      .query("apiKeysV1")
      .withIndex("by_hash", (q: any) => q.eq("keyHash", hash))
      .first();
    if (!doc || doc.revokedAt || !doc.active) return null;
    return doc;
  },
});

export const internalTouchKey = internalMutation({
  args: { id: v.id("apiKeysV1"), ip: v.optional(v.string()) },
  handler: async (ctx, { id, ip }) => {
    await ctx.db.patch(id, { lastUsedAt: Date.now(), lastUsedIp: ip });
  },
});

// ─── Painel admin ───

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    const keys = await ctx.db.query("apiKeysV1").collect();
    return keys
      .map((k: any) => ({
        _id: k._id,
        name: k.name,
        description: k.description,
        serverId: k.serverId,
        addonId: k.addonId,
        prefix: k.prefix,
        lastFour: k.lastFour,
        scopes: k.scopes ?? [],
        active: k.active,
        revoked: Boolean(k.revokedAt),
        lastUsedAt: k.lastUsedAt,
        lastUsedIp: k.lastUsedIp,
        createdAt: k.createdAt,
        regeneratedAt: k.regeneratedAt,
      }))
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

export const adminCreate = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    serverId: v.string(),
    addonId: v.optional(v.string()),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, { name, description, serverId, addonId, scopes }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const valid = scopes.filter((s) => (API_SCOPES as readonly string[]).includes(s));
    if (valid.length === 0) throw new Error("Selecione ao menos uma permissão (scope)");
    const t = newApiKey(name);
    const now = Date.now();
    const id = await ctx.db.insert("apiKeysV1", {
      name,
      description,
      serverId: serverId || "GLOBAL",
      addonId,
      prefix: t.prefix,
      keyHash: t.hash,
      lastFour: t.lastFour,
      scopes: valid as any,
      active: true,
      createdAt: now,
      createdBy: admin.name,
    });
    await logAudit(ctx, admin, "apikey.create", "apiKeysV1", id, { name, serverId, scopes: valid.length });
    return { id, token: t.token }; // token completo - Uma única vez
  },
});

export const adminRegenerate = mutation({
  args: { id: v.id("apiKeysV1") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const doc: any = await ctx.db.get(id);
    if (!doc) throw new Error("Chave não encontrada");
    const t = newApiKey(doc.name);
    await ctx.db.patch(id, {
      prefix: t.prefix,
      keyHash: t.hash,
      lastFour: t.lastFour,
      regeneratedAt: Date.now(),
      active: true,
      revokedAt: undefined,
    });
    await logAudit(ctx, admin, "apikey.regenerate", "apiKeysV1", id, { name: doc.name });
    return { token: t.token };
  },
});

export const adminSetActive = mutation({
  args: { id: v.id("apiKeysV1"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    await ctx.db.patch(id, {
      active,
      revokedAt: active ? undefined : Date.now(),
    });
    await logAudit(ctx, admin, active ? "apikey.enable" : "apikey.disable", "apiKeysV1", id);
  },
});

export const adminRemove = mutation({
  args: { id: v.id("apiKeysV1") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "apikey.delete", "apiKeysV1", id);
  },
});

// ─── Dev seed: gera chaves reais para os testes automatizados ───
// Apenas usado pelos scripts de verificação do projeto.

export const devCreateForTests = mutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, { name, scopes }) => {
    const valid = scopes.filter((s) => (API_SCOPES as readonly string[]).includes(s)) || API_SCOPES;
    const admin = "dev-seed";
    const t = newApiKey(name);
    const id = await ctx.db.insert("apiKeysV1", {
      name,
      description: "dev-seed — usada apenas nos scripts de verificação do projeto",
      serverId: "GLOBAL",
      addonId: undefined,
      prefix: t.prefix,
      keyHash: t.hash,
      lastFour: t.lastFour,
      scopes: valid as any,
      active: true,
      createdAt: Date.now(),
      createdBy: admin,
    });
    await logAudit(ctx, { name: admin } as any, "apikey.create", "apiKeysV1", id, { name });
    return { id, token: t.token };
  },
});
