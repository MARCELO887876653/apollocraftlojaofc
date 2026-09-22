import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { slugify } from "./lib/data";

// ─────────────────────────────────────────────────────────────
// Conteúdo: páginas institucionais, blog, FAQ e banners
// ─────────────────────────────────────────────────────────────

// ─── Páginas ───

export const getPageBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

export const listActivePages = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("pages").collect();
    return all.filter((p) => p.active).sort((a, b) => a.title.localeCompare(b.title));
  },
});

export const listPages = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "content.manage");
    const all = await ctx.db.query("pages").collect();
    return all.sort((a, b) => a.title.localeCompare(b.title));
  },
});

const pageInput = v.object({
  title: v.string(),
  slug: v.optional(v.string()),
  content: v.string(),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  active: v.boolean(),
});

export const savePage = mutation({
  args: { id: v.optional(v.id("pages")), data: pageInput },
  handler: async (ctx, { id, data }) => {
    const admin = await requireAdmin(ctx, "content.manage");
    const slug = data.slug ? slugify(data.slug) : slugify(data.title);
    const now = Date.now();
    if (id) {
      await ctx.db.patch(id, { ...data, slug, updatedAt: now });
      await logAudit(ctx, admin, "page.update", "page", id, { title: data.title });
    } else {
      const newId = await ctx.db.insert("pages", {
        ...data,
        slug,
        createdAt: now,
        updatedAt: now,
      });
      await logAudit(ctx, admin, "page.create", "page", newId, { title: data.title });
      return newId;
    }
  },
});

export const removePage = mutation({
  args: { id: v.id("pages") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "content.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "page.delete", "page", id);
  },
});

// ─── Blog ───

export const listPublishedPosts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db.query("posts").collect();
    const published = all
      .filter((p) => p.status === "published")
      .sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt));
    return published.slice(0, limit ?? 20);
  },
});

export const getPostBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

export const listPosts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "content.manage");
    const all = await ctx.db.query("posts").collect();
    return all.sort(
      (a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt),
    );
  },
});

const postInput = v.object({
  title: v.string(),
  slug: v.optional(v.string()),
  cover: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  content: v.string(),
  author: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published")),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
});

export const savePost = mutation({
  args: { id: v.optional(v.id("posts")), data: postInput },
  handler: async (ctx, { id, data }) => {
    const admin = await requireAdmin(ctx, "content.manage");
    const slug = data.slug ? slugify(data.slug) : slugify(data.title);
    const now = Date.now();
    if (id) {
      const current = await ctx.db.get(id);
      await ctx.db.patch(id, {
        ...data,
        slug,
        publishedAt:
          data.status === "published" && !current?.publishedAt ? now : current?.publishedAt,
        updatedAt: now,
      });
      await logAudit(ctx, admin, "post.update", "post", id, { title: data.title });
    } else {
      const newId = await ctx.db.insert("posts", {
        ...data,
        slug,
        publishedAt: data.status === "published" ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });
      await logAudit(ctx, admin, "post.create", "post", newId, { title: data.title });
      return newId;
    }
  },
});

export const removePost = mutation({
  args: { id: v.id("posts") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "content.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "post.delete", "post", id);
  },
});

// ─── FAQ ───

export const listFaqs = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, { activeOnly }) => {
    const all = await ctx.db.query("faqs").collect();
    const list = activeOnly ? all.filter((f) => f.active) : all;
    return list.sort((a, b) => a.order - b.order);
  },
});

export const saveFaq = mutation({
  args: {
    id: v.optional(v.id("faqs")),
    question: v.string(),
    answer: v.string(),
    order: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, { id, question, answer, order, active }) => {
    const admin = await requireAdmin(ctx, "content.manage");
    if (id) {
      await ctx.db.patch(id, { question, answer, order, active });
      await logAudit(ctx, admin, "faq.update", "faq", id);
    } else {
      const newId = await ctx.db.insert("faqs", { question, answer, order, active });
      await logAudit(ctx, admin, "faq.create", "faq", newId);
      return newId;
    }
  },
});

export const removeFaq = mutation({
  args: { id: v.id("faqs") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "content.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "faq.delete", "faq", id);
  },
});

export const reorderFaqs = mutation({
  args: { ids: v.array(v.id("faqs")) },
  handler: async (ctx, { ids }) => {
    await requireAdmin(ctx, "content.manage");
    for (let i = 0; i < ids.length; i++) await ctx.db.patch(ids[i], { order: i });
  },
});

// ─── Banners ───

export const listBanners = query({
  args: { position: v.optional(v.string()), activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, { position, activeOnly }) => {
    if (position) {
      const byPos = await ctx.db
        .query("banners")
        .withIndex("by_position", (q) => q.eq("position", position))
        .collect();
      return activeOnly ? byPos.filter((b) => b.active) : byPos;
    }
    const all = await ctx.db.query("banners").collect();
    return activeOnly ? all.filter((b) => b.active) : all;
  },
});

export const saveBanner = mutation({
  args: {
    id: v.optional(v.id("banners")),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    imageDesktop: v.optional(v.string()),
    imageMobile: v.optional(v.string()),
    buttonText: v.optional(v.string()),
    buttonUrl: v.optional(v.string()),
    position: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, "content.manage");
    const { id, ...data } = args;
    if (id) {
      await ctx.db.patch(id, data);
      await logAudit(ctx, admin, "banner.update", "banner", id);
    } else {
      const newId = await ctx.db.insert("banners", { ...data, createdAt: Date.now() });
      await logAudit(ctx, admin, "banner.create", "banner", newId);
      return newId;
    }
  },
});

export const removeBanner = mutation({
  args: { id: v.id("banners") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "content.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "banner.delete", "banner", id);
  },
});
