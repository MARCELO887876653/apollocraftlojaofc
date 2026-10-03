import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { API_SCOPES } from "./lib/apiSchema";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────
// API Keys v1 — token só aparece UMA VEZ; no banco fica só o hash.
// Formato: sk_live_<32 hex>  |  Auth: Authorization: Bearer <token>
// ─────────────────────────────────────────────────────────────

export const SCOPE_LIST = API_SCOPES;

function generateToken(): { token: string; prefix: string; hash: string; lastFour: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const token = `sk_live_${hex}`;
  const encoder = new TextEncoder();
  return {
    token,
    prefix: token.slice(0, 13),
    hash: sha256Hex(encoder.encode(token)),
    lastFour: token.slice(-4),
  };
}

function sha256Hex(data: Uint8Array): string {
  // Implementação síncrona (SHA-256 pura) para uso em mutation.
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const l = data.length;
  const bitLen = l * 8;
  const padded = new Uint8Array((((l + 8) >> 6) + 1) << 6);
  padded.set(data);
  padded[l] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
}

export const hashToken = internalQuery({
  args: { token: v.string() },
  handler: async (_ctx, { token }) => sha256Hex(new TextEncoder().encode(token)),
});

/** Converte um token em credencial autenticada (usado por todos os endpoints). */
export const internalAuthenticate = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token.startsWith("sk_live_")) return null;
    const prefix = token.slice(0, 13);
    const hash = sha256Hex(new TextEncoder().encode(token));
    const doc = await ctx.db
      .query("apiKeysV1")
      .withIndex("by_prefix", (q: any) => q.eq("prefix", prefix))
      .first();
    if (!doc || doc.keyHash !== hash) return null;
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
        scopes: k.scopes,
        active: k.active,
        revoked: Boolean(k.revokedAt),
        lastUsedAt: k.lastUsedAt,
        lastUsedIp: k.lastUsedIp,
        createdAt: k.createdAt,
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
    const valid = scopes.filter((s) => (SCOPE_LIST as readonly string[]).includes(s));
    if (valid.length === 0) throw new Error("Selecione ao menos uma permissão");
    const t = generateToken();
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
    await logAudit(ctx, admin, "apikey.create", "apiKeysV1", id, { name, serverId });
    // token completo retornado UMA ÚNICA VEZ
    return { id, token: t.token };
  },
});

export const adminRegenerate = mutation({
  args: { id: v.id("apiKeysV1") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const doc: any = await ctx.db.get(id);
    if (!doc) throw new Error("Chave não encontrada");
    const t = generateToken();
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
    await logAudit(ctx, admin, active ? "apikey.enable" : "apikey.revoke", "apiKeysV1", id);
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
