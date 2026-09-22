import { internalQuery, internalMutation, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Dados dos webhooks de saída + CRUD admin (runtime padrão)
// ─────────────────────────────────────────────────────────────

export const internalListActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("webhooksOut").collect();
    return all.filter((w) => w.active);
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

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    const hooks = await ctx.db.query("webhooksOut").collect();
    const logs = await ctx.db.query("webhookLogs").collect();
    return {
      hooks: hooks.sort((a, b) => a.createdAt - b.createdAt),
      logs: logs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50),
    };
  },
});

const webhookInput = v.object({
  url: v.string(),
  secret: v.string(),
  events: v.array(v.string()),
  active: v.boolean(),
});

export const save = mutation({
  args: { id: v.optional(v.id("webhooksOut")), data: webhookInput },
  handler: async (ctx, { id, data }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    if (id) {
      await ctx.db.patch(id, data);
      await logAudit(ctx, admin, "webhook.update", "webhook", id, data);
    } else {
      const newId = await ctx.db.insert("webhooksOut", {
        ...data,
        failureCount: 0,
        createdAt: Date.now(),
      });
      await logAudit(ctx, admin, "webhook.create", "webhook", newId, data);
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
