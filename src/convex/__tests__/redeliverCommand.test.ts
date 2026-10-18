/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

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

async function seedOrder(t: T) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "KIT NETHER",
      slug: "kit-nether",
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
      delivery: { type: "manual", showToCustomer: true },
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      number: "#KIT001",
      customerName: "Rodrigo",
      customerEmail: "rodrigo@example.com",
      items: [{ productId, name: "KIT NETHER", unitPriceCents: 2198, quantity: 2, totalCents: 4396 }],
      subtotalCents: 4396,
      discountCents: 0,
      totalCents: 4396,
      paymentStatus: "paid",
      deliveryStatus: "delivered",
      statusHistory: [],
      accessToken: "token-kit001",
      createdAt: now,
      updatedAt: now,
      paidAt: now,
    });
    return { orderId, productId };
  });
}

async function seedCommand(
  t: T,
  status: "DONE" | "FAILED" | "CANCELED" | "PENDING",
  overrides: Record<string, unknown> = {},
) {
  const { orderId, productId } = await seedOrder(t);
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("deliveryCommands", {
      publicId: `del_${status.toLowerCase()}`,
      idempotencyKey: `${orderId}:0:0`,
      orderId,
      orderNumber: "#KIT001",
      orderItemIndex: 0,
      productId,
      productName: "KIT NETHER",
      serverId: "survival-01",
      addonId: "apollo-store",
      clientIdentifier: "MT Rodrigo8981",
      action: "GIVE_KIT",
      variables: [{ name: "nickname", value: "MT Rodrigo8981" }],
      offlineExecute: true,
      executeAt: now - 1000,
      status,
      attempts: 5,
      maxAttempts: 5,
      lastError: "Jogador offline",
      requiresManualIntervention: true,
      response: "Entregue com sucesso",
      completedAt: now - 500,
      createdAt: now - 10_000,
      updatedAt: now - 500,
      ...overrides,
    });
  });
}

describe("reenviar entrega (dar de novo)", () => {
  test("entrega concluída volta para a fila como NOVA (tentativas zeradas)", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const id = await seedCommand(t, "DONE");

    await t.withIdentity(admin.identity).mutation(api.deliveryCommands.adminRedeliver, {
      id,
      confirm: true,
    });

    const doc = await t.run(async (ctx) => await ctx.db.get(id));
    expect(doc?.status).toBe("PENDING");
    expect(doc?.attempts).toBe(0);
    expect(doc?.lastError).toBeUndefined();
    expect(doc?.requiresManualIntervention).toBe(false);
    expect(doc?.response).toBeUndefined();
    expect(doc?.completedAt).toBeUndefined();
    // liberado para o addon pegar agora
    expect(doc?.executeAt).toBeLessThanOrEqual(Date.now());
  });

  test("continua na lista do pedido depois de reenviar (o botão não some)", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const id = await seedCommand(t, "DONE");
    const orderId = (await t.run(async (ctx) => await ctx.db.get(id)))!.orderId;

    await t.withIdentity(admin.identity).mutation(api.deliveryCommands.adminRedeliver, {
      id,
      confirm: true,
    });

    const list = await t
      .withIdentity(admin.identity)
      .query(api.deliveryCommands.adminListByOrder, { orderId });
    expect(list).toHaveLength(1);
    expect(list[0]._id).toBe(id);
    expect(list[0].status).toBe("PENDING");
  });

  test("funciona também em entrega que falhou ou foi cancelada", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);

    for (const status of ["FAILED", "CANCELED"] as const) {
      const id = await seedCommand(t, status);
      await t.withIdentity(admin.identity).mutation(api.deliveryCommands.adminRedeliver, {
        id,
        confirm: true,
      });
      const doc = await t.run(async (ctx) => await ctx.db.get(id));
      expect(doc?.status).toBe("PENDING");
      expect(doc?.attempts).toBe(0);
    }
  });

  test("sem confirmação não reenvia (evita duplicar item por engano)", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const id = await seedCommand(t, "DONE");

    await expect(
      t.withIdentity(admin.identity).mutation(api.deliveryCommands.adminRedeliver, {
        id,
        confirm: false,
      }),
    ).rejects.toThrow(/Confirmação obrigatória/);

    const doc = await t.run(async (ctx) => await ctx.db.get(id));
    expect(doc?.status).toBe("DONE");
  });
});
