import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────
// Leituras compartilhadas da vitrine.
//
// Estas funções eram o corpo de `products.listActive`, `products.getBySlug` e
// `products.listRelated`. Foram extraídas para cá para que os pacotes de página
// (`storefront.getCategoryPage` / `getProductPage`) usem EXATAMENTE a mesma
// regra — em vez de reescrever filtros e ordenação e correr o risco de a
// vitrine mostrar coisa diferente do catálogo.
//
// Não são funções Convex registradas: são helpers de servidor, chamados de
// dentro das queries.
// ─────────────────────────────────────────────────────────────

/**
 * Anexa o nome da categoria a cada produto. Faz isso no servidor uma única vez
 * por consulta, evitando que cada card da vitrine abra a própria assinatura de
 * categorias no cliente (a home chega a renderizar dezenas de cards).
 */
export async function withCategoryNames<T extends { categoryId?: Id<"categories"> }>(
  ctx: QueryCtx,
  products: T[],
): Promise<(T & { categoryName?: string })[]> {
  const ids = new Set(products.map((p) => p.categoryId).filter(Boolean));
  if (ids.size === 0) return products;
  const categories = await ctx.db.query("categories").collect();
  const byId = new Map(categories.map((c) => [c._id, c.name]));
  return products.map((p) => ({
    ...p,
    categoryName: p.categoryId ? byId.get(p.categoryId) : undefined,
  }));
}

export type ListActiveArgs = {
  categoryId?: Id<"categories">;
  search?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest";
  limit?: number;
};

/** Produtos ativos do catálogo (mesma regra de `products.listActive`). */
export async function readActiveProducts(
  ctx: QueryCtx,
  { categoryId, search, sort, limit }: ListActiveArgs,
): Promise<Doc<"products">[]> {
  let products: Doc<"products">[];
  if (categoryId) {
    // inclui a categoria e todas as suas subcategorias (recursivo)
    const allCats = await ctx.db.query("categories").collect();
    const include = new Set<Id<"categories">>([categoryId]);
    let frontier: Id<"categories">[] = [categoryId];
    while (frontier.length) {
      const next: Id<"categories">[] = [];
      for (const c of allCats) {
        if (c.parentId && frontier.includes(c.parentId) && !include.has(c._id)) {
          include.add(c._id);
          next.push(c._id);
        }
      }
      frontier = next;
    }
    // Consulta apenas os produtos das categorias envolvidas (índice
    // by_category) em vez de varrer a tabela inteira de produtos.
    const perCategory = await Promise.all(
      [...include].map((id) =>
        ctx.db
          .query("products")
          .withIndex("by_category", (q) => q.eq("categoryId", id))
          .collect(),
      ),
    );
    products = perCategory.flat();
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
}

export type ProductPageCore = {
  product: Doc<"products">;
  variants: Doc<"productVariants">[];
  category: Doc<"categories"> | null;
};

/** Produto ativo por slug + suas variações ativas (regra de `products.getBySlug`). */
export async function readProductBySlug(
  ctx: QueryCtx,
  slug: string,
): Promise<ProductPageCore | null> {
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
  const category = product.categoryId ? await ctx.db.get(product.categoryId) : null;
  return { product, variants, category };
}

/** Produtos relacionados (regra de `products.listRelated`). */
export async function readRelatedProducts(
  ctx: QueryCtx,
  {
    productId,
    categoryId,
    limit,
  }: { productId: Id<"products">; categoryId?: Id<"categories">; limit?: number },
): Promise<(Doc<"products"> & { categoryName?: string })[]> {
  let list: Doc<"products">[];
  if (categoryId) {
    list = await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
      .collect();
  } else {
    list = await ctx.db.query("products").collect();
  }
  return withCategoryNames(
    ctx,
    list.filter((p) => p.active && !p.hidden && p._id !== productId).slice(0, limit ?? 4),
  );
}

/** Categoria ativa por slug (ou null). */
export async function readCategoryBySlug(
  ctx: QueryCtx,
  slug: string,
): Promise<Doc<"categories"> | null> {
  const category = await ctx.db
    .query("categories")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (!category || !category.active) return null;
  return category;
}
