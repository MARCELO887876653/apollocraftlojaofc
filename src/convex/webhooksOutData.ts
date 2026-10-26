import { internalQuery, internalMutation, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Dados dos webhooks de saída + CRUD admin (runtime padrão)
// ─────────────────────────────────────────────────────────────

export const internalListActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Índice em `active` (em vez de ler a tabela inteira para filtrar).
    return await ctx.db
      .query("webhooksOut")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
  },
});

export const internalListAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("webhooksOut").collect();
  },
});

export const log = internalMutation({
  args: {
    webhookId: v.optional(v.id("webhooksOut")),
    event: v.string(),
    url: v.string(),
    statusCode: v.optional(v.number()),
    error: v.optional(v.string()),
    attempt: v.number(),
  },
  handler: async (ctx, entry) => {
    await ctx.db.insert("webhookLogs", { ...entry, createdAt: Date.now() });
  },
});

export const registerFailure = internalMutation({
  args: { id: v.id("webhooksOut") },
  handler: async (ctx, { id }) => {
    const hook = await ctx.db.get(id);
    if (!hook) return;
    await ctx.db.patch(id, { failureCount: hook.failureCount + 1 });
  },
});

// ─── Admin ───

const DAY_MS = 24 * 60 * 60 * 1000;

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    const hooks = await ctx.db.query("webhooksOut").collect();
    const logs = await ctx.db.query("webhookLogs").collect();
    const orderedLogs = logs.sort((a, b) => b.createdAt - a.createdAt);
    const cutoff = Date.now() - DAY_MS;
    const recent = orderedLogs.filter((l) => l.createdAt >= cutoff);
    const success = recent.filter(
      (l) => typeof l.statusCode === "number" && l.statusCode >= 200 && l.statusCode < 300,
    ).length;
    return {
      hooks: hooks
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(({ secret: _secret, ...rest }) => rest),
      logs: orderedLogs.slice(0, 50),
      stats: {
        deliveries24h: recent.length,
        successRate: recent.length ? Math.round((success / recent.length) * 100) : null,
      },
    };
  },
});

/** Verificação de admin usada por actions em Node (o ctx de action não tem db). */
export const assertAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    return true;
  },
});

const webhookInput = v.object({
  name: v.optional(v.string()),
  url: v.string(),
  secret: v.optional(v.string()),
  events: v.array(v.string()),
  active: v.boolean(),
});

export const save = mutation({
  args: { id: v.optional(v.id("webhooksOut")), data: webhookInput },
  handler: async (ctx, { id, data }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const existing = id ? await ctx.db.get(id) : null;
    // Preserva o segredo existente quando a edição não envia um novo.
    const secret = data.secret?.trim() || existing?.secret;
    if (!secret) throw new Error("Segredo do webhook é obrigatório");
    const clean = {
      name: data.name?.trim() || undefined,
      url: data.url.trim(),
      secret,
      events: data.events.length ? data.events : ["*"],
      active: data.active,
    };
    if (id) {
      await ctx.db.patch(id, clean);
      await logAudit(ctx, admin, "webhook.update", "webhook", id, clean);
    } else {
      const newId = await ctx.db.insert("webhooksOut", {
        ...clean,
        failureCount: 0,
        createdAt: Date.now(),
      });
      await logAudit(ctx, admin, "webhook.create", "webhook", newId, clean);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("webhooksOut") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "webhook.delete", "webhook", id);
  },
});
