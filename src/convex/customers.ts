import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/admin";

// ─── Admin ───

export const adminList = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requireAdmin(ctx, "customers.view");
    const all = await ctx.db.query("customers").collect();
    const list = all.sort((a, b) => b.totalSpentCents - a.totalSpentCents);
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(
      (c) =>
        c.email.toLowerCase().includes(s) ||
        c.name?.toLowerCase().includes(s) ||
        c.minecraftNick?.toLowerCase().includes(s) ||
        c.discord?.toLowerCase().includes(s),
    );
  },
});

export const adminGet = query({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "customers.view");
    const customer = await ctx.db.get(id);
    if (!customer) return null;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("customerEmail", customer.email))
      .collect();
    orders.sort((a, b) => b.createdAt - a.createdAt);
    return { customer, orders };
  },
});

// ─── Conta do cliente (autenticado) ───

export const myOrders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("customerEmail", user.email!))
      .collect();
    orders.sort((a, b) => b.createdAt - a.createdAt);
    return orders;
  },
});
