import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { slugify } from "./lib/data";

// ─── Público ───

export const listActive = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("relevance"), v.literal("price_asc"), v.literal("price_desc"), v.literal("newest"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { categoryId, search, sort, limit }) => {
    let products;
    if (categoryId) {
      products = await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
        .collect();
    } else {
      products = await ctx.db.query("products").collect();
    }
    let list = products.filter((p) => p.active && !p.hidden);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.shortDescription?.toLowerCase().includes(s) ||
          p.tags.some((t) => t.toLowerCase().includes(s)),
      );
    }
    switch (sort) {
      case "price_asc":
        list.sort((a, b) => a.priceCents - b.priceCents);
        break;
      case "price_desc":
        list.sort((a, b) => b.priceCents - a.priceCents);
        break;
      case "newest":
        list.sort((a, b) => b.createdAt - a.createdAt);
        break;
      default:
        list.sort((a, b) => a.order - b.order || b.salesCount - a.salesCount);
    }
    return list.slice(0, limit ?? 60);
  },
});

export const listFeatured = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db
      .query("products")
      .withIndex("by_active_order", (q) => q.eq("active", true))
      .collect();
    return all
      .filter((p) => !p.hidden && p.featured)
      .sort((a, b) => a.order - b.order)
      .slice(0, limit ?? 8);
  },
});

export const listPopular = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db
      .query("products")
      .withIndex("by_active_order", (q) => q.eq("active", true))
      .collect();
    return all
      .filter((p) => !p.hidden && p.popular)
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, limit ?? 8);
  },
});

export const listPromo = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db
      .query("products")
      .withIndex("by_active_order", (q) => q.eq("active", true))
      .collect();
    return all
      .filter(
        (p) =>
          !p.hidden &&
          p.compareAtPriceCents !== undefined &&
          p.compareAtPriceCents > p.priceCents,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit ?? 8);
  },
});

export const listNewest = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db
      .query("products")
      .withIndex("by_active_order", (q) => q.eq("active", true))
      .collect();
    return all
      .filter((p) => !p.hidden)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit ?? 8);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!product || !product.active || product.hidden) return null;
    const variants = (
      await ctx.db
        .query("productVariants")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .collect()
    )
      .filter((v) => v.active)
      .sort((a, b) => a.order - b.order);
    const category = product.categoryId
      ? await ctx.db.get(product.categoryId)
      : null;
    return { product, variants, category };
  },
});

export const listRelated = query({
  args: { productId: v.id("products"), categoryId: v.optional(v.id("categories")), limit: v.optional(v.number()) },
  handler: async (ctx, { productId, categoryId, limit }) => {
    let list;
    if (categoryId) {
      list = await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
        .collect();
    } else {
      list = await ctx.db.query("products").collect();
    }
    return list
      .filter((p) => p.active && !p.hidden && p._id !== productId)
      .slice(0, limit ?? 4);
  },
});

// ─── Admin ───

export const adminList = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requireAdmin(ctx, "products.manage");
    const all = await ctx.db.query("products").collect();
    const list = all.sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(
      (p) => p.name.toLowerCase().includes(s) || p.slug.includes(s),
    );
  },
});

export const adminGet = query({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "products.manage");
    const product = await ctx.db.get(id);
    if (!product) return null;
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", id))
      .collect();
    variants.sort((a, b) => a.order - b.order);
    return { product, variants };
  },
});

const deliveryValidator = v.object({
  type: v.union(
    v.literal("none"), v.literal("command"), v.literal("api"),
    v.literal("webhook"), v.literal("code"), v.literal("message"), v.literal("manual"),
  ),
  commands: v.optional(v.array(v.string())),
  apiUrl: v.optional(v.string()),
  apiMethod: v.optional(v.union(v.literal("GET"), v.literal("POST"))),
  apiHeaders: v.optional(v.array(v.object({ k: v.string(), v: v.string() }))),
  apiBody: v.optional(v.string()),
  message: v.optional(v.string()),
  codes: v.optional(v.array(v.string())),
  showToCustomer: v.boolean(),
});

const productInput = v.object({
  name: v.string(),
  shortDescription: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  images: v.array(v.string()),
  categoryId: v.optional(v.id("categories")),
  tags: v.array(v.string()),
  priceCents: v.number(),
  compareAtPriceCents: v.optional(v.number()),
  stock: v.number(),
  unlimitedStock: v.boolean(),
  active: v.boolean(),
  featured: v.boolean(),
  popular: v.boolean(),
  hidden: v.boolean(),
  minQty: v.number(),
  maxQty: v.number(),
  order: v.number(),
  benefits: v.array(v.string()),
  delivery: deliveryValidator,
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
});

export const create = mutation({
  args: { data: productInput },
  handler: async (ctx, { data }) => {
    const admin = await requireAdmin(ctx, "products.manage");
    let slug = slugify(data.name);
    const clash = await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const now = Date.now();
    const id = await ctx.db.insert("products", {
      ...data,
      slug,
      salesCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, admin, "product.create", "product", id, { name: data.name });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("products"), data: productInput },
  handler: async (ctx, { id, data }) => {
    const admin = await requireAdmin(ctx, "products.manage");
    await ctx.db.patch(id, { ...data, updatedAt: Date.now() });
    await logAudit(ctx, admin, "product.update", "product", id, { name: data.name });
  },
});

export const remove = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "products.manage");
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", id))
      .collect();
    for (const vdoc of variants) await ctx.db.delete(vdoc._id);
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "product.delete", "product", id);
  },
});

// ─── Variantes ───

const variantInput = v.object({
  name: v.string(),
  priceCents: v.number(),
  compareAtPriceCents: v.optional(v.number()),
  stock: v.number(),
  unlimitedStock: v.boolean(),
  order: v.number(),
  active: v.boolean(),
  sku: v.optional(v.string()),
});

export const createVariant = mutation({
  args: { productId: v.id("products"), data: variantInput },
  handler: async (ctx, { productId, data }) => {
    const admin = await requireAdmin(ctx, "products.manage");
    const id = await ctx.db.insert("productVariants", { productId, ...data });
    await logAudit(ctx, admin, "product.variant_create", "product", productId, { name: data.name });
    return id;
  },
});

export const updateVariant = mutation({
  args: { id: v.id("productVariants"), data: variantInput },
  handler: async (ctx, { id, data }) => {
    await requireAdmin(ctx, "products.manage");
    await ctx.db.patch(id, data);
  },
});

export const removeVariant = mutation({
  args: { id: v.id("productVariants") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "products.manage");
    await ctx.db.delete(id);
  },
});
