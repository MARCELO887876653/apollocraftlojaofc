import { internalQuery, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import {
  applyCategoryUpdate,
  applyProductUpdate,
  createCategoryRecord,
  createProductRecord,
} from "./lib/catalog";
import { deliveryV1ToRecipe, recipeToDeliveryV1, validateRecipe } from "./lib/deliveryRecipe";

// ─────────────────────────────────────────────────────────────
// Catálogo pela API v1.
//
// Estes são os MESMOS documentos (tabelas `categories` e `products`)
// usados pelo painel e pela loja. Nada de tabela paralela: o produto
// criado pelo addon aparece no painel, categoria, loja e pedidos, e usa
// o MESMO pipeline de entrega (product.deliveryV1 → deliveryCommands).
// ─────────────────────────────────────────────────────────────

function apiError(status: number, code: string, message: string): never {
  throw new ConvexError({ status, code, message });
}

function optStr(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function requireName(value: any, field = "name"): string {
  const s = optStr(value);
  if (!s) apiError(422, "INVALID_PAYLOAD", `O campo '${field}' é obrigatório.`);
  return s as string;
}

function boolOr(value: any, def: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return def;
}

function intOr(value: any, def: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

/** Converte preço em reais para centavos, com validação rígida. */
function toCents(value: any, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    apiError(422, "INVALID_PRICE", `Valor de preço inválido em '${field}'.`);
  }
  return Math.round(n * 100);
}

async function resolveCategory(ctx: any, ref: string) {
  const all = await ctx.db.query("categories").collect();
  return (
    all.find((c: any) => String(c._id) === ref) ??
    all.find((c: any) => c.externalId === ref) ??
    all.find((c: any) => c.slug === ref) ??
    null
  );
}

async function resolveProduct(ctx: any, ref: string) {
  const all = await ctx.db.query("products").collect();
  return (
    all.find((p: any) => String(p._id) === ref) ??
    all.find((p: any) => p.externalId === ref) ??
    all.find((p: any) => p.slug === ref) ??
    null
  );
}

function categoryOut(c: any) {
  return {
    id: c._id as string,
    name: c.name,
    slug: c.slug,
    description: c.description ?? "",
    icon: c.icon ?? "",
    image: c.image ?? "",
    color: c.color ?? "",
    parent_id: c.parentId ?? null,
    position: c.order,
    enabled: c.active,
    external_id: c.externalId ?? null,
    server_id: c.sourceServerId ?? null,
    addon_id: c.sourceAddonId ?? null,
    created_source: c.createdSource ?? "ADMIN_PANEL",
    created_at: new Date(c.createdAt).toISOString(),
    updated_at: new Date(c.updatedAt).toISOString(),
  };
}

function productOut(p: any) {
  return {
    id: p._id as string,
    name: p.name,
    slug: p.slug,
    short_description: p.shortDescription ?? "",
    description: p.description ?? "",
    price: p.priceCents / 100,
    price_cents: p.priceCents,
    compare_at_price: p.compareAtPriceCents != null ? p.compareAtPriceCents / 100 : null,
    category_id: p.categoryId ?? null,
    image: p.image ?? "",
    images: p.images ?? [],
    tags: p.tags ?? [],
    stock: p.unlimitedStock ? null : p.stock,
    unlimited_stock: p.unlimitedStock,
    enabled: p.active,
    status: p.status ?? (p.active ? "PUBLISHED" : "DRAFT"),
    archived: Boolean(p.archivedAt),
    external_id: p.externalId ?? null,
    server_id: p.sourceServerId ?? null,
    addon_id: p.sourceAddonId ?? null,
    created_source: p.createdSource ?? "ADMIN_PANEL",
    delivery_recipe: p.deliveryV1 ? deliveryV1ToRecipe(p.deliveryV1) : null,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt).toISOString(),
  };
}

async function logApiAudit(
  ctx: any,
  meta: any,
  action: string,
  entity: string,
  entityId: any,
  before: any,
  after: any,
) {
  await ctx.db.insert("auditLogs", {
    userName: `API: ${meta?.keyName ?? meta?.apiKeyId ?? "addon"}`,
    action,
    entity,
    entityId: entityId === undefined ? undefined : String(entityId),
    details: {
      api_key_id: meta?.apiKeyId,
      server_id: meta?.serverId,
      addon_id: meta?.addonId,
      before: before ?? undefined,
      after: after ?? undefined,
    },
    createdAt: Date.now(),
  });
}

// A receita criada por um addon herda o addon_id do criador quando a ação não
// especifica um — assim a mesma chave/addon recebe a entrega na fila.
function applyRecipeDefaults(deliveryV1: any, meta: any) {
  if (!deliveryV1 || !Array.isArray(deliveryV1.actions)) return deliveryV1;
  const addonId = optStr(meta?.addonId);
  return {
    ...deliveryV1,
    actions: deliveryV1.actions.map((a: any) => ({
      ...a,
      addonId: a.addonId ?? addonId,
    })),
  };
}

function emit(ctx: any, meta: any, event: string, payload: any) {
  return ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
    event,
    payload: { ...payload, source: "api_v1", server_id: meta?.serverId, addon_id: meta?.addonId },
  });
}

// ─────────────────────────────────────────────────────────────
// Categorias
// ─────────────────────────────────────────────────────────────

export const internalListCategories = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("categories").collect();
    return all
      .filter((c) => !c.archivedAt)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map(categoryOut);
  },
});

export const internalGetCategory = internalQuery({
  args: { ref: v.string() },
  handler: async (ctx, { ref }) => {
    const c = await resolveCategory(ctx, ref);
    return c ? categoryOut(c) : null;
  },
});

export const internalCreateCategory = internalMutation({
  args: { data: v.any(), meta: v.any() },
  handler: async (ctx, { data, meta }) => {
    // idempotência: external_id ou Idempotency-Key
    const ext = optStr(data.external_id);
    const idem = optStr(data.idempotency_key) ?? optStr(meta?.idempotencyKey);
    if (ext || idem) {
      const all = await ctx.db.query("categories").collect();
      const existing = all.find(
        (c) =>
          (ext && c.externalId === ext) || (idem && c.idempotencyKey === idem),
      );
      if (existing) return { category: categoryOut(existing), idempotent: true };
    }

    const name = requireName(data.name);
    let parentId: any = undefined;
    if (data.parent_id) {
      const parent = await resolveCategory(ctx, String(data.parent_id));
      if (!parent) apiError(422, "INVALID_CATEGORY", "parent_id não encontrado.");
      parentId = parent._id;
    }

    const record: any = {
      name,
      description: optStr(data.description),
      icon: optStr(data.icon),
      image: optStr(data.image),
      color: optStr(data.color),
      parentId,
      order: intOr(data.position ?? data.order, 0),
      active: boolOr(data.enabled, true),
      seoTitle: optStr(data.seo_title),
      seoDescription: optStr(data.seo_description),
      externalId: ext,
      idempotencyKey: idem,
      createdSource: meta?.addonId || optStr(data.addon_id) ? "MINECRAFT_ADDON" : "API",
      sourceServerId: optStr(data.server_id) ?? optStr(meta?.serverId),
      sourceAddonId: optStr(data.addon_id) ?? optStr(meta?.addonId),
      sourceApiKeyId: optStr(meta?.apiKeyId),
    };
    if (optStr(data.slug)) record.slug = optStr(data.slug);

    const { id } = await createCategoryRecord(ctx, record);
    const created = await ctx.db.get(id);
    await logApiAudit(ctx, meta, "CATEGORY_CREATED", "category", id, undefined, categoryOut(created));
    await emit(ctx, meta, "category.created", { id, name });
    return { category: categoryOut(created), idempotent: false };
  },
});

export const internalUpdateCategory = internalMutation({
  args: { ref: v.string(), data: v.any(), meta: v.any() },
  handler: async (ctx, { ref, data, meta }) => {
    const current = await resolveCategory(ctx, ref);
    if (!current) apiError(404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
    const before = categoryOut(current);

    const patch: any = {};
    if ("name" in data) patch.name = requireName(data.name);
    if ("description" in data) patch.description = optStr(data.description);
    if ("icon" in data) patch.icon = optStr(data.icon);
    if ("image" in data) patch.image = optStr(data.image);
    if ("color" in data) patch.color = optStr(data.color);
    if ("seo_title" in data) patch.seoTitle = optStr(data.seo_title);
    if ("seo_description" in data) patch.seoDescription = optStr(data.seo_description);
    if ("position" in data || "order" in data) patch.order = intOr(data.position ?? data.order, current.order);
    if ("enabled" in data) patch.active = boolOr(data.enabled, current.active);
    if ("slug" in data && optStr(data.slug)) patch.slugHint = optStr(data.slug);
    if ("parent_id" in data) {
      if (data.parent_id === null || data.parent_id === "") {
        patch.parentId = undefined;
      } else {
        const parent = await resolveCategory(ctx, String(data.parent_id));
        if (!parent) apiError(422, "INVALID_CATEGORY", "parent_id não encontrado.");
        if (parent._id === current._id) apiError(422, "INVALID_CATEGORY", "Categoria não pode ser pai dela mesma.");
        patch.parentId = parent._id;
      }
    }

    await applyCategoryUpdate(ctx, current._id, patch);
    const updated: any = await ctx.db.get(current._id);
    await logApiAudit(ctx, meta, "CATEGORY_UPDATED", "category", current._id, before, categoryOut(updated));
    await emit(ctx, meta, "category.updated", { id: current._id, name: updated?.name });
    return { category: categoryOut(updated) };
  },
});

export const internalDeleteCategory = internalMutation({
  args: { ref: v.string(), meta: v.any() },
  handler: async (ctx, { ref, meta }) => {
    const current = await resolveCategory(ctx, ref);
    if (!current) apiError(404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
    // soft delete: nunca apaga de verdade (não quebra produtos/pedidos históricos)
    await ctx.db.patch(current._id, { active: false, archivedAt: Date.now(), updatedAt: Date.now() });
    await logApiAudit(ctx, meta, "CATEGORY_ARCHIVED", "category", current._id, categoryOut(current), undefined);
    await emit(ctx, meta, "category.deleted", { id: current._id, name: current.name });
    return { id: current._id, archived: true };
  },
});

// ─────────────────────────────────────────────────────────────
// Produtos
// ─────────────────────────────────────────────────────────────

export const internalListProducts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("products").collect();
    return all
      .filter((p) => !p.archivedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(productOut);
  },
});

export const internalGetProduct = internalQuery({
  args: { ref: v.string() },
  handler: async (ctx, { ref }) => {
    const p = await resolveProduct(ctx, ref);
    return p ? productOut(p) : null;
  },
});

export const internalCreateProduct = internalMutation({
  args: { data: v.any(), meta: v.any() },
  handler: async (ctx, { data, meta }) => {
    const ext = optStr(data.external_id);
    const idem = optStr(data.idempotency_key) ?? optStr(meta?.idempotencyKey);
    if (ext || idem) {
      const all = await ctx.db.query("products").collect();
      const existing = all.find(
        (p) => (ext && p.externalId === ext) || (idem && p.idempotencyKey === idem),
      );
      if (existing) return { product: productOut(existing), idempotent: true };
    }

    const name = requireName(data.name);

    let categoryId: any = undefined;
    if (data.category_id) {
      const category = await resolveCategory(ctx, String(data.category_id));
      if (!category) apiError(422, "INVALID_CATEGORY", "category_id não encontrado.");
      categoryId = category._id;
    }

    const priceCents =
      data.price_cents !== undefined
        ? Math.max(0, intOr(data.price_cents, 0))
        : (toCents(data.price, "price") ?? 0);

    const unlimitedStock = boolOr(data.unlimited_stock, false);
    const stock = Math.max(0, intOr(data.stock, 0));

    const active = "status" in data
      ? String(data.status).toUpperCase() === "PUBLISHED"
      : boolOr(data.enabled, false);

    const image = optStr(data.image);
    const images = Array.isArray(data.images)
      ? data.images.map((i: any) => String(i)).filter(Boolean)
      : image
        ? [image]
        : [];

    let deliveryV1: any = undefined;
    if (data.delivery_recipe) {
      let recipe;
      try {
        recipe = validateRecipe(data.delivery_recipe);
      } catch (e: any) {
        apiError(422, "INVALID_DELIVERY_RECIPE", e?.message ?? "delivery_recipe inválida.");
      }
      deliveryV1 = applyRecipeDefaults(recipeToDeliveryV1(recipe), meta);
    }

    const record: any = {
      name,
      shortDescription: optStr(data.short_description),
      description: optStr(data.description),
      image,
      images,
      categoryId,
      tags: Array.isArray(data.tags) ? data.tags.map((t: any) => String(t)) : [],
      priceCents,
      compareAtPriceCents: toCents(data.compare_at_price, "compare_at_price"),
      stock,
      unlimitedStock,
      active,
      featured: boolOr(data.featured, false),
      popular: boolOr(data.popular, false),
      hidden: boolOr(data.hidden, false),
      minQty: Math.max(1, intOr(data.min_qty, 1)),
      maxQty: Math.max(1, intOr(data.max_qty, 99)),
      order: intOr(data.order, 0),
      benefits: Array.isArray(data.benefits) ? data.benefits.map((b: any) => String(b)) : [],
      delivery: { type: "none", showToCustomer: true },
      deliveryV1,
      status: active ? "PUBLISHED" : "DRAFT",
      externalId: ext,
      idempotencyKey: idem,
      createdSource: meta?.addonId || optStr(data.addon_id) ? "MINECRAFT_ADDON" : "API",
      sourceServerId: optStr(data.server_id) ?? optStr(meta?.serverId),
      sourceAddonId: optStr(data.addon_id) ?? optStr(meta?.addonId),
      sourceApiKeyId: optStr(meta?.apiKeyId),
    };
    if (optStr(data.slug)) record.slug = optStr(data.slug);

    const { id } = await createProductRecord(ctx, record);
    const created = await ctx.db.get(id);
    await logApiAudit(ctx, meta, "PRODUCT_CREATED", "product", id, undefined, productOut(created));
    await emit(ctx, meta, "product.created", { id, name, status: record.status });
    return { product: productOut(created), idempotent: false };
  },
});

export const internalUpdateProduct = internalMutation({
  args: { ref: v.string(), data: v.any(), meta: v.any() },
  handler: async (ctx, { ref, data, meta }) => {
    const current = await resolveProduct(ctx, ref);
    if (!current) apiError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    const before = productOut(current);

    const patch: any = {};
    if ("name" in data) patch.name = requireName(data.name);
    if ("short_description" in data) patch.shortDescription = optStr(data.short_description);
    if ("description" in data) patch.description = optStr(data.description);
    if ("image" in data) patch.image = optStr(data.image);
    if ("images" in data && Array.isArray(data.images)) patch.images = data.images.map((i: any) => String(i));
    if ("tags" in data && Array.isArray(data.tags)) patch.tags = data.tags.map((t: any) => String(t));
    if ("benefits" in data && Array.isArray(data.benefits)) patch.benefits = data.benefits.map((b: any) => String(b));
    if ("price" in data) patch.priceCents = toCents(data.price, "price");
    if ("price_cents" in data) patch.priceCents = Math.max(0, intOr(data.price_cents, current.priceCents));
    if ("compare_at_price" in data) patch.compareAtPriceCents = toCents(data.compare_at_price, "compare_at_price");
    if ("stock" in data) patch.stock = Math.max(0, intOr(data.stock, current.stock));
    if ("unlimited_stock" in data) patch.unlimitedStock = boolOr(data.unlimited_stock, current.unlimitedStock);
    if ("min_qty" in data) patch.minQty = Math.max(1, intOr(data.min_qty, current.minQty));
    if ("max_qty" in data) patch.maxQty = Math.max(1, intOr(data.max_qty, current.maxQty));
    if ("featured" in data) patch.featured = boolOr(data.featured, current.featured);
    if ("popular" in data) patch.popular = boolOr(data.popular, current.popular);
    if ("hidden" in data) patch.hidden = boolOr(data.hidden, current.hidden);
    if ("order" in data) patch.order = intOr(data.order, current.order);
    if ("slug" in data && optStr(data.slug)) patch.slugHint = optStr(data.slug);

    if ("category_id" in data) {
      if (data.category_id === null || data.category_id === "") {
        patch.categoryId = undefined;
      } else {
        const category = await resolveCategory(ctx, String(data.category_id));
        if (!category) apiError(422, "INVALID_CATEGORY", "category_id não encontrado.");
        patch.categoryId = category._id;
      }
    }

    if ("enabled" in data || "status" in data) {
      const active = "status" in data
        ? String(data.status).toUpperCase() === "PUBLISHED"
        : boolOr(data.enabled, current.active);
      patch.active = active;
      patch.status = active ? "PUBLISHED" : "DRAFT";
    }

    if (data.delivery_recipe) {
      let recipe;
      try {
        recipe = validateRecipe(data.delivery_recipe);
      } catch (e: any) {
        apiError(422, "INVALID_DELIVERY_RECIPE", e?.message ?? "delivery_recipe inválida.");
      }
      patch.deliveryV1 = applyRecipeDefaults(recipeToDeliveryV1(recipe), meta);
    }

    await applyProductUpdate(ctx, current._id, patch);
    const updated: any = await ctx.db.get(current._id);
    await logApiAudit(ctx, meta, "PRODUCT_UPDATED", "product", current._id, before, productOut(updated));
    await emit(ctx, meta, "product.updated", { id: current._id, name: updated?.name });
    return { product: productOut(updated) };
  },
});

export const internalPublishProduct = internalMutation({
  args: { ref: v.string(), publish: v.boolean(), meta: v.any() },
  handler: async (ctx, { ref, publish, meta }) => {
    const current = await resolveProduct(ctx, ref);
    if (!current) apiError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    const before = productOut(current);
    await ctx.db.patch(current._id, {
      active: publish,
      hidden: false,
      status: publish ? "PUBLISHED" : "DRAFT",
      updatedAt: Date.now(),
    });
    const updated: any = await ctx.db.get(current._id);
    await logApiAudit(
      ctx,
      meta,
      publish ? "PRODUCT_PUBLISHED" : "PRODUCT_UNPUBLISHED",
      "product",
      current._id,
      before,
      productOut(updated),
    );
    await emit(ctx, meta, publish ? "product.published" : "product.unpublished", {
      id: current._id,
      name: updated?.name,
    });
    return { product: productOut(updated) };
  },
});

export const internalDeleteProduct = internalMutation({
  args: { ref: v.string(), meta: v.any() },
  handler: async (ctx, { ref, meta }) => {
    const current = await resolveProduct(ctx, ref);
    if (!current) apiError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    // soft delete / arquivo: nunca apaga (não quebra histórico de pedidos)
    await ctx.db.patch(current._id, {
      active: false,
      hidden: true,
      archivedAt: Date.now(),
      status: "DRAFT",
      updatedAt: Date.now(),
    });
    await logApiAudit(ctx, meta, "PRODUCT_ARCHIVED", "product", current._id, productOut(current), undefined);
    await emit(ctx, meta, "product.deleted", { id: current._id, name: current.name });
    return { id: current._id, archived: true };
  },
});

// ─────────────────────────────────────────────────────────────
// Receita de entrega (delivery_recipe)
// ─────────────────────────────────────────────────────────────

export const internalGetDeliveryRecipe = internalQuery({
  args: { ref: v.string() },
  handler: async (ctx, { ref }) => {
    const p = await resolveProduct(ctx, ref);
    if (!p) return null;
    return p.deliveryV1 ? deliveryV1ToRecipe(p.deliveryV1) : null;
  },
});

export const internalSetDeliveryRecipe = internalMutation({
  args: { ref: v.string(), recipe: v.any(), meta: v.any() },
  handler: async (ctx, { ref, recipe, meta }) => {
    const current = await resolveProduct(ctx, ref);
    if (!current) apiError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    const before = current.deliveryV1 ? deliveryV1ToRecipe(current.deliveryV1) : null;

    let validated;
    try {
      validated = validateRecipe(recipe);
    } catch (e: any) {
      apiError(422, "INVALID_DELIVERY_RECIPE", e?.message ?? "delivery_recipe inválida.");
    }
    const deliveryV1 = applyRecipeDefaults(recipeToDeliveryV1(validated), meta);

    await ctx.db.patch(current._id, { deliveryV1, updatedAt: Date.now() });
    await logApiAudit(
      ctx,
      meta,
      "DELIVERY_RECIPE_UPDATED",
      "product",
      current._id,
      before,
      deliveryV1ToRecipe(deliveryV1),
    );
    await emit(ctx, meta, "product.recipe_updated", { id: current._id, name: current.name });
    return { product_id: current._id, delivery_recipe: deliveryV1ToRecipe(deliveryV1) };
  },
});
