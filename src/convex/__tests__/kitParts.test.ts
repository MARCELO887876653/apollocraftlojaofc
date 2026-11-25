/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

const PARTS = [
  { id: "armaduras", label: "Armaduras", contentsPreview: [{ type_id: "minecraft:diamond_helmet", name: "Capacete", amount: 1 }] },
  { id: "armas", label: "Armas", contentsPreview: [{ type_id: "minecraft:diamond_sword", name: "Espada", amount: 1 }] },
  { id: "blocos", label: "Blocos", contentsPreview: [{ type_id: "minecraft:diamond_block", name: "Bloco de diamante", amount: 64 }] },
];

async function seed(
  t: T,
  opts: { quantity?: number; withParts?: boolean; actionType?: string } = {},
) {
  const quantity = opts.quantity ?? 1;
  const withParts = opts.withParts ?? true;
  const actionType = opts.actionType ?? "GIVE_KIT";
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "KIT GUERREIRO",
      slug: `kit-guerreiro-${Math.random().toString(36).slice(2, 8)}`,
      images: [],
      tags: [],
      priceCents: 2499,
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
        version: 1,
        actions: [
          {
            actionId: "give-kit",
            action: actionType,
            mode: "LOCAL_REFERENCE",
            referenceId: "kit:kit_guerreiro",
            referenceRevision: 1,
            serverId: "survival-01",
            addonId: "apollo-store",
            offlineExecute: false,
            ...(withParts ? { parts: PARTS } : {}),
          },
        ],
      },
      createdAt: now,
      updatedAt: now,
    });

    const customerId = await ctx.db.insert("customers", {
      email: "cliente@apollo.com",
      name: "Cliente",
      minecraftNick: "AdrianoMaester",
      ordersCount: 1,
      totalSpentCents: 2499 * quantity,
      createdAt: now - 3000,
    });

    const userId = await ctx.db.insert("users", {
      name: "Cliente",
      email: "cliente@apollo.com",
    });

    const adminUserId = await ctx.db.insert("users", {
      name: "Dono",
      email: "dono@apollo.com",
    });
    await ctx.db.insert("adminUsers", {
      email: "dono@apollo.com",
      name: "Dono",
      userId: adminUserId,
      role: "owner",
      permissions: [],
      active: true,
      createdAt: now,
    });

    const orderId = await ctx.db.insert("orders", {
      number: "#KITPARTS",
      customerId,
      customerName: "Cliente",
      customerEmail: "cliente@apollo.com",
      minecraftNick: "AdrianoMaester",
      items: [
        {
          productId,
          name: "KIT GUERREIRO",
          unitPriceCents: 2499,
          quantity,
          totalCents: 2499 * quantity,
        },
      ],
      subtotalCents: 2499 * quantity,
      discountCents: 0,
      totalCents: 2499 * quantity,
      gateway: "mercadopago",
      gatewayPaymentId: "MP-KIT-1",
      paymentStatus: "paid",
      paidAt: now - 2000,
      deliveryStatus: "pending",
      statusHistory: [{ status: "paid", at: now - 2000, note: "Pago" }],
      accessToken: "token-kit",
      createdAt: now - 3000,
      updatedAt: now - 2000,
    });

    const apiKeyId = await ctx.db.insert("apiKeysV1", {
      name: "Addon",
      prefix: "sk_test",
      keyHash: "hash",
      lastFour: "1234",
      scopes: ["deliveries:claim", "deliveries:update"],
      serverId: "survival-01",
      addonId: "apollo-store",
      active: true,
      createdAt: now,
    });

    return { orderId, productId, apiKeyId, userId, adminUserId, quantity };
  });
}

async function commandsOf(t: T, orderId: any): Promise<any[]> {
  return await t.run(async (ctx: any) =>
    await ctx.db
      .query("deliveryCommands")
      .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
      .collect(),
  );
}

describe("entrega por shulker (parts)", () => {
  test("2 kits × 3 shulkers geram 6 comandos distintos, um por unidade e parte", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seed(t, { quantity: 2 });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });

    const cmds = await commandsOf(t, orderId);
    expect(cmds).toHaveLength(6);
    expect(new Set(cmds.map((c) => c.idempotencyKey)).size).toBe(6);
    expect(cmds.every((c) => c.partTotal === 3)).toBe(true);
    expect(cmds.every((c) => c.action === "GIVE_KIT")).toBe(true);
    expect(cmds.every((c) => c.payload?.kit_part?.total === 3)).toBe(true);

    for (const partIndex of [0, 1, 2]) {
      expect(cmds.filter((c) => c.partIndex === partIndex)).toHaveLength(2);
    }
    expect(cmds.filter((c) => c.unitIndex === 0)).toHaveLength(3);
    expect(cmds.filter((c) => c.unitIndex === 1)).toHaveLength(3);
    expect(cmds.map((c) => c.partLabel)).toContain("Armaduras");
    expect(cmds.map((c) => c.partLabel)).toContain("Armas");
    expect(cmds.map((c) => c.partLabel)).toContain("Blocos");
  });

  test("criar duas vezes não duplica (idempotência por parte)", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seed(t, { quantity: 2 });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const again = await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    expect(again.created).toBe(0);
    expect(await commandsOf(t, orderId)).toHaveLength(6);
  });

  test("pedido só fica entregue quando todas as shulkers são confirmadas", async () => {
    const t = convexTest(schema, modules);
    const { orderId, apiKeyId } = await seed(t, { quantity: 2 });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const cmds = await commandsOf(t, orderId);
    const confirm = (publicId: string) =>
      t.mutation(internal.apiV1Data.internalConfirm, {
        publicId,
        status: "DONE",
        response: "Entregue no Minecraft.",
        apiKeyId,
        serverId: "survival-01",
        addonId: "apollo-store",
      });

    for (const c of cmds.slice(0, 5)) await confirm(c.publicId);
    let order = await t.run(async (ctx) => await ctx.db.get(orderId));
    expect(order?.deliveryStatus).toBe("pending");

    await confirm(cmds[5].publicId);
    order = await t.run(async (ctx) => await ctx.db.get(orderId));
    expect(order?.deliveryStatus).toBe("delivered");
    expect(order?.statusHistory[order.statusHistory.length - 1]?.note).toContain(
      "todas as partes",
    );
  });

  test("falha definitiva em uma shulker marca o pedido como falhou", async () => {
    const t = convexTest(schema, modules);
    const { orderId, apiKeyId } = await seed(t, {});
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const cmds = await commandsOf(t, orderId);

    for (const c of cmds.slice(1)) {
      await t.mutation(internal.apiV1Data.internalConfirm, {
        publicId: c.publicId,
        status: "DONE",
        response: "ok",
        apiKeyId,
        serverId: "survival-01",
        addonId: "apollo-store",
      });
    }
    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: cmds[0].publicId,
      status: "FAILED",
      errorCode: "REFERENCE_REVISION_NOT_FOUND",
      retryable: false,
      response: "revisão não existe",
      apiKeyId,
      serverId: "survival-01",
      addonId: "apollo-store",
    });
    const order = await t.run(async (ctx) => await ctx.db.get(orderId));
    expect(order?.deliveryStatus).toBe("failed");
  });

  test("item único (GIVE_ITEM) fecha o pedido; kit sem composição NÃO fecha", async () => {
    const t = convexTest(schema, modules);
    const itemSeed = await seed(t, { actionType: "GIVE_ITEM", withParts: false });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, {
      orderId: itemSeed.orderId,
    });
    const [itemCmd] = await commandsOf(t, itemSeed.orderId);
    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: itemCmd.publicId,
      status: "DONE",
      response: "ok",
      apiKeyId: itemSeed.apiKeyId,
      serverId: "survival-01",
      addonId: "apollo-store",
    });
    let order = await t.run(async (ctx) => await ctx.db.get(itemSeed.orderId));
    expect(order?.deliveryStatus).toBe("delivered");

    // Segundo pedido: kit SEM `parts` (caso dos pedidos reportados). O addon
    // confirmou um comando, mas não há como saber quantas shulkers faltam.
    const kitSeed = await seed(t, { withParts: false });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, {
      orderId: kitSeed.orderId,
    });
    const [kitCmd] = await commandsOf(t, kitSeed.orderId);
    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: kitCmd.publicId,
      status: "DONE",
      response: "ok",
      apiKeyId: kitSeed.apiKeyId,
      serverId: "survival-01",
      addonId: "apollo-store",
    });
    order = await t.run(async (ctx) => await ctx.db.get(kitSeed.orderId));
    expect(order?.deliveryStatus).toBe("pending");
  });

  test("jogador offline e inventário cheio não consomem tentativa", async () => {
    const t = convexTest(schema, modules);
    const { orderId, apiKeyId } = await seed(t, { withParts: false });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const [cmd] = await commandsOf(t, orderId);
    expect(cmd.attempts).toBe(0);

    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: cmd.publicId,
      status: "PENDING",
      errorCode: "INVENTORY_FULL",
      response: "Inventário cheio",
      apiKeyId,
      serverId: "survival-01",
      addonId: "apollo-store",
    });
    const after = (await commandsOf(t, orderId))[0];
    expect(after.status).toBe("PENDING");
    expect(after.attempts).toBe(0);
    expect(after.errorCode).toBe("INVENTORY_FULL");
    // volta em ~60s, não imediatamente (evita loop)
    expect(after.executeAt).toBeGreaterThan(Date.now() + 30_000);
  });

  test("recuperação enfileira só as shulkers faltantes de um pedido antigo", async () => {
    const t = convexTest(schema, modules);
    const { orderId, adminUserId } = await seed(t, { quantity: 2 });
    // pedido antigo: só a shulker 1 de cada unidade foi criada (armadura)
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let unit = 0; unit < 2; unit++) {
        await ctx.db.insert("deliveryCommands", {
          publicId: `del_old_${unit}`,
          idempotencyKey: `${orderId}:0:0${unit === 0 ? "" : `:u${unit + 1}`}`,
          orderId,
          orderNumber: "#KITPARTS",
          orderItemIndex: 0,
          productId: (await ctx.db.get(orderId))!.items[0].productId,
          productName: "KIT GUERREIRO",
          serverId: "survival-01",
          addonId: "apollo-store",
          clientIdentifier: "AdrianoMaester",
          action: "GIVE_KIT",
          variables: [],
          offlineExecute: false,
          executeAt: now - 5000,
          status: "DONE",
          attempts: 1,
          maxAttempts: 5,
          completedAt: now - 4000,
          createdAt: now - 5000,
          updatedAt: now - 4000,
        });
      }
    });

    const adminIdentity = {
      subject: String(adminUserId),
      issuer: "test",
      tokenIdentifier: `test|${adminUserId}`,
    };

    const res = await t
      .withIdentity(adminIdentity)
      .mutation(api.deliveryCommands.adminRecoverMissingParts, { orderId, confirm: true });
    expect(res.created).toBe(4); // 2 unidades × (armas, blocos)
    const cmds = await commandsOf(t, orderId);
    expect(cmds).toHaveLength(6);
    expect(cmds.filter((c) => c.status === "DONE")).toHaveLength(2);
    expect(cmds.filter((c) => c.status === "PENDING")).toHaveLength(4);

    // rodar de novo não duplica
    const again = await t
      .withIdentity(adminIdentity)
      .mutation(api.deliveryCommands.adminRecoverMissingParts, { orderId, confirm: true });
    expect(again.created).toBe(0);
  });

  test("\"O que você recebeu\" mostra cada shulker entregue e pendente", async () => {
    const t = convexTest(schema, modules);
    const { orderId, apiKeyId, userId } = await seed(t, {});
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const cmds = await commandsOf(t, orderId);
    await t.mutation(internal.apiV1Data.internalConfirm, {
      publicId: cmds[0].publicId,
      status: "DONE",
      response: "ok",
      apiKeyId,
      serverId: "survival-01",
      addonId: "apollo-store",
    });

    const items = await t
      .withIdentity({ subject: userId as any, issuer: "test", tokenIdentifier: `test|${userId}` })
      .query(api.orders.myOrderDeliveries, { number: "#KITPARTS" });
    expect(items).toHaveLength(1);
    expect(items![0].status).toBe("pending");
    expect(items![0].totalParts).toBe(3);
    expect(items![0].deliveredParts).toBe(1);
    expect(items![0].parts?.map((p: any) => p.status)).toEqual([
      "delivered",
      "pending",
      "pending",
    ]);
    expect(items![0].parts?.[0].contents).toContain("Capacete");
  });
});
