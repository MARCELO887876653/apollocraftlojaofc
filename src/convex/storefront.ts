import { query } from "./_generated/server";
import {
  DEFAULT_HOMEPAGE,
  DEFAULT_STORE,
  DEFAULT_THEME,
  getSetting,
} from "./lib/data";
import { buildShareMeta, shareMetaTags } from "./lib/seo";

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

/**
 * Tudo que a home monta numa chamada só: a ordem das seções, o banner do topo,
 * as categorias, o pódio dos compradores e o FAQ.
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

    // Top 3 compradores: índice por total gasto (maior → menor), sem varrer
    // todos os clientes.
    const top = await ctx.db
      .query("customers")
      .withIndex("by_spent")
      .order("desc")
      .take(25);

    return {
      homepage,
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
