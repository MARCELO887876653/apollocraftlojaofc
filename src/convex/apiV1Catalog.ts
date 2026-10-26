import { internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { scheduleWebhookEvent } from "./lib/webhookDispatch";
import {
  applyCategoryUpdate,
  applyProductUpdate,
  createCategoryRecord,
  createProductRecord,
} from "./lib/catalog";
import {
  deliveryV1ToRecipe,
  recipeToDeliveryV1,
  validateRecipe,
  RECIPE_LIMITS,
} from "./lib/deliveryRecipe";

// ─────────────────────────────────────────────────────────────
// Catálogo pela API v1.
//
// Estes são os MESMOS documentos (tabelas `categories` e `products`)
// usados pelo painel e pela loja. Nada de tabela paralela: o produto
// criado pelo addon aparece no painel, categoria, loja e pedidos, e usa
// o MESMO pipeline de entrega (product.deliveryV1 → deliveryCommands).
// ─────────────────────────────────────────────────────────────

function apiError(status: number, code: string, message: string, extra?: any): never {
  throw new ConvexError({ status, code, message, extra });
}

function optStr(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

/** Limita o tamanho de uma string vinda do addon (antiabuso). */
function clampStr(value: any, max: number): string | undefined {
  const s = optStr(value);
  return s === undefined ? undefined : s.slice(0, max);
}

function requireName(value: any, field = "name"): string {
  const s = clampStr(value, RECIPE_LIMITS.MAX_NAME);
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

// Busca por referência (id, external_id ou slug) SEM ler a tabela inteira.
// Antes cada GET/PATCH/DELETE/upsert de produto ou categoria fazia `collect()`
// da tabela toda só para achar um documento. Agora são no máximo 3 leituras
// pontuais, na MESMA ordem de precedência de antes (id → external → slug).

async function resolveCategory(ctx: QueryCtx, ref: string) {
  const id = ctx.db.normalizeId("categories", ref);
  if (id) {
    const byId = await ctx.db.get(id);
    if (byId) return byId;
  }
  const byExternal = await ctx.db
    .query("categories")
    .withIndex("by_external", (q) => q.eq("externalId", ref))
    .first();
  if (byExternal) return byExternal;
  return await ctx.db
    .query("categories")
    .withIndex("by_slug", (q) => q.eq("slug", ref))
    .first();
}

async function resolveProduct(ctx: QueryCtx, ref: string) {
  const id = ctx.db.normalizeId("products", ref);
  if (id) {
    const byId = await ctx.db.get(id);
    if (byId) return byId;
  }
  const byExternal = await ctx.db
    .query("products")
    .withIndex("by_external", (q) => q.eq("externalId", ref))
    .first();
  if (byExternal) return byExternal;
  return await ctx.db
    .query("products")
    .withIndex("by_slug", (q) => q.eq("slug", ref))
    .first();
}

// ─────────────────────────────────────────────────────────────
// Autorização por objeto.
// Ter o scope NÃO basta: uma chave ligada a um servidor/addon não pode
// ler ou alterar recursos de outro servidor/addon manipulando o ID na URL.
// ─────────────────────────────────────────────────────────────
export function canAccess(
  resource: { sourceServerId?: string; sourceAddonId?: string },
  key: { serverId: string; addonId?: string },
): boolean {
  const keyServer = key.serverId || "GLOBAL";
  const isGlobal = keyServer === "GLOBAL" && !key.addonId;
  if (isGlobal) return true;
  // nunca cruza fronteira de addon
  if (key.addonId && resource.sourceAddonId && resource.sourceAddonId !== key.addonId) {
    return false;
  }
  // nunca cruza fronteira de servidor
  if (keyServer !== "GLOBAL" && resource.sourceServerId && resource.sourceServerId !== keyServer) {
    return false;
  }
  return true;
}

/**
 * Verificação de revisão (sincronização otimista).
 * Se o addon enviar `expected_revision` e o site já estiver numa revisão mais
 * nova, rejeitamos com 409 SYNC_CONFLICT — nunca há sobrescrita silenciosa.
 */
function assertRevision(current: any, data: any) {
  if (data?.expected_revision === undefined || data?.expected_revision === null) return;
  const expected = intOr(data.expected_revision, -1);
  const actual = current.revision ?? 1;
  if (expected !== actual) {
    apiError(409, "SYNC_CONFLICT", `Revisão desatualizada: o site está na revisão ${actual}.`, {
      current_revision: actual,
      expected_revision: expected,
    });
  }
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
    revision: c.revision ?? 1,
    archived: Boolean(c.archivedAt),
    created_at: new Date(c.createdAt).toISOString(),
    updated_at: new Date(c.updatedAt).toISOString(),
  };
}

/** Resumo de entrega para exibir no painel/API (inclui LOCAL_REFERENCE). */
function deliverySummary(p: any) {
  const actions: any[] = Array.isArray(p.deliveryV1?.actions) ? p.deliveryV1.actions : [];
  const local = actions.find((a) => a.mode === "LOCAL_REFERENCE") ?? null;
  return {
    mode: local ? "LOCAL_REFERENCE" : actions.length ? "SERVER" : "NONE",
    reference_id: local?.referenceId ?? null,
    reference_revision: local?.referenceRevision ?? null,
    has_local_reference: Boolean(local),
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
    revision: p.revision ?? 1,
    delivery: deliverySummary(p),
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
  // Só agenda se algum webhook ativo escuta o evento (lib/webhookDispatch).
  return scheduleWebhookEvent(ctx, event, {
    ...payload,
    source: "api_v1",
    server_id: meta?.serverId,
    addon_id: meta?.addonId,
  });
}

// ─────────────────────────────────────────────────────────────
// Categorias
// ─────────────────────────────────────────────────────────────

export const internalListCategories = internalQuery({
  args: { meta: v.optional(v.any()) },
  handler: async (ctx, { meta }) => {
    const key = { serverId: optStr(meta?.serverId) ?? "GLOBAL", addonId: optStr(meta?.addonId) };
    const all = await ctx.db.query("categories").collect();
    return all
      .filter((c) => !c.archivedAt && canAccess(c as any, key))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map(categoryOut);
  },
});

export const internalGetCategory = internalQuery({
  args: { ref: v.string(), meta: v.optional(v.any()) },
  handler: async (ctx, { ref, meta }) => {
    const c = await resolveCategory(ctx, ref);
    if (!c) return null;
    const key = { serverId: optStr(meta?.serverId) ?? "GLOBAL", addonId: optStr(meta?.addonId) };
    // esconde a existência de recursos de outro servidor/addon
    if (!canAccess(c as any, key)) return null;
    return categoryOut(c);
  },
});

export const internalCreateCategory = internalMutation({
  args: { data: v.any(), meta: v.any() },
  handler: async (ctx, { data, meta }) => {
    // idempotência: external_id ou Idempotency-Key
    const ext = optStr(data.external_id);
    const idem = optStr(data.idempotency_key) ?? optStr(meta?.idempotencyKey);
    if (ext || idem) {
      const byExt =
        ext &&
        (await ctx.db
          .query("categories")
          .withIndex("by_external", (q) => q.eq("externalId", ext))
          .first());
      const existing =
        byExt ||
        (idem
          ? await ctx.db
              .query("categories")
              .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idem))
              .first()
          : null);
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
      description: clampStr(data.description, RECIPE_LIMITS.MAX_DESCRIPTION),
      icon: clampStr(data.icon, 500),
      image: clampStr(data.image, 1000),
      color: clampStr(data.color, 32),
      parentId,
      order: intOr(data.position ?? data.order, 0),
      active: boolOr(data.enabled, true),
      seoTitle: clampStr(data.seo_title, 160),
      seoDescription: clampStr(data.seo_description, 320),
      externalId: ext ? ext.slice(0, RECIPE_LIMITS.MAX_EXTERNAL_ID) : undefined,
      idempotencyKey: idem,
      revision: 1,
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
    if (!current || !canAccess(current as any, meta ?? {})) {
      apiError(404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
    }
    const before = categoryOut(current);
    assertRevision(current, data);

    const patch: any = { revision: (current.revision ?? 1) + 1 };
    if ("name" in data) patch.name = requireName(data.name);
    if ("description" in data) patch.description = clampStr(data.description, RECIPE_LIMITS.MAX_DESCRIPTION);
    if ("icon" in data) patch.icon = clampStr(data.icon, 500);
    if ("image" in data) patch.image = clampStr(data.image, 1000);
    if ("color" in data) patch.color = clampStr(data.color, 32);
    if ("seo_title" in data) patch.seoTitle = clampStr(data.seo_title, 160);
    if ("seo_description" in data) patch.seoDescription = clampStr(data.seo_description, 320);
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
    if (!current || !canAccess(current as any, meta ?? {})) {
      apiError(404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
    }
    // soft delete: nunca apaga de verdade (não quebra produtos/pedidos históricos)
    await ctx.db.patch(current._id, {
      active: false,
      archivedAt: Date.now(),
      revision: (current.revision ?? 1) + 1,
      updatedAt: Date.now(),
    });
    await logApiAudit(ctx, meta, "CATEGORY_ARCHIVED", "category", current._id, categoryOut(current), undefined);
    await emit(ctx, meta, "category.deleted", { id: current._id, name: current.name });
    return { id: current._id, archived: true };
  },
});

// ─────────────────────────────────────────────────────────────
// Produtos
// ─────────────────────────────────────────────────────────────

export const internalListProducts = internalQuery({
  args: { meta: v.optional(v.any()) },
  handler: async (ctx, { meta }) => {
    const key = { serverId: optStr(meta?.serverId) ?? "GLOBAL", addonId: optStr(meta?.addonId) };
    const all = await ctx.db.query("products").collect();
    return all
      .filter((p) => !p.archivedAt && canAccess(p as any, key))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(productOut);
  },
});

export const internalGetProduct = internalQuery({
  args: { ref: v.string(), meta: v.optional(v.any()) },
  handler: async (ctx, { ref, meta }) => {
    const p = await resolveProduct(ctx, ref);
    if (!p) return null;
    const key = { serverId: optStr(meta?.serverId) ?? "GLOBAL", addonId: optStr(meta?.addonId) };
    if (!canAccess(p as any, key)) return null;
    return productOut(p);
  },
});

export const internalCreateProduct = internalMutation({
  args: { data: v.any(), meta: v.any() },
  handler: async (ctx, { data, meta }) => {
    const ext = optStr(data.external_id);
    const idem = optStr(data.idempotency_key) ?? optStr(meta?.idempotencyKey);
    if (ext || idem) {
      const byExt =
        ext &&
        (await ctx.db
          .query("products")
          .withIndex("by_external", (q) => q.eq("externalId", ext))
          .first());
      const existing =
        byExt ||
        (idem
          ? await ctx.db
              .query("products")
              .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idem))
              .first()
          : null);
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
      shortDescription: clampStr(data.short_description, RECIPE_LIMITS.MAX_SHORT_DESCRIPTION),
      description: clampStr(data.description, RECIPE_LIMITS.MAX_DESCRIPTION),
      image,
      images,
      categoryId,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 50).map((t: any) => String(t).slice(0, 64)) : [],
      revision: 1,
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
      externalId: ext ? ext.slice(0, RECIPE_LIMITS.MAX_EXTERNAL_ID) : undefined,
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
    if (!current || !canAccess(current as any, meta ?? {})) {
      apiError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    }
    const before = productOut(current);
    assertRevision(current, data);

    const patch: any = { revision: (current.revision ?? 1) + 1 };
    if ("name" in data) patch.name = requireName(data.name);
    if ("short_description" in data) patch.shortDescription = clampStr(data.short_description, RECIPE_LIMITS.MAX_SHORT_DESCRIPTION);
    if ("description" in data) patch.description = clampStr(data.description, RECIPE_LIMITS.MAX_DESCRIPTION);
    if ("image" in data) patch.image = clampStr(data.image, 1000);
    if ("images" in data && Array.isArray(data.images)) patch.images = data.images.slice(0, 30).map((i: any) => String(i).slice(0, 1000));
    if ("tags" in data && Array.isArray(data.tags)) patch.tags = data.tags.slice(0, 50).map((t: any) => String(t).slice(0, 64));
    if ("benefits" in data && Array.isArray(data.benefits)) patch.benefits = data.benefits.slice(0, 50).map((b: any) => String(b).slice(0, 200));
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
    if (!current || !canAccess(current as any, meta ?? {})) {
      apiError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    }
    const before = productOut(current);
    await ctx.db.patch(current._id, {
      active: publish,
      hidden: false,
      status: publish ? "PUBLISHED" : "DRAFT",
      revision: (current.revision ?? 1) + 1,
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
    if (!current || !canAccess(current as any, meta ?? {})) {
      apiError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    }
    // soft delete / arquivo: nunca apaga (não quebra histórico de pedidos)
    await ctx.db.patch(current._id, {
      active: false,
      hidden: true,
      archivedAt: Date.now(),
      status: "DRAFT",
      revision: (current.revision ?? 1) + 1,
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
    if (!current || !canAccess(current as any, meta ?? {})) {
      apiError(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
    }
    assertRevision(current, recipe);
    const before = current.deliveryV1 ? deliveryV1ToRecipe(current.deliveryV1) : null;

    let validated;
    try {
      validated = validateRecipe(recipe);
    } catch (e: any) {
      apiError(422, "INVALID_DELIVERY_RECIPE", e?.message ?? "delivery_recipe inválida.");
    }
    const deliveryV1 = applyRecipeDefaults(recipeToDeliveryV1(validated), meta);

    await ctx.db.patch(current._id, {
      deliveryV1,
      revision: (current.revision ?? 1) + 1,
      updatedAt: Date.now(),
    });
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
    return {
      product_id: current._id,
      revision: (current.revision ?? 1) + 1,
      delivery_recipe: deliveryV1ToRecipe(deliveryV1),
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Upsert (criar-ou-atualizar).
// Chave natural: server_id + addon_id + external_id. Nunca cria duplicado
// quando o addon reinicia/resincroniza/reinstala ou perde a resposta HTTP.
// ─────────────────────────────────────────────────────────────

function scopeOf(data: any, meta: any) {
  return {
    serverId: optStr(data.server_id) ?? optStr(meta?.serverId) ?? "GLOBAL",
    addonId: optStr(data.addon_id) ?? optStr(meta?.addonId) ?? "",
  };
}

export const internalUpsertCategory = internalMutation({
  args: { data: v.any(), meta: v.any() },
  handler: async (ctx, { data, meta }) => {
    const ext = optStr(data.external_id);
    if (!ext) apiError(422, "INVALID_PAYLOAD", "'external_id' é obrigatório no upsert de categoria.");
    const { serverId, addonId } = scopeOf(data, meta);
    // Pelo índice, não pela tabela inteira: external_id + vínculo identificam
    // no máximo um registro (o filtro de servidor/addon roda só nas duplicatas
    // do mesmo external_id).
    const sameExternal = await ctx.db
      .query("categories")
      .withIndex("by_external", (q) => q.eq("externalId", ext))
      .collect();
    const existing = sameExternal.find(
      (c) =>
        (c.sourceServerId ?? "GLOBAL") === serverId &&
        (c.sourceAddonId ?? "") === addonId,
    );

    if (existing) {
      if (!canAccess(existing as any, meta ?? {})) {
        apiError(403, "FORBIDDEN_OBJECT", "Esta categoria pertence a outro servidor/addon.");
      }
      const before = categoryOut(existing);
      const patch: any = { revision: (existing.revision ?? 1) + 1 };
      if ("name" in data) patch.name = requireName(data.name);
      if ("description" in data) patch.description = clampStr(data.description, RECIPE_LIMITS.MAX_DESCRIPTION);
      if ("position" in data || "order" in data) patch.order = intOr(data.position ?? data.order, existing.order);
      if ("enabled" in data) patch.active = boolOr(data.enabled, existing.active);
      if ("parent_id" in data && data.parent_id) {
        const parent = await resolveCategory(ctx, String(data.parent_id));
        if (!parent) apiError(422, "INVALID_CATEGORY", "parent_id não encontrado.");
        patch.parentId = parent._id;
      }
      await applyCategoryUpdate(ctx, existing._id, patch);
      const updated: any = await ctx.db.get(existing._id);
      await logApiAudit(ctx, meta, "CATEGORY_UPDATED", "category", existing._id, before, categoryOut(updated));
      return { category: categoryOut(updated), created: false, idempotent: false };
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
      description: clampStr(data.description, RECIPE_LIMITS.MAX_DESCRIPTION),
      icon: clampStr(data.icon, 500),
      image: clampStr(data.image, 1000),
      color: clampStr(data.color, 32),
      parentId,
      order: intOr(data.position ?? data.order, 0),
      active: boolOr(data.enabled, true),
      externalId: ext.slice(0, RECIPE_LIMITS.MAX_EXTERNAL_ID),
      revision: 1,
      createdSource: addonId ? "MINECRAFT_ADDON" : "API",
      sourceServerId: serverId,
      sourceAddonId: addonId || undefined,
      sourceApiKeyId: optStr(meta?.apiKeyId),
    };
    if (optStr(data.slug)) record.slug = optStr(data.slug);
    const { id } = await createCategoryRecord(ctx, record);
    const created: any = await ctx.db.get(id);
    await logApiAudit(ctx, meta, "CATEGORY_CREATED", "category", id, undefined, categoryOut(created));
    await emit(ctx, meta, "category.created", { id, name });
    return { category: categoryOut(created), created: true, idempotent: false };
  },
});

export const internalUpsertProduct = internalMutation({
  args: { data: v.any(), meta: v.any() },
  handler: async (ctx, { data, meta }) => {
    const ext = optStr(data.external_id);
    if (!ext) apiError(422, "INVALID_PAYLOAD", "'external_id' é obrigatório no upsert de produto.");
    const { serverId, addonId } = scopeOf(data, meta);
    // Pelo índice `by_external` — a versão anterior lia a tabela de produtos
    // INTEIRA em cada upsert do addon só para achar este documento.
    const sameExternal = await ctx.db
      .query("products")
      .withIndex("by_external", (q) => q.eq("externalId", ext))
      .collect();
    const existing = sameExternal.find(
      (p) =>
        (p.sourceServerId ?? "GLOBAL") === serverId &&
        (p.sourceAddonId ?? "") === addonId,
    );

    if (existing) {
      if (!canAccess(existing as any, meta ?? {})) {
        apiError(403, "FORBIDDEN_OBJECT", "Este produto pertence a outro servidor/addon.");
      }
      const before = productOut(existing);
      const patch: any = { revision: (existing.revision ?? 1) + 1 };
      if ("name" in data) patch.name = requireName(data.name);
      if ("short_description" in data) patch.shortDescription = clampStr(data.short_description, RECIPE_LIMITS.MAX_SHORT_DESCRIPTION);
      if ("description" in data) patch.description = clampStr(data.description, RECIPE_LIMITS.MAX_DESCRIPTION);
      if ("price" in data) patch.priceCents = toCents(data.price, "price");
      if ("price_cents" in data) patch.priceCents = Math.max(0, intOr(data.price_cents, existing.priceCents));
      if ("image" in data) patch.image = clampStr(data.image, 1000);
      if ("category_id" in data) {
        if (!data.category_id) patch.categoryId = undefined;
        else {
          const category = await resolveCategory(ctx, String(data.category_id));
          if (!category) apiError(422, "INVALID_CATEGORY", "category_id não encontrado.");
          patch.categoryId = category._id;
        }
      }
      if ("enabled" in data || "status" in data) {
        const active = "status" in data
          ? String(data.status).toUpperCase() === "PUBLISHED"
          : boolOr(data.enabled, existing.active);
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
      await applyProductUpdate(ctx, existing._id, patch);
      const updated: any = await ctx.db.get(existing._id);
      await logApiAudit(ctx, meta, "PRODUCT_UPDATED", "product", existing._id, before, productOut(updated));
      await emit(ctx, meta, "product.updated", { id: existing._id, name: updated?.name });
      return { product: productOut(updated), created: false, idempotent: false };
    }

    // ── criação (mesmo formato do POST /products) ──
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
    const image = clampStr(data.image, 1000);
    const images = Array.isArray(data.images)
      ? data.images.slice(0, 30).map((i: any) => String(i).slice(0, 1000))
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
      shortDescription: clampStr(data.short_description, RECIPE_LIMITS.MAX_SHORT_DESCRIPTION),
      description: clampStr(data.description, RECIPE_LIMITS.MAX_DESCRIPTION),
      image,
      images,
      categoryId,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 50).map((t: any) => String(t).slice(0, 64)) : [],
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
      benefits: Array.isArray(data.benefits) ? data.benefits.slice(0, 50).map((b: any) => String(b).slice(0, 200)) : [],
      delivery: { type: "none", showToCustomer: true },
      deliveryV1,
      status: active ? "PUBLISHED" : "DRAFT",
      externalId: ext.slice(0, RECIPE_LIMITS.MAX_EXTERNAL_ID),
      revision: 1,
      createdSource: addonId ? "MINECRAFT_ADDON" : "API",
      sourceServerId: serverId,
      sourceAddonId: addonId || undefined,
      sourceApiKeyId: optStr(meta?.apiKeyId),
    };
    if (optStr(data.slug)) record.slug = optStr(data.slug);
    const { id } = await createProductRecord(ctx, record);
    const created: any = await ctx.db.get(id);
    await logApiAudit(ctx, meta, "PRODUCT_CREATED", "product", id, undefined, productOut(created));
    await emit(ctx, meta, "product.created", { id, name, status: record.status });
    return { product: productOut(created), created: true, idempotent: false };
  },
});
