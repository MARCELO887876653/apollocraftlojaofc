import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  DEFAULT_HOMEPAGE,
  DEFAULT_STORE,
  DEFAULT_THEME,
  getSetting,
} from "./lib/data";
import { buildShareMeta, shareMetaTags } from "./lib/seo";
import {
  readActiveProducts,
  readCategoryBySlug,
  readProductBySlug,
  readRelatedProducts,
  selectHomeProducts,
} from "./lib/storefrontData";

// Tipos do shell derivados dos padrões do projeto: o frontend importa estes
// (`import type`, apagado no build) em vez de repetir o formato à mão.
export type StoreConfig = typeof DEFAULT_STORE;
export type ThemeConfig = typeof DEFAULT_THEME;
export type MenuItemConfig = { label: string; url: string; newTab?: boolean };
export type HomeSectionConfig = {
  id: string;
  type: string;
  enabled: boolean;
  config?: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────
// Pacotes de leitura da vitrine ("shell" + home).
//
// Por que existem: o Convex cobra por *chamada de função*, e cada `useQuery` é
// uma chamada. Só para abrir a home a loja fazia ~13 chamadas — `getStore` três
// vezes (layout, hero, card do servidor), `getTheme`, `getMenu`,
// `getShareMeta`, `getHomepage`, banners, categorias, top 3 e FAQ. Aqui os
// mesmos dados chegam em DUAS:
//
//   getShell → loja, tema, menu e bio do link (usados em TODA página)
//   getHome  → o que só a home mostra (seções, banner do topo, categorias,
//              top 3 compradores e FAQ)
//
// O conteúdo é idêntico ao das queries individuais, que continuam existindo
// para o painel admin e para as outras páginas (categorias, produto…).
//
// Cada leitura extra aqui dentro custa I/O de banco, não chamada de função —
// muito mais barato que uma ida e volta do navegador até o servidor.
// ─────────────────────────────────────────────────────────────

/**
 * Dados que a loja inteira precisa (layout, tema, favicon, bio do link).
 *
 * `brandMigrationPending` existe para acabar com uma chamada desperdiçada: o
 * tema chamava a mutation `settings.applyBrand` em TODA visita para conferir
 * uma migração de marca que quase sempre já rodou. Agora o servidor avisa se
 * ainda falta migrar, e a loja só chama quando é verdade.
 */
export const getShell = query({
  args: {},
  handler: async (ctx) => {
    const store = ((await getSetting(ctx, "store")) as StoreConfig | null) ?? DEFAULT_STORE;
    const theme = ((await getSetting(ctx, "theme")) as ThemeConfig | null) ?? DEFAULT_THEME;
    const menu = ((await getSetting(ctx, "menu")) as MenuItemConfig[] | null) ?? [];
    const migrated = (await getSetting(ctx, "homepageCentralCartV2")) != null;

    const meta = buildShareMeta(store, theme);

    return {
      store,
      theme,
      menu,
      shareMeta: { meta, tags: shareMetaTags(meta) },
      brandMigrationPending: !migrated,
    };
  },
});

/** Seções da home que mostram uma lista de produtos. */
const PRODUCT_SECTIONS = ["featured", "promo", "popular", "newest"] as const;
type ProductSectionType = (typeof PRODUCT_SECTIONS)[number];
/** Produto já com o nome da categoria (mesmo formato de `withCategoryNames`). */
type ProductCard = Doc<"products"> & { categoryName?: string };

/** Quantidade pedida pela seção (mesma regra do editor do painel: 8 por padrão). */
function sectionLimit(sections: HomeSectionConfig[], type: ProductSectionType): number {
  const raw = sections.find((s) => s.type === type)?.config?.count;
  // Igual ao que a tela fazia antes: `config?.count ?? 8`.
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 8;
}

/**
 * Tudo que a home monta numa chamada só: a ordem das seções, o banner do topo,
 * as categorias, o pódio dos compradores, o FAQ e — o que mais pesava — as
 * listas de produtos de cada seção.
 *
 * Antes cada seção da home (destaques, promoções, mais vendidos, lançamentos)
 * abria a própria assinatura: a home fazia 6 chamadas de função para pintar.
 * Agora faz 2 (o shell + esta). De quebra, os quatro catálogos saem de UMA
 * varredura de produtos, em vez de quatro.
 */
export const getHome = query({
  args: {},
  handler: async (ctx) => {
    const homepage =
      ((await getSetting(ctx, "homepage")) as HomeSectionConfig[] | null) ?? DEFAULT_HOMEPAGE;

    // Banner do topo (posição "hero"), só os ativos.
    const heroBanners = await ctx.db
      .query("banners")
      .withIndex("by_position", (q) => q.eq("position", "hero"))
      .collect();

    const categories = await ctx.db.query("categories").collect();
    const faqs = await ctx.db.query("faqs").collect();

    // Produtos das seções visíveis — só do que está ligado na home.
    const enabled = homepage.filter((s) => s.enabled);
    const wanted = PRODUCT_SECTIONS.filter((type) => enabled.some((s) => s.type === type));
    const products: Partial<Record<ProductSectionType, ProductCard[]>> = {};

    if (wanted.length > 0) {
      const all = await ctx.db
        .query("products")
        .withIndex("by_active_order", (q) => q.eq("active", true))
        .collect();
      // Nome da categoria vem da lista que já lemos acima: nada de varredura extra.
      const nameById = new Map(categories.map((c) => [c._id, c.name]));
      const withNames = (list: typeof all): ProductCard[] =>
        list.map((p) => ({
          ...p,
          categoryName: p.categoryId ? nameById.get(p.categoryId) : undefined,
        }));

      for (const type of wanted) {
        products[type] = withNames(selectHomeProducts(all, type, sectionLimit(enabled, type)));
      }
    }

    // Top 3 compradores: índice por total gasto (maior → menor), sem varrer
    // todos os clientes.
    const top = await ctx.db
      .query("customers")
      .withIndex("by_spent")
      .order("desc")
      .take(25);

    return {
      homepage,
      products,
      banners: heroBanners.filter((b) => b.active),
      categories: categories
        .filter((c) => c.active)
        .sort((a, b) => a.order - b.order),
      faqs: faqs.filter((f) => f.active).sort((a, b) => a.order - b.order),
      topBuyers: top
        .filter((c) => c.ordersCount > 0 && c.totalSpentCents > 0)
        .sort((a, b) => b.totalSpentCents - a.totalSpentCents)
        .slice(0, 3)
        .map((c) => ({
          _id: c._id,
          name: c.name || c.minecraftNick || c.email.split("@")[0],
          totalSpentCents: c.totalSpentCents,
        })),
    };
  },
});

/**
 * Página de categoria numa chamada: a categoria, as subcategorias (chips) e os
 * produtos dela — incluindo as subcategorias, pela mesma regra do catálogo.
 *
 * Antes a tela carregava TODAS as categorias numa consulta e os produtos em
 * outra; agora é uma só, e a lista de categorias nem sai do servidor.
 *
 * Trocar de subcategoria muda só o argumento `subSlug` (1 chamada, igual
 * antes); voltar para "Todos" reusa a resposta inicial já em cache.
 */
export const getCategoryPage = query({
  args: { slug: v.string(), subSlug: v.optional(v.string()) },
  handler: async (ctx, { slug, subSlug }) => {
    const category = await readCategoryBySlug(ctx, slug);
    if (!category) {
      return { category: null, subs: [], selectedSlug: slug, products: [] };
    }

    const subs = (await ctx.db.query("categories").collect())
      .filter((c) => c.active && c.parentId === category._id)
      .sort((a, b) => a.order - b.order);

    // A subcategoria pedida só vale se for filha desta categoria.
    const selected = (subSlug ? subs.find((s) => s.slug === subSlug) : undefined) ?? category;

    const products = await readActiveProducts(ctx, {
      categoryId: selected._id,
      sort: "relevance",
      limit: 60,
    });

    return { category, subs, selectedSlug: selected.slug, products };
  },
});

/**
 * Página de produto numa chamada: produto, variações, categoria e relacionados.
 *
 * Antes os relacionados só eram buscados DEPOIS que o produto chegava (uma ida
 * e volta extra em toda visita). Agora vêm juntos — mesma regra de
 * `products.getBySlug` + `products.listRelated`.
 */
export const getProductPage = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const core = await readProductBySlug(ctx, slug);
    if (!core) return null;

    const related = await readRelatedProducts(ctx, {
      productId: core.product._id,
      categoryId: core.product.categoryId,
      limit: 4,
    });

    return { ...core, related };
  },
});
