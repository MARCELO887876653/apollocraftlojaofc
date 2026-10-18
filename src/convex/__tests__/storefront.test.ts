/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { DEFAULT_STORE, DEFAULT_THEME } from "../lib/data";

// ─────────────────────────────────────────────────────────────
// Pacotes da vitrine (src/convex/storefront.ts).
//
// O motivo destes testes é o custo: o Convex cobra por chamada de função, e
// estes dois pacotes substituem ~11 assinaturas da home. Então cada teste aqui
// garante que o pacote devolve EXATAMENTE o que as consultas antigas devolviam
// (mesmos filtros, mesma ordem) — senão a economia viraria regressão na tela.
// ─────────────────────────────────────────────────────────────

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

async function seed(t: T) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("settings", {
      key: "store",
      value: { ...DEFAULT_STORE, name: "Loja Teste", serverIp: "jogo.exemplo.net" },
      updatedAt: now,
    });
    await ctx.db.insert("settings", {
      key: "theme",
      value: { ...DEFAULT_THEME, primary: "#123456" },
      updatedAt: now,
    });
    await ctx.db.insert("settings", {
      key: "menu",
      value: [{ label: "Início", url: "/", newTab: false }],
      updatedAt: now,
    });
    await ctx.db.insert("settings", {
      key: "homepage",
      value: [
        { id: "hero", type: "hero", enabled: true, config: {} },
        { id: "faq", type: "faq", enabled: false, config: {} },
      ],
      updatedAt: now,
    });

    // categorias: uma inativa e duas ativas fora de ordem
    await ctx.db.insert("categories", { name: "Segunda", slug: "segunda", order: 2, active: true });
    await ctx.db.insert("categories", { name: "Escondida", slug: "escondida", order: 0, active: false });
    await ctx.db.insert("categories", { name: "Primeira", slug: "primeira", order: 1, active: true });

    // banners: um ativo na home, um inativo na home e um em outra posição
    await ctx.db.insert("banners", { title: "Topo", position: "hero", active: true, createdAt: now });
    await ctx.db.insert("banners", { title: "Topo off", position: "hero", active: false, createdAt: now });
    await ctx.db.insert("banners", { title: "Rodapé", position: "footer", active: true, createdAt: now });

    await ctx.db.insert("faqs", { question: "Ativa?", answer: "Sim", order: 2, active: true });
    await ctx.db.insert("faqs", { question: "Inativa?", answer: "Não", order: 1, active: false });

    for (const [email, name, spent, count] of [
      ["terceiro@x.com", "Terceiro", 1000, 1],
      ["primeiro@x.com", "Primeiro", 9000, 3],
      ["segundo@x.com", "Segundo", 5000, 2],
      ["semcompra@x.com", "Sem Compra", 0, 0],
    ] as const) {
      await ctx.db.insert("customers", {
        email,
        name,
        ordersCount: count,
        totalSpentCents: spent,
        createdAt: now,
      });
    }

    return now;
  });
}

describe("storefront.getShell — dados da loja inteira em 1 chamada", () => {
  test("devolve loja, tema, menu e a bio do link prontos", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const shell = await t.query(api.storefront.getShell, {});
    expect(shell.store.name).toBe("Loja Teste");
    expect(shell.store.serverIp).toBe("jogo.exemplo.net");
    expect(shell.theme.primary).toBe("#123456");
    expect(shell.menu).toHaveLength(1);
    // tags do <head> já resolvidas pelo servidor (mesma lista do build)
    expect(shell.shareMeta.tags.length).toBeGreaterThan(0);
    expect(shell.shareMeta.meta.title).toBeTruthy();
  });

  test("avisa se a migração de marca ainda falta (para não chamar a mutation toda visita)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect((await t.query(api.storefront.getShell, {})).brandMigrationPending).toBe(true);

    await t.run(async (ctx) => {
      await ctx.db.insert("settings", {
        key: "homepageCentralCartV2",
        value: { done: true },
        updatedAt: Date.now(),
      });
    });
    expect((await t.query(api.storefront.getShell, {})).brandMigrationPending).toBe(false);
  });

  test("loja sem configuração nenhuma devolve os padrões (nunca undefined)", async () => {
    const t = convexTest(schema, modules);
    const shell = await t.query(api.storefront.getShell, {});
    expect(shell.store.name).toBe(DEFAULT_STORE.name);
    expect(shell.theme.primary).toBe(DEFAULT_THEME.primary);
    expect(shell.menu).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// Páginas de categoria e de produto: 1 chamada em vez de 2.
//
// O teste compara com as consultas antigas (`products.listActive`,
// `getBySlug`, `listRelated`) usando os MESMOS dados — se um dia as regras
// divergirem, a vitrine mostraria uma coisa e o catálogo outra.
// ─────────────────────────────────────────────────────────────

async function seedCatalog(t: T) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const parent = await ctx.db.insert("categories", {
      name: "KITS",
      slug: "kits",
      order: 0,
      active: true,
    });
    const sub = await ctx.db.insert("categories", {
      name: "VIP",
      slug: "vip",
      parentId: parent,
      order: 1,
      active: true,
    });
    const other = await ctx.db.insert("categories", {
      name: "Outra",
      slug: "outra",
      order: 2,
      active: true,
    });
    await ctx.db.insert("categories", {
      name: "Inativa",
      slug: "inativa",
      order: 3,
      active: false,
    });

    const mk = async (
      name: string,
      slug: string,
      categoryId: typeof parent,
      order: number,
      extra: Record<string, unknown> = {},
    ) =>
      await ctx.db.insert("products", {
        name,
        slug,
        categoryId,
        images: [],
        tags: [],
        priceCents: 1000 + order,
        stock: 5,
        unlimitedStock: false,
        active: true,
        featured: false,
        popular: false,
        hidden: false,
        minQty: 1,
        maxQty: 99,
        order,
        benefits: [],
        salesCount: 0,
        delivery: { type: "none", showToCustomer: true },
        createdAt: now,
        updatedAt: now,
        ...extra,
      });

    const parentProduct = await mk("Kit do pai", "kit-pai", parent, 0);
    const subProduct = await mk("Kit do VIP", "kit-vip", sub, 1);
    const otherProduct = await mk("Outro item", "outro-item", other, 2);
    await mk("Escondido", "escondido", parent, 3, { hidden: true });
    await mk("Inativo", "inativo", parent, 4, { active: false });

    await ctx.db.insert("productVariants", {
      productId: parentProduct,
      name: "30 dias",
      priceCents: 1500,
      stock: 3,
      unlimitedStock: false,
      order: 1,
      active: true,
    });
    await ctx.db.insert("productVariants", {
      productId: parentProduct,
      name: "Desativada",
      priceCents: 999,
      stock: 3,
      unlimitedStock: false,
      order: 2,
      active: false,
    });

    return { parent, sub, other, parentProduct, subProduct, otherProduct };
  });
}

describe("storefront.getCategoryPage — categoria em 1 chamada", () => {
  test("resolve a categoria, as subcategorias ativas e os produtos da categoria", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCatalog(t);

    const page = await t.query(api.storefront.getCategoryPage, { slug: "kits" });
    expect(page.category?.name).toBe("KITS");
    expect(page.subs.map((s) => s.name)).toEqual(["VIP"]);
    expect(page.selectedSlug).toBe("kits");

    // Mesmos produtos que a consulta antiga devolvia para essa categoria
    // (inclui subcategorias, ignora inativos e ocultos).
    const legacy = await t.query(api.products.listActive, {
      categoryId: ids.parent,
      sort: "relevance",
      limit: 60,
    });
    expect(page.products.map((p) => p.slug)).toEqual(legacy.map((p) => p.slug));
    expect(page.products.map((p) => p.slug)).toEqual(["kit-pai", "kit-vip"]);
  });

  test("escolher uma subcategoria troca só os produtos, mantendo os chips", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCatalog(t);

    const page = await t.query(api.storefront.getCategoryPage, {
      slug: "kits",
      subSlug: "vip",
    });
    expect(page.category?.name).toBe("KITS");
    expect(page.selectedSlug).toBe("vip");
    expect(page.subs.map((s) => s.name)).toEqual(["VIP"]);

    const legacy = await t.query(api.products.listActive, {
      categoryId: ids.sub,
      sort: "relevance",
      limit: 60,
    });
    expect(page.products.map((p) => p.slug)).toEqual(legacy.map((p) => p.slug));
    expect(page.products.map((p) => p.slug)).toEqual(["kit-vip"]);
  });

  test("slug inexistente ou inativo devolve vazio (e a tela mostra 'não encontrada')", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t);

    for (const slug of ["nao-existe", "inativa"]) {
      const page = await t.query(api.storefront.getCategoryPage, { slug });
      expect(page.category).toBeNull();
      expect(page.products).toEqual([]);
      expect(page.subs).toEqual([]);
    }
  });

  test("subcategoria de outra categoria é ignorada (não mostra produto errado)", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t);

    const page = await t.query(api.storefront.getCategoryPage, {
      slug: "outra",
      subSlug: "vip",
    });
    expect(page.selectedSlug).toBe("outra");
    expect(page.products.map((p) => p.slug)).toEqual(["outro-item"]);
  });
});

describe("storefront.getProductPage — produto em 1 chamada", () => {
  test("produto, variações ativas e relacionados iguais às consultas antigas", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCatalog(t);

    const page = await t.query(api.storefront.getProductPage, { slug: "kit-pai" });
    expect(page?.product._id).toBe(ids.parentProduct);
    expect(page?.category?.slug).toBe("kits");
    // só variações ativas, na ordem definida
    expect(page?.variants.map((v) => v.name)).toEqual(["30 dias"]);

    const legacyProduct = await t.query(api.products.getBySlug, { slug: "kit-pai" });
    expect(page?.product).toEqual(legacyProduct?.product);
    expect(page?.variants).toEqual(legacyProduct?.variants);

    const legacyRelated = await t.query(api.products.listRelated, {
      productId: ids.parentProduct,
      categoryId: ids.parent,
      limit: 4,
    });
    expect(page?.related.map((p) => p.slug)).toEqual(legacyRelated.map((p) => p.slug));
    // o próprio produto não aparece como relacionado
    expect(page?.related.some((p) => p._id === ids.parentProduct)).toBe(false);
  });

  test("produto inexistente, inativo ou oculto devolve null", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t);

    for (const slug of ["nao-existe", "inativo", "escondido"]) {
      expect(await t.query(api.storefront.getProductPage, { slug })).toBeNull();
    }
  });
});

describe("storefront.getHome — a home em 1 chamada", () => {
  test("banner só da posição hero e só ativo", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const home = await t.query(api.storefront.getHome, {});
    expect(home.banners.map((b) => b.title)).toEqual(["Topo"]);
  });

  test("categorias ativas, na ordem definida pelo painel", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const home = await t.query(api.storefront.getHome, {});
    expect(home.categories.map((c) => c.name)).toEqual(["Primeira", "Segunda"]);
  });

  test("FAQ só ativo e na ordem definida", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const home = await t.query(api.storefront.getHome, {});
    expect(home.faqs.map((f) => f.question)).toEqual(["Ativa?"]);
  });

  test("top 3 compradores: só quem comprou, do maior gasto para o menor", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const home = await t.query(api.storefront.getHome, {});
    expect(home.topBuyers.map((b) => b.name)).toEqual(["Primeiro", "Segundo", "Terceiro"]);
    expect(home.topBuyers[0].totalSpentCents).toBe(9000);
    expect(home.topBuyers.some((b) => b.name === "Sem Compra")).toBe(false);
  });

  test("mantém a ordem das seções configurada no painel", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const home = await t.query(api.storefront.getHome, {});
    expect(home.homepage.map((s) => s.type)).toEqual(["hero", "faq"]);
    expect(home.homepage.find((s) => s.type === "faq")?.enabled).toBe(false);
  });
});
