import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  requireAdmin, logAudit, hasPermission, ALL_PERMISSIONS, ROLE_PRESETS,
} from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Equipe administrativa (RBAC) — owner gerencia tudo
// ─────────────────────────────────────────────────────────────

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const admin = await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", user.email!))
      .first();
    if (!admin) return { user, admin: null };
    return {
      user,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        active: admin.active,
      },
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "team.manage");
    return await ctx.db.query("adminUsers").collect();
  },
});

const MEMBER_FIELDS = [
  "orders.view", "orders.manage",
  "products.manage", "categories.manage",
  "customers.view", "coupons.manage",
  "content.manage", "appearance.manage",
  "settings.manage", "integrations.manage",
  "deliveries.view", "deliveries.manage",
  "finance.view", "logs.view",
];

export const upsert = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.string(),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { email, name, role, permissions }) => {
    const admin = await requireAdmin(ctx, "team.manage");
    const normalized = email.trim().toLowerCase();
    const existing = await ctx.db
      .query("adminUsers")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
    const perms =
      role === "owner"
        ? ALL_PERMISSIONS
        : role !== "custom" && ROLE_PRESETS[role]
          ? ROLE_PRESETS[role].permissions
          : (permissions ?? []);

    if (existing) {
      await ctx.db.patch(existing._id, { name, role, permissions: perms });
      await logAudit(ctx, admin, "team.update", "adminUser", existing._id, { email: normalized, role });
      return existing._id;
    }
    const id = await ctx.db.insert("adminUsers", {
      email: normalized,
      name,
      role,
      permissions: perms,
      active: true,
      createdAt: Date.now(),
    });
    await logAudit(ctx, admin, "team.invite", "adminUser", id, { email: normalized, role });
    return id;
  },
});

export const setActive = mutation({
  args: { id: v.id("adminUsers"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const admin = await requireAdmin(ctx, "team.manage");
    const target = await ctx.db.get(id);
    if (!target) throw new Error("Membro não encontrado");
    if (target.role === "owner" && !active)
      throw new Error("O owner não pode ser desativado");
    await ctx.db.patch(id, { active });
    await logAudit(ctx, admin, "team.set_active", "adminUser", id, { active });
  },
});

export const remove = mutation({
  args: { id: v.id("adminUsers") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "team.manage");
    const target = await ctx.db.get(id);
    if (!target) return;
    if (target.role === "owner") throw new Error("O owner não pode ser removido");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "team.remove", "adminUser", id, { email: target.email });
  },
});

/** Bootstrap: o primeiro usuário autenticado torna-se owner se nenhum admin existir. */
export const claimOwnership = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { claimed: false as const, reason: "unauthenticated" as const };
    }
    const user = await ctx.db.get(userId);
    if (!user?.email) {
      return { claimed: false as const, reason: "no-email" as const };
    }
    const anyAdmin = await ctx.db.query("adminUsers").first();
    if (anyAdmin) {
      return { claimed: false as const, reason: "already-exists" as const };
    }
    const id = await ctx.db.insert("adminUsers", {
      email: user.email,
      name: user.name ?? user.email.split("@")[0],
      userId,
      role: "owner",
      permissions: ALL_PERMISSIONS,
      active: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });
    await logAudit(ctx, null, "team.claim_owner", "adminUser", id, { email: user.email });
    return { claimed: true as const };
  },
});

export { MEMBER_FIELDS, hasPermission };
