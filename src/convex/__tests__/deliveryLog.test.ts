/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

function identity(subject: string) {
  return { subject, issuer: "test", tokenIdentifier: `test|${subject}` };
}

async function seedAdmin(t: T) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Equipe", email: "owner@apollo.com" });
    await ctx.db.insert("adminUsers", {
      email: "owner@apollo.com",
      name: "Equipe",
      userId,
      role: "owner",
      permissions: [],
      active: true,
      createdAt: Date.now(),
    });
    return { userId, identity: identity(userId) };
  });
}

/** Produto com entrega v1 + pedido pago, igual ao fluxo real do pagamento. */
async function seedPaidOrder(t: T) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "KIT NETHER",
      slug: `kit-nether-${now}-${Math.random().toString(36).slice(2, 6)}`,
      images: [],
      tags: [],
      priceCents: 2198,
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
      deliveryV1: {
        enabled: true,
        actions: [
          {
            action: "GIVE_KIT",
            mode: "LOCAL_REFERENCE",
            referenceId: "kit:nether",
            addonId: "apollo-store",
            serverId: "survival-01",
            offlineExecute: true,
          },
        ],
      },
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      number: `#KIT${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerName: "Rodrigo",
      customerEmail: "rodrigo@example.com",
      minecraftNick: "MT Rodrigo8981",
      items: [
        {
          productId,
          name: "KIT NETHER",
          unitPriceCents: 2198,
          quantity: 1,
          totalCents: 2198,
        },
      ],
      subtotalCents: 2198,
      discountCents: 0,
      totalCents: 2198,
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

async function newKey(t: T) {
  return await t.mutation(internal.apiKeysV1.devCreateForTests, {
    name: "Teste",
    scopes: ["deliveries:read", "deliveries:update"],
    serverId: "survival-01",
  });
}

async function allEvents(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("deliveryEvents").collect());
}

async function firstCommand(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("deliveryCommands").first());
}

describe("log completo da entrega automática", () => {
  test("a criação já grava o primeiro evento", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });

    const log = await allEvents(t);
    expect(log).toHaveLength(1);
    expect(log[0].type).toBe("CREATED");
    expect(log[0].status).toBe("PENDING");
    expect(log[0].actor).toBe("SYSTEM");
    expect(log[0].message).toContain("GIVE_KIT");
    expect(log[0].message).toContain("kit:nether");
    expect(log[0].orderNumber).toContain("#KIT");
  });

  test("o claim registra quem pegou (chave/servidor) e qual tentativa", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId } = await newKey(t);

    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 10,
    });
    expect(claimed).toHaveLength(1);

    const log = await allEvents(t);
    const claimEvent = log.find((e) => e.type === "CLAIMED");
    expect(claimEvent).toBeTruthy();
    expect(claimEvent?.actor).toBe("ADDON");
    expect(claimEvent?.apiKeyId).toBe(apiKeyId);
    expect(claimEvent?.serverId).toBe("survival-01");
    expect(claimEvent?.message).toContain("tentativa 1/5");
    expect(claimEvent?.details?.attempt).toBe(1);
  });

  test("DONE sem resposta do addon não inventa sucesso", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId } = await newKey(t);
    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });

    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: claimed[0].id,
      status: "DONE",
      claimToken: claimed[0].claim_token,
      apiKeyId,
      serverId: "survival-01",
    });

    const cmd = await firstCommand(t);
    expect(cmd?.response).toBe("Sem resposta do addon (concluiu sem detalhar)");

    const log = await allEvents(t);
    const done = log.find((e) => e.type === "CONFIRMED");
    expect(done?.status).toBe("DONE");
    expect(done?.details?.addonSentResponse).toBe(false);
  });

  test("jogador offline fica na fila aguardando e não consome tentativa", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId } = await newKey(t);
    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });

    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: claimed[0].id,
      status: "PENDING",
      response: "PLAYER_OFFLINE",
      claimToken: claimed[0].claim_token,
      apiKeyId,
      serverId: "survival-01",
    });

    const cmd = await firstCommand(t);
    expect(cmd?.status).toBe("PENDING");
    expect(cmd?.attempts).toBe(0);
    expect(cmd?.errorCode).toBe("PLAYER_OFFLINE");

    const log = await allEvents(t);
    const waiting = log.find((e) => e.type === "AWAITING_PLAYER");
    expect(waiting).toBeTruthy();
    expect(waiting?.message).toContain("offline");
    expect(waiting?.details?.playerOffline).toBe(true);
    expect(waiting?.details?.attempts).toBe(0);
  });

  test("reenviar registra tudo (quem, quando, de que status) e o claim seguinte traz resent + console_log", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId } = await newKey(t);
    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });
    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: claimed[0].id,
      status: "DONE",
      response: "kit entregue",
      claimToken: claimed[0].claim_token,
      apiKeyId,
      serverId: "survival-01",
    });

    const before = await firstCommand(t);
    await t.withIdentity(admin.identity).mutation(api.deliveryCommands.adminRedeliver, {
      id: before!._id,
      confirm: true,
    });

    const log = await allEvents(t);
    const redeliver = log.filter((e) => e.type === "REDELIVERED");
    expect(redeliver).toHaveLength(1);
    expect(redeliver[0].actor).toBe("ADMIN");
    expect(redeliver[0].actorName).toBe("Equipe");
    expect(redeliver[0].details?.fromStatus).toBe("DONE");
    expect(redeliver[0].details?.previousResponse).toBe("kit entregue");
    expect(redeliver[0].details?.resendCount).toBe(1);

    const again = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });
    expect(again).toHaveLength(1);
    expect(again[0].resent).toMatchObject({ count: 1, by: "Equipe" });
    expect(again[0].console_log).toContain("REENVIADA 1x");
    expect(again[0].console_log).toContain("MT Rodrigo8981");
  });

  test("reenviar esperando o jogador entra desliga offline_execute e fica no log", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const cmd = await firstCommand(t);

    await t.withIdentity(admin.identity).mutation(api.deliveryCommands.adminRedeliver, {
      id: cmd!._id,
      confirm: true,
      waitForOnline: true,
    });

    const after = await firstCommand(t);
    expect(after?.offlineExecute).toBe(false);
    expect(after?.resendCount).toBe(1);

    const log = await allEvents(t);
    const redeliver = log.find((e) => e.type === "REDELIVERED");
    expect(redeliver?.message).toContain("esperar o jogador entrar");
    expect(redeliver?.details?.waitForOnline).toBe(true);
  });

  test("log completo do pedido é do admin e vem em ordem cronológica", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId } = await newKey(t);
    const claimed = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });
    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: claimed[0].id,
      status: "DONE",
      response: "kit entregue",
      claimToken: claimed[0].claim_token,
      apiKeyId,
      serverId: "survival-01",
    });

    const log = await t
      .withIdentity(admin.identity)
      .query(api.deliveryCommands.adminLogByOrder, { orderId });
    expect(log.map((e) => e.type)).toEqual(["CREATED", "CLAIMED", "CONFIRMED"]);
    expect(log[2].message).toContain("kit entregue");

    await expect(
      t.query(api.deliveryCommands.adminLogByOrder, { orderId }),
    ).rejects.toThrow();
  });
});
