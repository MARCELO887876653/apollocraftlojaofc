/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

const CAT_SCOPES = ["categories:read", "categories:create", "categories:update", "categories:delete"];
const PROD_SCOPES = [
  "products:read",
  "products:create",
  "products:update",
  "products:delete",
  "products:publish",
  "delivery-recipes:read",
  "delivery-recipes:write",
  "deliveries:read",
  "deliveries:update",
];

async function newKey(
  t: T,
  scopes: string[],
  opts: { serverId?: string; addonId?: string } = {},
) {
  return await t.mutation(internal.apiKeysV1.devCreateForTests, {
    name: "Store Manager",
    scopes,
    serverId: opts.serverId ?? "survival-01",
    addonId: opts.addonId ?? "store-manager",
  });
}

async function callV1(
  t: T,
  token: string,
  method: string,
  path: string,
  opts: { body?: unknown; idempotencyKey?: string } = {},
) {
  return await t.action(api.apiV1.handle, {
    method,
    path,
    token,
    bodyText: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    query: {},
    idempotencyKey: opts.idempotencyKey,
  });
}

describe("categorias pela API v1", () => {
  test("cria categoria e ela aparece no site (mesmo catálogo)", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, CAT_SCOPES);
    const res = await callV1(t, token, "POST", "/api/v1/categories", {
      body: { name: "Kits", slug: "kits", description: "Kits do servidor" },
    });
    expect(res.status).toBe(201);
    const cat = res.body as any;
    expect(cat.slug).toBe("kits");
    expect(cat.enabled).toBe(true);

    // visível no site (mesma tabela `categories`)
    const publicList = await t.query(api.categories.listPublic, {});
    expect(publicList.map((c: any) => c.slug)).toContain("kits");
    // e listável pelo addon
    const list = (await callV1(t, token, "GET", "/api/v1/categories")).body as any[];
    expect(list).toHaveLength(1);
  });

  test("external_id impede duplicação (idempotente)", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, CAT_SCOPES);
    const a = await callV1(t, token, "POST", "/api/v1/categories", {
      body: { name: "Kits", external_id: "kits" },
    });
    const b = await callV1(t, token, "POST", "/api/v1/categories", {
      body: { name: "Kits de novo", external_id: "kits" },
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect((a.body as any).id).toBe((b.body as any).id);
    const all = await t.run(async (ctx) => await ctx.db.query("categories").collect());
    expect(all).toHaveLength(1);
  });

  test("Idempotency-Key impede duplicação", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, CAT_SCOPES);
    const a = await callV1(t, token, "POST", "/api/v1/categories", {
      body: { name: "Ranks" },
      idempotencyKey: "cat-ranks-v1",
    });
    const b = await callV1(t, token, "POST", "/api/v1/categories", {
      body: { name: "Ranks" },
      idempotencyKey: "cat-ranks-v1",
    });
    expect((a.body as any).id).toBe((b.body as any).id);
  });

  test("edita e busca por id/slug/external_id", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, CAT_SCOPES);
    const created = (await callV1(t, token, "POST", "/api/v1/categories", {
      body: { name: "Kits", external_id: "kits" },
    })).body as any;

    const patch = await callV1(t, token, "PATCH", `/api/v1/categories/${created.id}`, {
      body: { name: "Kits Premium", position: 3 },
    });
    expect(patch.status).toBe(200);
    expect((patch.body as any).name).toBe("Kits Premium");
    expect((patch.body as any).position).toBe(3);

    const byExt = await callV1(t, token, "GET", "/api/v1/categories/kits");
    expect(byExt.status).toBe(200);
    expect((byExt.body as any).name).toBe("Kits Premium");
  });

  test("categoria criada no SITE aparece para o addon", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("categories", {
        name: "Site Only",
        slug: "site-only",
        order: 0,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const { token } = await newKey(t, CAT_SCOPES);
    const list = (await callV1(t, token, "GET", "/api/v1/categories")).body as any[];
    expect(list.some((c) => c.slug === "site-only")).toBe(true);
  });
});

describe("produtos pela API v1", () => {
  test("cria produto com receita e preço (aparece no catálogo)", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const res = await callV1(t, token, "POST", "/api/v1/products", {
      body: {
        name: "Kit Guerreiro",
        description: "Receba o Kit no servidor",
        price: 9.9,
        external_id: "survival-kit-guerreiro",
        enabled: true,
        delivery_recipe: {
          version: 1,
          offline_execute: false,
          actions: [
            { type: "GIVE_ITEMS", payload: { items: [{ type: "minecraft_item", format_version: 1, item: { type_id: "minecraft:diamond_sword", amount: 1 } }] } },
            { type: "ADD_MONEY", payload: { amount: 5000 } },
          ],
        },
      },
    });
    expect(res.status).toBe(201);
    const product = res.body as any;
    expect(product.price_cents).toBe(990);
    expect(product.status).toBe("PUBLISHED");
    expect(product.created_source).toBe("MINECRAFT_ADDON");
    expect(product.delivery_recipe.actions).toHaveLength(2);

    // visível na loja (mesmo catálogo)
    const store = await t.query(api.products.listActive, {});
    expect(store.some((p: any) => p.name === "Kit Guerreiro")).toBe(true);
  });

  test("preço inválido é rejeitado (422)", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const neg = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "X", price: -5 },
    });
    expect(neg.status).toBe(422);
    expect((neg.body as any).errors[0].code).toBe("INVALID_PRICE");

    const nan = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "X", price: "abc" },
    });
    expect(nan.status).toBe(422);

    const inf = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "X", price: "Infinity" },
    });
    expect(inf.status).toBe(422);
  });

  test("criação idempotente por external_id e por Idempotency-Key", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const a = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", external_id: "kit-1" },
    });
    const b = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", external_id: "kit-1" },
    });
    expect((a.body as any).id).toBe((b.body as any).id);

    const c = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit 2" },
      idempotencyKey: "prod-kit-2-v1",
    });
    const d = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit 2" },
      idempotencyKey: "prod-kit-2-v1",
    });
    expect((c.body as any).id).toBe((d.body as any).id);

    const all = await t.run(async (ctx) => await ctx.db.query("products").collect());
    expect(all).toHaveLength(2);
  });

  test("DRAFT não aparece na loja até publicar", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const created = (await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Rascunho", price: 1, enabled: false },
    })).body as any;
    expect(created.status).toBe("DRAFT");

    let store = await t.query(api.products.listActive, {});
    expect(store.some((p: any) => p.name === "Rascunho")).toBe(false);

    const pub = await callV1(t, token, "POST", `/api/v1/products/${created.id}/publish`);
    expect((pub.body as any).status).toBe("PUBLISHED");
    store = await t.query(api.products.listActive, {});
    expect(store.some((p: any) => p.name === "Rascunho")).toBe(true);

    await callV1(t, token, "POST", `/api/v1/products/${created.id}/unpublish`);
    store = await t.query(api.products.listActive, {});
    expect(store.some((p: any) => p.name === "Rascunho")).toBe(false);
  });

  test("GET/PUT delivery-recipe faz round-trip", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const created = (await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", price: 1 },
    })).body as any;

    const put = await callV1(t, token, "PUT", `/api/v1/products/${created.id}/delivery-recipe`, {
      body: {
        version: 1,
        offline_execute: false,
        actions: [{ type: "ADD_RANK", payload: { rank: "ouro" } }],
      },
    });
    expect(put.status).toBe(200);

    const get = await callV1(t, token, "GET", `/api/v1/products/${created.id}/delivery-recipe`);
    expect(get.status).toBe(200);
    const recipe = (get.body as any).delivery_recipe;
    expect(recipe.actions[0].type).toBe("ADD_RANK");
    expect(recipe.actions[0].offline_execute).toBe(false);

    const bad = await callV1(t, token, "PUT", `/api/v1/products/${created.id}/delivery-recipe`, {
      body: { actions: [{ payload: {} }] },
    });
    expect(bad.status).toBe(422);
    expect((bad.body as any).errors[0].code).toBe("INVALID_DELIVERY_RECIPE");
  });

  test("produto criado no SITE é visível para o addon (bidirecional)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("products", {
        name: "Produto do Painel",
        slug: "produto-do-painel",
        images: [],
        tags: [],
        priceCents: 1000,
        stock: 0,
        unlimitedStock: true,
        active: true,
        featured: false,
        popular: false,
        hidden: false,
        minQty: 1,
        maxQty: 99,
        order: 0,
        benefits: [],
        salesCount: 0,
        delivery: { type: "none", showToCustomer: true },
        createdSource: "ADMIN_PANEL",
        createdAt: now,
        updatedAt: now,
      });
    });
    const { token } = await newKey(t, PROD_SCOPES);
    const list = (await callV1(t, token, "GET", "/api/v1/products")).body as any[];
    expect(list.some((p) => p.name === "Produto do Painel")).toBe(true);
  });

  test("delete é soft (arquiva) e não quebra pedidos", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const created = (await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", price: 1, enabled: true },
    })).body as any;

    // pedido histórico ligado ao produto
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("orders", {
        number: "#HIST001",
        customerName: "A",
        customerEmail: "a@b.com",
        items: [{ productId: created.id, name: "Kit", unitPriceCents: 100, quantity: 1, totalCents: 100 }],
        subtotalCents: 100,
        discountCents: 0,
        totalCents: 100,
        paymentStatus: "paid",
        deliveryStatus: "pending",
        statusHistory: [],
        accessToken: "tok",
        createdAt: now,
        updatedAt: now,
      });
    });

    const del = await callV1(t, token, "DELETE", `/api/v1/products/${created.id}`);
    expect(del.status).toBe(200);
    expect((del.body as any).archived).toBe(true);

    const stillThere = await t.run(async (ctx) => await ctx.db.get(created.id));
    expect(stillThere).not.toBeNull(); // nunca apagou de verdade
    const store = await t.query(api.products.listActive, {});
    expect(store.some((p: any) => String(p._id) === created.id)).toBe(false);
    const orders = await t.run(async (ctx) => await ctx.db.query("orders").collect());
    expect(orders).toHaveLength(1);
  });
});

describe("integração com a fila de entrega (snapshot + pipeline)", () => {
  async function createProductWithRecipe(t: T, token: string, recipe: any) {
    const res = await callV1(t, token, "POST", "/api/v1/products", {
      body: {
        name: "Kit Guerreiro",
        price: 9.9,
        external_id: "survival-kit-guerreiro",
        enabled: true,
        delivery_recipe: recipe,
      },
    });
    expect(res.status).toBe(201);
    return res.body as any;
  }

  async function paidOrderFor(t: T, productId: string) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("orders", {
        number: `#T${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        customerName: "Steve",
        customerEmail: "steve@example.com",
        minecraftNick: "Steve123",
        items: [{ productId: productId as any, name: "Kit Guerreiro", unitPriceCents: 990, quantity: 1, totalCents: 990 }],
        subtotalCents: 990,
        discountCents: 0,
        totalCents: 990,
        paymentStatus: "paid",
        deliveryStatus: "pending",
        statusHistory: [],
        accessToken: "tok",
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  test("compra gera entrega com a receita do produto e o snapshot", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const product = await createProductWithRecipe(t, token, {
      version: 1,
      offline_execute: false,
      actions: [
        { type: "GIVE_ITEMS", payload: { items: [{ type: "minecraft_item", format_version: 1, item: { type_id: "minecraft:diamond_sword", amount: 1 } }] } },
        { type: "ADD_MONEY", payload: { amount: 5000 } },
      ],
    });

    const orderId = await paidOrderFor(t, product.id);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });

    const commands = await t.run(async (ctx) => await ctx.db.query("deliveryCommands").collect());
    expect(commands).toHaveLength(2);
    const actions = commands.map((c) => c.action).sort();
    expect(actions).toEqual(["ADD_MONEY", "GIVE_ITEMS"]);
    expect(commands[0].recipeSnapshot).toBeTruthy();
    expect(commands[0].clientIdentifier).toBe("Steve123");

    // fila retorna a mesma ação para o addon
    const queue = (await callV1(t, token, "GET", "/api/v1/app/queued_commands")).body as any[];
    expect(queue).toHaveLength(2);

    // confirma DONE
    const money = commands.find((c) => c.action === "ADD_MONEY")!;
    const done = await callV1(t, token, "PATCH", `/api/v1/app/command/${money.publicId}`, {
      body: { status: "DONE", response: "5000 moedas" },
    });
    expect(done.status).toBe(200);
    const after = (await callV1(t, token, "GET", "/api/v1/app/queued_commands")).body as any[];
    expect(after).toHaveLength(1);
  });

  test("editar a receita depois NÃO muda compras antigas (snapshot)", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const product = await createProductWithRecipe(t, token, {
      version: 1,
      offline_execute: false,
      actions: [{ type: "ADD_MONEY", payload: { amount: 5000 } }],
    });

    const orderId = await paidOrderFor(t, product.id);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const before = (await t.run(async (ctx) => await ctx.db.query("deliveryCommands").collect()))[0];
    expect(before.payload).toEqual({ amount: 5000 });

    // altera a receita do produto (agora 9999 e com um item extra)
    await callV1(t, token, "PUT", `/api/v1/products/${product.id}/delivery-recipe`, {
      body: {
        version: 1,
        actions: [
          { type: "ADD_MONEY", payload: { amount: 9999 } },
          { type: "GIVE_ITEMS", payload: { items: [] } },
        ],
      },
    });

    const after = (await t.run(async (ctx) => await ctx.db.query("deliveryCommands").collect()))[0];
    expect(after.payload).toEqual({ amount: 5000 }); // compra antiga intacta
  });
});

describe("segurança e auditoria", () => {
  test("chave só de entrega não pode criar produto (403)", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, ["deliveries:read", "deliveries:update"]);
    const res = await callV1(t, token, "POST", "/api/v1/products", { body: { name: "X" } });
    expect(res.status).toBe(403);
    expect((res.body as any).errors[0].code).toBe("FORBIDDEN_SCOPE");
  });

  test("chave revogada não altera nada", async () => {
    const t = convexTest(schema, modules);
    const { id, token } = await newKey(t, PROD_SCOPES);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { active: false, revokedAt: Date.now() });
    });
    const res = await callV1(t, token, "POST", "/api/v1/categories", { body: { name: "X" } });
    expect(res.status).toBe(401);
  });

  test("ações geram auditoria", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, [...PROD_SCOPES, ...CAT_SCOPES]);
    const cat = (await callV1(t, token, "POST", "/api/v1/categories", { body: { name: "Kits" } })).body as any;
    await callV1(t, token, "PATCH", `/api/v1/categories/${cat.id}`, { body: { name: "Kits 2" } });
    await callV1(t, token, "POST", "/api/v1/products", { body: { name: "Kit", price: 1 } });
    const logs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("CATEGORY_CREATED");
    expect(actions).toContain("CATEGORY_UPDATED");
    expect(actions).toContain("PRODUCT_CREATED");
  });
});
