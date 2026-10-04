/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

const FULL_SCOPES = [
  "deliveries:read",
  "deliveries:claim",
  "deliveries:update",
  "users:queue",
  "users:schedules",
  "server:heartbeat",
];
const PROD_SCOPES = [
  "products:read",
  "products:create",
  "products:update",
  "products:delete",
  "products:publish",
  "delivery-recipes:read",
  "delivery-recipes:write",
  "categories:read",
  "categories:create",
  "categories:update",
  "categories:delete",
];

async function newKey(
  t: T,
  scopes: string[],
  opts: { serverId?: string; addonId?: string } = {},
) {
  return await t.mutation(internal.apiKeysV1.devCreateForTests, {
    name: "Teste",
    scopes,
    serverId: opts.serverId ?? "survival-01",
    addonId: opts.addonId,
  });
}

async function callV1(
  t: T,
  token: string,
  method: string,
  path: string,
  opts: { body?: unknown; idempotencyKey?: string; query?: Record<string, string> } = {},
) {
  return await t.action(api.apiV1.handle, {
    method,
    path,
    token,
    bodyText: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    query: opts.query ?? {},
    idempotencyKey: opts.idempotencyKey,
  });
}

async function seedOrder(
  t: T,
  actions: any[],
  opts: { quantity?: number; nick?: string; serverId?: string } = {},
) {
  const quantity = opts.quantity ?? 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "VIP Ouro",
      slug: `vip-${now}-${Math.random().toString(36).slice(2, 6)}`,
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
      number: `#EV${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerName: "Steve",
      customerEmail: "steve@example.com",
      minecraftNick: opts.nick ?? "Steve123",
      items: [
        {
          productId,
          name: "VIP Ouro",
          unitPriceCents: 1000,
          quantity,
          totalCents: 1000 * quantity,
        },
      ],
      subtotalCents: 1000 * quantity,
      discountCents: 0,
      totalCents: 1000 * quantity,
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

// ─────────────────────────────────────────────────────────────
// Scope de claim
// ─────────────────────────────────────────────────────────────
describe("scope deliveries:claim", () => {
  test("claim exige deliveries:claim (e aceita deliveries:update legado)", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t, [
      { action: "ADD_MONEY", payload: { amount: 1 }, offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });

    const { token: claimToken } = await newKey(t, ["deliveries:claim"]);
    const res = await callV1(t, claimToken, "POST", "/api/v1/app/queued_commands/claim", {
      body: { limit: 5 },
    });
    expect(res.status).toBe(200);
    expect((res.body as any).count).toBe(1);
    expect((res.body as any).data[0].claim_token).toMatch(/^clm_/);

    const { token: legacy } = await newKey(t, ["deliveries:update"]);
    const legacyRes = await callV1(t, legacy, "POST", "/api/v1/app/queued_commands/claim", {
      body: { limit: 5 },
    });
    expect(legacyRes.status).toBe(200); // nada a pegar, mas autorizado
  });
});

// ─────────────────────────────────────────────────────────────
// Autorização por objeto
// ─────────────────────────────────────────────────────────────
describe("autorização por objeto", () => {
  test("chave de outro servidor não vê/altera produto alheio", async () => {
    const t = convexTest(schema, modules);
    const { token: a } = await newKey(t, PROD_SCOPES, { serverId: "survival-01", addonId: "store" });
    const created = (await callV1(t, a, "POST", "/api/v1/products", {
      body: { name: "Kit", price: 1, external_id: "kit-1" },
    })).body as any;

    const { token: b } = await newKey(t, PROD_SCOPES, { serverId: "factions-01", addonId: "ranks" });
    const get = await callV1(t, b, "GET", `/api/v1/products/${created.id}`);
    expect(get.status).toBe(404);
    const patch = await callV1(t, b, "PATCH", `/api/v1/products/${created.id}`, {
      body: { name: "Hack" },
    });
    expect(patch.status).toBe(404);
    // e não aparece na listagem do outro servidor
    const list = (await callV1(t, b, "GET", "/api/v1/products")).body as any[];
    expect(list).toHaveLength(0);
  });

  test("confirmação de entrega de outro servidor é rejeitada", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t, [
      { action: "ADD_MONEY", payload: { amount: 1 }, serverId: "survival-01", offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const cmd = (await commands(t))[0];
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "factions-01" });
    const res = await callV1(t, token, "PATCH", `/api/v1/app/command/${cmd.publicId}`, {
      body: { status: "DONE" },
    });
    expect(res.status).toBe(403);
    expect((res.body as any).errors[0].code).toBe("FORBIDDEN_OBJECT");
  });
});

// ─────────────────────────────────────────────────────────────
// Upsert
// ─────────────────────────────────────────────────────────────
describe("upsert", () => {
  test("categoria upsert não duplica e incrementa revision", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const a = await callV1(t, token, "POST", "/api/v1/categories/upsert", {
      body: { external_id: "apollo:kits", name: "Kits" },
    });
    expect(a.status).toBe(201);
    const b = await callV1(t, token, "POST", "/api/v1/categories/upsert", {
      body: { external_id: "apollo:kits", name: "Kits Premium" },
    });
    expect(b.status).toBe(200);
    expect((a.body as any).id).toBe((b.body as any).id);
    expect((b.body as any).revision).toBe(2);
    const all = await t.run(async (ctx) => await ctx.db.query("categories").collect());
    expect(all).toHaveLength(1);
  });

  test("produto upsert é idempotente e preserva o id remoto", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const a = await callV1(t, token, "POST", "/api/v1/products/upsert", {
      body: { external_id: "apollo:kit:vip", name: "Kit VIP", price: 19.9 },
    });
    const b = await callV1(t, token, "POST", "/api/v1/products/upsert", {
      body: { external_id: "apollo:kit:vip", name: "Kit VIP Diamante", price: 24.9 },
    });
    expect((a.body as any).id).toBe((b.body as any).id);
    expect((b.body as any).price_cents).toBe(2490);
    const all = await t.run(async (ctx) => await ctx.db.query("products").collect());
    expect(all).toHaveLength(1);
  });

  test("upsert é escopado por servidor+addon (não sobrescreve outro addon)", async () => {
    const t = convexTest(schema, modules);
    const { token: a } = await newKey(t, PROD_SCOPES, { serverId: "survival-01", addonId: "economy" });
    const { token: b } = await newKey(t, PROD_SCOPES, { serverId: "survival-01", addonId: "kits" });
    await callV1(t, a, "POST", "/api/v1/products/upsert", {
      body: { external_id: "shared", name: "Economy" },
    });
    const created = await callV1(t, b, "POST", "/api/v1/products/upsert", {
      body: { external_id: "shared", name: "Kits" },
    });
    expect(created.status).toBe(201);
    const all = await t.run(async (ctx) => await ctx.db.query("products").collect());
    expect(all).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────
// Idempotency-Key
// ─────────────────────────────────────────────────────────────
describe("Idempotency-Key", () => {
  test("mesma key + mesmo corpo → replay da mesma resposta", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const a = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", price: 1 },
      idempotencyKey: "idem-1",
    });
    expect(a.status).toBe(201);
    const b = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", price: 1 },
      idempotencyKey: "idem-1",
    });
    expect(b.status).toBe(201);
    expect((a.body as any).id).toBe((b.body as any).id);
    const all = await t.run(async (ctx) => await ctx.db.query("products").collect());
    expect(all).toHaveLength(1);
  });

  test("mesma key + corpo diferente → 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", price: 1 },
      idempotencyKey: "idem-2",
    });
    const diff = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Outro", price: 2 },
      idempotencyKey: "idem-2",
    });
    expect(diff.status).toBe(409);
    expect((diff.body as any).errors[0].code).toBe("IDEMPOTENCY_KEY_REUSED");
    const all = await t.run(async (ctx) => await ctx.db.query("products").collect());
    expect(all).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Revision / SYNC_CONFLICT
// ─────────────────────────────────────────────────────────────
describe("revision e conflito", () => {
  test("expected_revision desatualizada → 409 SYNC_CONFLICT com a revisão atual", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const created = (await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", price: 1 },
    })).body as any;
    const ok = await callV1(t, token, "PATCH", `/api/v1/products/${created.id}`, {
      body: { name: "Kit 2", expected_revision: 1 },
    });
    expect(ok.status).toBe(200);
    expect((ok.body as any).revision).toBe(2);

    const conflict = await callV1(t, token, "PATCH", `/api/v1/products/${created.id}`, {
      body: { name: "Kit 3", expected_revision: 1 },
    });
    expect(conflict.status).toBe(409);
    expect((conflict.body as any).errors[0].code).toBe("SYNC_CONFLICT");
    expect((conflict.body as any).current_revision).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// LOCAL_REFERENCE
// ─────────────────────────────────────────────────────────────
describe("LOCAL_REFERENCE", () => {
  test("receita LOCAL_REFERENCE faz round-trip com reference_id e revision", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const res = await callV1(t, token, "POST", "/api/v1/products", {
      body: {
        name: "Kit VIP Diamante",
        price: 19.9,
        external_id: "apollo:kit:vip",
        enabled: true,
        delivery_recipe: {
          version: 1,
          actions: [
            {
              id: "give-kit",
              type: "GIVE_KIT",
              mode: "LOCAL_REFERENCE",
              reference_id: "kit:vip_diamante",
              reference_revision: 3,
              contents_preview: [
                { type_id: "minecraft:diamond_sword", name: "Espada", amount: 1 },
              ],
            },
          ],
        },
      },
    });
    expect(res.status).toBe(201);
    const product = res.body as any;
    expect(product.delivery.mode).toBe("LOCAL_REFERENCE");
    expect(product.delivery.reference_id).toBe("kit:vip_diamante");
    expect(product.delivery.reference_revision).toBe(3);
    expect(product.delivery_recipe.actions[0].mode).toBe("LOCAL_REFERENCE");
    expect(product.delivery_recipe.actions[0].reference_id).toBe("kit:vip_diamante");

    const get = (await callV1(t, token, "GET", `/api/v1/products/${product.id}`)).body as any;
    expect(get.delivery_recipe.actions[0].reference_revision).toBe(3);
    expect(get.delivery_recipe.actions[0].contents_preview[0].name).toBe("Espada");
  });

  test("LOCAL_REFERENCE sem reference_id é rejeitado", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const res = await callV1(t, token, "POST", "/api/v1/products", {
      body: {
        name: "Quebrado",
        delivery_recipe: { actions: [{ type: "GIVE_KIT", mode: "LOCAL_REFERENCE" }] },
      },
    });
    expect(res.status).toBe(422);
    expect((res.body as any).errors[0].code).toBe("INVALID_DELIVERY_RECIPE");
  });
});

// ─────────────────────────────────────────────────────────────
// Claim token / lease
// ─────────────────────────────────────────────────────────────
describe("claim_token", () => {
  test("confirmar sem claim_token é rejeitado (CLAIM_INVALID)", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t, [
      { action: "ADD_MONEY", payload: { amount: 1 }, serverId: "survival-01", offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId, token } = await newKey(t, FULL_SCOPES);
    const claimedList = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 5,
    });
    const claim = claimedList[0];
    const noToken = await callV1(t, token, "PATCH", `/api/v1/app/command/${claim.id}`, {
      body: { status: "DONE" },
    });
    expect(noToken.status).toBe(409);
    expect((noToken.body as any).errors[0].code).toBe("CLAIM_INVALID");

    const wrong = await callV1(t, token, "PATCH", `/api/v1/app/command/${claim.id}`, {
      body: { status: "DONE", claim_token: "clm_errado" },
    });
    expect(wrong.status).toBe(409);

    const right = await callV1(t, token, "PATCH", `/api/v1/app/command/${claim.id}`, {
      body: { status: "DONE", claim_token: claim.claim_token },
    });
    expect(right.status).toBe(200);
    expect((await commands(t))[0].status).toBe("DONE");
  });

  test("claim expirado → CLAIM_EXPIRED e volta para a fila", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t, [
      { action: "ADD_MONEY", payload: { amount: 1 }, serverId: "survival-01", offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId, token } = await newKey(t, FULL_SCOPES);
    const claimedList = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 5,
    });
    const claim = claimedList[0];
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("deliveryCommands").first())!;
      await ctx.db.patch(row._id, { claimExpiresAt: Date.now() - 1000 });
    });
    const expired = await callV1(t, token, "PATCH", `/api/v1/app/command/${claim.id}`, {
      body: { status: "DONE", claim_token: claim.claim_token },
    });
    expect(expired.status).toBe(409);
    expect((expired.body as any).errors[0].code).toBe("CLAIM_EXPIRED");

    // reaper: novo claim recupera a entrega
    const again = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 5,
    });
    expect(again).toHaveLength(1);
  });

  test("claim concorrente nunca entrega a mesma compra duas vezes", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t, [
      { action: "ADD_MONEY", payload: { amount: 1 }, serverId: "survival-01", offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId } = await newKey(t, FULL_SCOPES);
    const [a, b] = await Promise.all([
      t.mutation(internal.apiV1Data.internalClaim, { apiKeyId, serverId: "survival-01", limit: 5 }),
      t.mutation(internal.apiV1Data.internalClaim, { apiKeyId, serverId: "survival-01", limit: 5 }),
    ]);
    expect(a.length + b.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Retry / offline
// ─────────────────────────────────────────────────────────────
describe("retry profissional", () => {
  async function setup(t: T) {
    const { orderId } = await seedOrder(t, [
      { action: "ADD_MONEY", payload: { amount: 1 }, serverId: "survival-01", offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId, token } = await newKey(t, FULL_SCOPES);
    return { apiKeyId, token };
  }

  test("PLAYER_OFFLINE não consome max_attempts", async () => {
    const t = convexTest(schema, modules);
    const { apiKeyId, token } = await setup(t);
    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });
    const before = (await commands(t))[0].attempts; // 1 (consumido no claim)
    expect(before).toBe(1);
    await callV1(t, token, "PATCH", `/api/v1/app/command/${claimed[0].id}`, {
      body: { status: "PENDING", error_code: "PLAYER_OFFLINE", claim_token: claimed[0].claim_token },
    });
    const after = (await commands(t))[0];
    expect(after.status).toBe("PENDING");
    expect(after.attempts).toBe(0);
  });

  test("falha temporária → FAILED retryable com next_attempt_at", async () => {
    const t = convexTest(schema, modules);
    const { apiKeyId, token } = await setup(t);
    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });
    const res = await callV1(t, token, "PATCH", `/api/v1/app/command/${claimed[0].id}`, {
      body: { status: "FAILED", error_code: "TEMPORARY_STORAGE_ERROR", retryable: true, response: "banco off", claim_token: claimed[0].claim_token },
    });
    expect(res.status).toBe(200);
    const stored = (await commands(t))[0];
    expect(stored.status).toBe("FAILED");
    expect(stored.retryable).toBe(true);
    expect(stored.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  test("erro não-retryable → falha final com requires_manual_intervention", async () => {
    const t = convexTest(schema, modules);
    const { apiKeyId, token } = await setup(t);
    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });
    await callV1(t, token, "PATCH", `/api/v1/app/command/${claimed[0].id}`, {
      body: { status: "FAILED", error_code: "REFERENCE_NOT_FOUND", response: "kit removido", claim_token: claimed[0].claim_token },
    });
    const stored = (await commands(t))[0];
    expect(stored.status).toBe("FAILED");
    expect(stored.retryable).toBe(false);
    expect(stored.requiresManualIntervention).toBe(true);
  });

  test("max_attempts atingido → falha final", async () => {
    const t = convexTest(schema, modules);
    const { apiKeyId, token } = await setup(t);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("deliveryCommands").first())!;
      await ctx.db.patch(row._id, { maxAttempts: 1 });
    });
    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });
    await callV1(t, token, "PATCH", `/api/v1/app/command/${claimed[0].id}`, {
      body: { status: "FAILED", error_code: "TEMPORARY_STORAGE_ERROR", claim_token: claimed[0].claim_token },
    });
    const stored = (await commands(t))[0];
    expect(stored.requiresManualIntervention).toBe(true);
    expect(stored.errorCode).toBe("MAX_ATTEMPTS_REACHED");
  });
});

// ─────────────────────────────────────────────────────────────
// Quantidade
// ─────────────────────────────────────────────────────────────
describe("normalização de quantidade", () => {
  test("MULTIPLY multiplica o valor; REPEAT expõe repeat", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(
      t,
      [
        { action: "ADD_MONEY", payload: { amount: 10000 }, quantityMode: "MULTIPLY", serverId: "survival-01", offlineExecute: true },
        { action: "GIVE_KIT", payload: {}, quantityMode: "REPEAT", serverId: "survival-01", offlineExecute: true },
      ],
      { quantity: 3 },
    );
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const all = await commands(t);
    const money = all.find((c) => c.action === "ADD_MONEY")!;
    const kit = all.find((c) => c.action === "GIVE_KIT")!;
    expect(money.payload).toEqual({ amount: 30000 });
    expect(kit.variables.find((v: { name: string; value: string }) => v.name === "repeat")?.value).toBe("3");
  });
});

// ─────────────────────────────────────────────────────────────
// Rate limit de escrita
// ─────────────────────────────────────────────────────────────
describe("limites", () => {
  test("receita gigante é rejeitada (payload limit)", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const actions = Array.from({ length: 40 }, (_, i) => ({ type: `A${i}` }));
    const res = await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Grande", delivery_recipe: { actions } },
    });
    expect(res.status).toBe(422);
    expect((res.body as any).errors[0].code).toBe("INVALID_DELIVERY_RECIPE");
  });
});

// ─────────────────────────────────────────────────────────────
// Sync incremental + soft delete
// ─────────────────────────────────────────────────────────────
describe("sync/changes", () => {
  test("retorna mudanças e tombstone de arquivado", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, PROD_SCOPES);
    const created = (await callV1(t, token, "POST", "/api/v1/products", {
      body: { name: "Kit", price: 1, external_id: "apollo:kit" },
    })).body as any;

    const first = (await callV1(t, token, "GET", "/api/v1/sync/changes", {
      query: { cursor: "0" },
    })).body as any;
    expect(first.changes.some((c: any) => c.kind === "PRODUCT_UPDATED")).toBe(true);
    const cursor = first.next_cursor;

    // arquiva (soft delete)
    await callV1(t, token, "DELETE", `/api/v1/products/${created.id}`);
    const second = (await callV1(t, token, "GET", "/api/v1/sync/changes", {
      query: { cursor },
    })).body as any;
    expect(second.changes.some((c: any) => c.kind === "PRODUCT_ARCHIVED")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Heartbeat + app/me
// ─────────────────────────────────────────────────────────────
describe("diagnóstico e handshake", () => {
  test("heartbeat enriquecido é persistido", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, ["server:heartbeat"], { serverId: "survival-01", addonId: "apollo-store" });
    const res = await callV1(t, token, "POST", "/api/v1/app/heartbeat", {
      body: {
        server_id: "survival-01",
        addon_version: "1.4.0",
        minecraft_version: "1.21.0",
        api_client_version: "1.0.0",
        capabilities: { local_reference: true },
      },
    });
    expect(res.status).toBe(200);
    const servers = await t.query(internal.apiV1Data.internalListServers, {});
    expect(servers[0].version).toBe("1.4.0");
    expect(servers[0].apiClientVersion).toBe("1.0.0");
    expect(servers[0].capabilities).toEqual({ local_reference: true });
  });

  test("app/me devolve capabilities e nunca o token/hash", async () => {
    const t = convexTest(schema, modules);
    const { token, id } = await newKey(t, FULL_SCOPES, { serverId: "survival-01", addonId: "apollo-store" });
    const res = await callV1(t, token, "GET", "/api/v1/app/me");
    const body = res.body as any;
    expect(body.api_version).toBe("v1");
    expect(body.authenticated).toBe(true);
    expect(body.binding.server_id).toBe("survival-01");
    expect(body.binding.addon_id).toBe("apollo-store");
    expect(body.capabilities.supports_claim).toBe(true);
    expect(body.capabilities.supports_local_reference).toBe(true);
    expect(body.key.prefix).toMatch(/^sk_live_/);
    expect(body.key.id).toBe(String(id));
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("keyHash");
  });

  test("cabeçalhos Authorization e X-Api-Key divergentes são rejeitados", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, ["deliveries:read"]);
    const res = await t.fetch("/api/v1/app/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "X-Api-Key": "sk_live_outra" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors[0].code).toBe("AMBIGUOUS_AUTH");
  });
});
