import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";

// ─── Admin ───

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "coupons.manage");
    return await ctx.db.query("coupons").collect();
  },
});

const couponInput = v.object({
  code: v.string(),
  type: v.union(v.literal("percent"), v.literal("fixed")),
  value: v.number(),
  minSubtotalCents: v.optional(v.number()),
  maxDiscountCents: v.optional(v.number()),
  maxUses: v.optional(v.number()),
  maxUsesPerCustomer: v.optional(v.number()),
  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),
  productIds: v.optional(v.array(v.id("products"))),
  categoryIds: v.optional(v.array(v.id("categories"))),
  excludedProductIds: v.optional(v.array(v.id("products"))),
  active: v.boolean(),
});

export const create = mutation({
  args: { data: couponInput },
  handler: async (ctx, { data }) => {
    const admin = await requireAdmin(ctx, "coupons.manage");
    const code = data.code.trim().toUpperCase();
    const clash = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (clash) throw new Error("Já existe um cupom com este código");
    const id = await ctx.db.insert("coupons", {
      ...data,
      code,
      usesCount: 0,
      totalDiscountCents: 0,
      createdAt: Date.now(),
    });
    await logAudit(ctx, admin, "coupon.create", "coupon", id, { code });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("coupons"), data: couponInput },
  handler: async (ctx, { id, data }) => {
    const admin = await requireAdmin(ctx, "coupons.manage");
    const code = data.code.trim().toUpperCase();
    await ctx.db.patch(id, { ...data, code });
    await logAudit(ctx, admin, "coupon.update", "coupon", id, { code });
  },
});

export const remove = mutation({
  args: { id: v.id("coupons") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "coupons.manage");
    await ctx.db.delete(id);
    await logAudit(ctx, admin, "coupon.delete", "coupon", id);
  },
});

export const usages = query({
  args: { couponId: v.id("coupons") },
  handler: async (ctx, { couponId }) => {
    await requireAdmin(ctx, "coupons.manage");
    return await ctx.db
      .query("couponUsages")
      .withIndex("by_coupon", (q) => q.eq("couponId", couponId))
      .collect();
  },
});

// ─── Validação pública (usada pelo checkout; o servidor sempre recalcula) ───

export const validate = query({
  args: {
    code: v.string(),
    items: v.array(
      v.object({
        productId: v.id("products"),
        variantId: v.optional(v.id("productVariants")),
        quantity: v.number(),
      }),
    ),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { code, items, email }) => {
    const normalized = code.trim().toUpperCase();
    const coupon = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (!coupon || !coupon.active) return { ok: false as const, error: "Cupom inválido" };

    const now = Date.now();
    if (coupon.startsAt && now < coupon.startsAt) return { ok: false as const, error: "Cupom ainda não começou" };
    if (coupon.endsAt && now > coupon.endsAt) return { ok: false as const, error: "Cupom expirado" };
    if (coupon.maxUses && coupon.usesCount >= coupon.maxUses) return { ok: false as const, error: "Cupom esgotado" };

    if (coupon.maxUsesPerCustomer && email) {
      const usages = await ctx.db
        .query("couponUsages")
        .withIndex("by_coupon_email", (q) => q.eq("couponId", coupon._id).eq("email", email))
        .collect();
      if (usages.length >= coupon.maxUsesPerCustomer)
        return { ok: false as const, error: "Você já usou este cupom o máximo de vezes" };
    }

    // calcula subtotal elegível (aplicando restrições de produto/categoria)
    let subtotal = 0;
    for (const item of items) {
      const product = await ctx.db.get(item.productId);
      if (!product || !product.active || product.hidden) continue;
      if (coupon.excludedProductIds?.includes(item.productId)) continue;
      if (coupon.productIds?.length && !coupon.productIds.includes(item.productId)) continue;
      if (coupon.categoryIds?.length) {
        const cat = product.categoryId;
        if (!cat || !coupon.categoryIds.includes(cat)) continue;
      }
      const unit = item.variantId
        ? (await ctx.db.get(item.variantId))?.priceCents ?? product.priceCents
        : product.priceCents;
      subtotal += unit * item.quantity;
    }
    if (subtotal === 0) return { ok: false as const, error: "Cupom não aplicável aos itens do carrinho" };
    if (coupon.minSubtotalCents && subtotal < coupon.minSubtotalCents)
      return { ok: false as const, error: "Valor mínimo não atingido" };

    let discount =
      coupon.type === "percent"
        ? Math.floor((subtotal * coupon.value) / 100)
        : Math.min(coupon.value, subtotal);
    if (coupon.maxDiscountCents) discount = Math.min(discount, coupon.maxDiscountCents);

    return {
      ok: true as const,
      code: coupon.code,
      discount,
      type: coupon.type,
      value: coupon.value,
    };
  },
});
