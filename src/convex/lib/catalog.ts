import type { MutationCtx } from "../_generated/server";
import { slugify } from "./data";
import { COUNTER_KEYS, adjustCounter, countProductsReal } from "./counters";

// ─────────────────────────────────────────────────────────────
// Regras compartilhadas do catálogo.
// O painel administrativo (categorias.ts / products.ts) E a API v1
// (apiV1Catalog.ts) usam estas mesmas funções — sem duplicar regras.
// ─────────────────────────────────────────────────────────────

/** Slug único de categoria (a partir de um nome/slug sugerido). */
export async function uniqueCategorySlug(ctx: MutationCtx, base: string, ignoreId?: any) {
  let slug = slugify(base) || "categoria";
  const clash = await ctx.db
    .query("categories")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (clash && (!ignoreId || clash._id !== ignoreId)) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }
  return slug;
}

/** Cria uma categoria (mesmo formato usado pelo painel). */
export async function createCategoryRecord(ctx: MutationCtx, data: any) {
  const { slug: slugHint, ...rest } = data;
  const slug = await uniqueCategorySlug(ctx, slugHint || data.name);
  const now = Date.now();
  const id = await ctx.db.insert("categories", {
    ...rest,
    slug,
    revision: rest.revision ?? 1,
    createdAt: now,
    updatedAt: now,
  });
  return { id, slug };
}

/** Aplica uma edição parcial de categoria (incrementa revision se não vier explícita). */
export async function applyCategoryUpdate(ctx: MutationCtx, id: any, data: any) {
  const patch: any = { ...data, updatedAt: Date.now() };
  if (typeof data.slugHint === "string" && data.slugHint.trim()) {
    patch.slug = await uniqueCategorySlug(ctx, data.slugHint, id);
  }
  delete patch.slugHint;
  if (patch.revision === undefined) {
    const current: any = await ctx.db.get(id);
    patch.revision = ((current?.revision ?? 1) as number) + 1;
  }
  await ctx.db.patch(id, patch);
}

/** Slug único de produto (a partir do nome). */
export async function uniqueProductSlug(ctx: MutationCtx, base: string, ignoreId?: any) {
  let slug = slugify(base) || "produto";
  const clash = await ctx.db
    .query("products")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (clash && (!ignoreId || clash._id !== ignoreId)) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }
  return slug;
}

/** Cria um produto com os mesmos padrões do painel (slug, salesCount, timestamps). */
export async function createProductRecord(ctx: MutationCtx, data: any) {
  const { slug: slugHint, ...rest } = data;
  const slug = await uniqueProductSlug(ctx, slugHint || data.name);
  const now = Date.now();
  const id = await ctx.db.insert("products", {
    ...rest,
    slug,
    revision: rest.revision ?? 1,
    salesCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  // Mantém o contador do dashboard na MESMA transação (nunca fica defasado).
  await adjustCounter(ctx, COUNTER_KEYS.products, 1, () => countProductsReal(ctx));
  return { id, slug };
}

/** Aplica uma edição parcial de produto (incrementa revision se não vier explícita). */
export async function applyProductUpdate(ctx: MutationCtx, id: any, data: any) {
  const patch: any = { ...data, updatedAt: Date.now() };
  if (typeof data.slugHint === "string" && data.slugHint.trim()) {
    patch.slug = await uniqueProductSlug(ctx, data.slugHint, id);
  }
  delete patch.slugHint;
  if (patch.revision === undefined) {
    const current: any = await ctx.db.get(id);
    patch.revision = ((current?.revision ?? 1) as number) + 1;
  }
  await ctx.db.patch(id, patch);
}
