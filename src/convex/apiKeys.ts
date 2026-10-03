import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Chaves de API para integrações externas.
// Sistemas externos (ex.: plugin do servidor Minecraft) usam a chave
// para consultar produtos e registrar entregas sem acesso ao painel.
// ─────────────────────────────────────────────────────────────

function generateApiKey(): { key: string; prefix: string } {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  const key =
    "ak_live_" +
    Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  return { key, prefix: key.slice(0, 12) };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    const keys = await ctx.db.query("apiKeys").collect();
    return keys.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const { key, prefix } = generateApiKey();
    const id = await ctx.db.insert("apiKeys", {
      name: name.trim() || "Integração externa",
      prefix,
      key,
      active: true,
      createdAt: Date.now(),
      createdBy: admin.name,
    });
    await logAudit(ctx, admin, "apikey.create", "apiKey", id, { name });
    return { id, key };
  },
});

export const setActive = mutation({
  args: { id: v.id("apiKeys"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    await ctx.db.patch(id, { active });
    await logAudit(ctx, admin, active ? "apikey.enable" : "apikey.disable", "apiKey", id);
  },
});

export const remove = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "apikey.delete", "apiKey", id);
  },
});
