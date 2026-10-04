/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";

// Carrega todos os módulos Convex (exceto os próprios testes)
const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);
type T = ReturnType<typeof convexTest>;

const PROD_SCOPES = [
  "products:read",
  "products:create",
  "products:update",
  "products:publish",
  "delivery-recipes:read",
  "delivery-recipes:write",
];

// Receita LOCAL_REFERENCE como o addon envia (formato da API, snake_case).
const RECIPE = {
  version: 1,
  offline_execute: true,
  actions: [
    {
      id: "give-kit",
      type: "GIVE_KIT",
      mode: "LOCAL_REFERENCE",
      reference_id: "kit:t3tse",
      reference_revision: 7,
      quantity_mode: "IGNORE",
      contents_preview: [{ type_id: "minecraft:diamond_sword", name: "Espada", amount: 1 }],
      payload: {},
    },
  ],
};

async function newKey(
  t: T,
  scopes: string[],
  opts: { serverId?: string; addonId?: string } = {},
) {
  return await t.mutation(internal.apiKeysV1.devCreateForTests, {
    name: "Store Manager",
    scopes,
    serverId: opts.serverId ?? "survival-01",
    addonId: opts.addonId ?? "apollo-store",
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

/** Semeia um produto com `deliveryV1` e um pedido PAGO para ele. */
async function seedPaidOrder(t: T, actions: any[]) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "teste",
      slug: `teste-${Math.random().toString(36).slice(2, 8)}`,
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
      deliveryV1: { enabled: true, actions },
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      number: `#TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerName: "Steve",
      customerEmail: "steve@example.com",
      minecraftNick: "Steve123",
      items: [
        { productId, name: "teste", unitPriceCents: 1000, quantity: 1, totalCents: 1000 },
      ],
      subtotalCents: 1000,
      discountCents: 0,
      totalCents: 1000,
      paymentStatus: "paid",
      deliveryStatus: "pending",
      statusHistory: [],
      accessToken: "tok",
      createdAt: now,
      updatedAt: now,
    });
    return { productId, orderId };
  });
}

async function commands(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("deliveryCommands").collect());
}

describe("preservação da receita de entrega (API)", () => {
  test("upsert com LOCAL_REFERENCE armazena e devolve a receita completa", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);

    const res = await callV1(t, token, "POST", "/api/v1/products/upsert", {
      body: {
        external_id: "apollo:kit:t3tse",
        name: "teste",
        server_id: "survival-01",
        addon_id: "apollo-store",
        price_cents: 1000,
        status: "PUBLISHED",
        delivery_recipe: RECIPE,
      },
    });

    expect(res.status).toBe(201);
    const product = res.body as any;
    expect(product.delivery.mode).toBe("LOCAL_REFERENCE");
    expect(product.delivery.reference_id).toBe("kit:t3tse");
    expect(product.delivery.reference_revision).toBe(7);

    const get = await callV1(t, token, "GET", `/api/v1/products/${product.id}`);
    expect(get.status).toBe(200);
    const got = get.body as any;
    expect(got.delivery.mode).toBe("LOCAL_REFERENCE");
    expect(got.delivery_recipe.actions[0]).toMatchObject({
      id: "give-kit",
      type: "GIVE_KIT",
      mode: "LOCAL_REFERENCE",
      reference_id: "kit:t3tse",
      reference_revision: 7,
      quantity_mode: "IGNORE",
    });
    expect(got.delivery_recipe.actions[0].contents_preview).toHaveLength(1);
  });

  test("editar preço pela API (PATCH) NÃO altera a receita", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const created = (
      await callV1(t, token, "POST", "/api/v1/products/upsert", {
        body: {
          external_id: "apollo:kit:t3tse",
          name: "teste",
          server_id: "survival-01",
          addon_id: "apollo-store",
          price_cents: 1000,
          status: "PUBLISHED",
          delivery_recipe: RECIPE,
        },
      })
    ).body as any;

    const patched = await callV1(t, token, "PATCH", `/api/v1/products/${created.id}`, {
      body: { price_cents: 5000 },
    });
    expect(patched.status).toBe(200);

    const recipe = (
      await callV1(t, token, "GET", `/api/v1/products/${created.id}/delivery-recipe`)
    ).body as any;
    expect(recipe.delivery_recipe.actions[0]).toMatchObject({
      id: "give-kit",
      mode: "LOCAL_REFERENCE",
      reference_id: "kit:t3tse",
      reference_revision: 7,
    });
    const after = (await callV1(t, token, "GET", `/api/v1/products/${created.id}`)).body as any;
    expect(after.price_cents).toBe(5000);
    expect(after.delivery.mode).toBe("LOCAL_REFERENCE");
  });

  test("publicar/despublicar preserva a receita", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const created = (
      await callV1(t, token, "POST", "/api/v1/products/upsert", {
        body: {
          external_id: "apollo:kit:t3tse",
          name: "teste",
          server_id: "survival-01",
          addon_id: "apollo-store",
          price_cents: 1000,
          status: "PUBLISHED",
          delivery_recipe: RECIPE,
        },
      })
    ).body as any;

    await callV1(t, token, "POST", `/api/v1/products/${created.id}/unpublish`);
    await callV1(t, token, "POST", `/api/v1/products/${created.id}/publish`);

    const after = (await callV1(t, token, "GET", `/api/v1/products/${created.id}`)).body as any;
    expect(after.status).toBe("PUBLISHED");
    expect(after.delivery.mode).toBe("LOCAL_REFERENCE");
    expect(after.delivery.reference_id).toBe("kit:t3tse");
    expect(after.delivery_recipe.actions[0].reference_revision).toBe(7);
  });

  test("PUT delivery-recipe mantém a referência enviada", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const created = (
      await callV1(t, token, "POST", "/api/v1/products/upsert", {
        body: {
          external_id: "apollo:kit:t3tse",
          name: "teste",
          server_id: "survival-01",
          addon_id: "apollo-store",
          delivery_recipe: RECIPE,
        },
      })
    ).body as any;

    const put = await callV1(t, token, "PUT", `/api/v1/products/${created.id}/delivery-recipe`, {
      body: RECIPE,
    });
    expect(put.status).toBe(200);
    expect((put.body as any).delivery_recipe.actions[0]).toMatchObject({
      id: "give-kit",
      mode: "LOCAL_REFERENCE",
      reference_id: "kit:t3tse",
      reference_revision: 7,
    });
  });
});

describe("entrega criada na aprovação do pagamento", () => {
  test("guarda snapshot, mode, reference_id e revisão", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t, [
      {
        actionId: "give-kit",
        action: "GIVE_KIT",
        mode: "LOCAL_REFERENCE",
        referenceId: "kit:t3tse",
        referenceRevision: 7,
        quantityMode: "IGNORE",
        contentsPreview: [{ type_id: "minecraft:diamond_sword", name: "Espada", amount: 1 }],
        payload: {},
        serverId: "survival-01",
        addonId: "apollo-store",
        offlineExecute: true,
      },
    ]);

    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });

    const list = await commands(t);
    expect(list).toHaveLength(1);
    const cmd = list[0];
    expect(cmd.status).toBe("PENDING");
    expect(cmd.deliveryMode).toBe("LOCAL_REFERENCE");
    expect(cmd.referenceId).toBe("kit:t3tse");
    expect(cmd.referenceRevision).toBe(7);
    expect(cmd.actionId).toBe("give-kit");
    // snapshot da receita no momento da compra
    expect(cmd.recipeSnapshot.actions[0]).toMatchObject({
      id: "give-kit",
      type: "GIVE_KIT",
      mode: "LOCAL_REFERENCE",
      reference_id: "kit:t3tse",
      reference_revision: 7,
    });
  });

  test("reprocessar a mesma aprovação NÃO duplica entregas", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t, [
      {
        action: "GIVE_KIT",
        mode: "LOCAL_REFERENCE",
        referenceId: "kit:t3tse",
        referenceRevision: 7,
        payload: {},
        serverId: "survival-01",
        addonId: "apollo-store",
        offlineExecute: true,
      },
    ]);

    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });

    expect(await commands(t)).toHaveLength(1);
  });

  test("LOCAL_REFERENCE sem referência vira erro de configuração (não entregável)", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t, [
      {
        action: "GIVE_KIT",
        mode: "LOCAL_REFERENCE",
        // sem referenceId — configuração inválida
        payload: {},
        serverId: "survival-01",
        addonId: "apollo-store",
        offlineExecute: true,
      },
    ]);

    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });

    const list = await commands(t);
    expect(list).toHaveLength(1);
    const cmd = list[0];
    // Não é uma entrega vazia pronta para executar…
    expect(cmd.status).toBe("FAILED");
    expect(cmd.errorCode).toBe("CONFIGURATION_ERROR");
    expect(cmd.retryable).toBe(false);
    expect(cmd.requiresManualIntervention).toBe(true);
    expect(cmd.status).not.toBe("PENDING");

    // …e o addon não a pega na fila (não é PENDING).
    const { token } = await newKey(t, ["deliveries:read"]);
    const queue = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(queue.body as any[]).toHaveLength(0);
  });
});
