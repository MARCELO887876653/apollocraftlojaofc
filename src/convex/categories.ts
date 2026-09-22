import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { slugify } from "./lib/data";

// ─── Público ───

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("categories").collect();
    const active = all
      .filter((c) => c.active)
      .sort((a, b) => a.order - b.order);
    return active;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

// ─── Admin ───

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "categories.manage");
    const all = await ctx.db.query("categories").collect();
    return all.sort((a, b) => a.order - b.order);
  },
});

const categoryInput = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  icon: v.optional(v.string()),
  image: v.optional(v.string()),
  color: v.optional(v.string()),
  parentId: v.optional(v.id("categories")),
  order: v.number(),
  active: v.boolean(),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
});

export const create = mutation({
  args: { data: categoryInput },
  handler: async (ctx, { data }) => {
    const admin = await requireAdmin(ctx, "categories.manage");
    let slug = slugify(data.name);
    const clash = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const id = await ctx.db.insert("categories", {
      ...data,
      slug,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logAudit(ctx, admin, "category.create", "category", id, { name: data.name });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("categories"), data: categoryInput },
  handler: async (ctx, { id, data }) => {
    const admin = await requireAdmin(ctx, "categories.manage");
    if (data.parentId === id) throw new Error("Categoria não pode ser pai dela mesma");
    await ctx.db.patch(id, { ...data, updatedAt: Date.now() });
    await logAudit(ctx, admin, "category.update", "category", id, data);
  },
});

export const remove = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "categories.manage");
    const children = await ctx.db
      .query("categories")
      .withIndex("by_parent_order", (q) => q.eq("parentId", id))
      .first();
    if (children) throw new Error("Remova ou mova as subcategorias primeiro");
    const products = await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("categoryId", id))
      .first();
    if (products) throw new Error("Existem produtos nesta categoria");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "category.delete", "category", id);
  },
});

export const reorder = mutation({
  args: { ids: v.array(v.id("categories")) },
  handler: async (ctx, { ids }) => {
    await requireAdmin(ctx, "categories.manage");
    for (let i = 0; i < ids.length; i++) {
      await ctx.db.patch(ids[i], { order: i });
    }
  },
});
