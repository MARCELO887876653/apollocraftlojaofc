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
