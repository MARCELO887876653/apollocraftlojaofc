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

async function seedAdmin(t: T, role: string, permissions: string[]) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Equipe",
      email: `${role}@apollo.com`,
    });
    await ctx.db.insert("adminUsers", {
      email: `${role}@apollo.com`,
      name: "Equipe",
      userId,
      role,
      permissions,
      active: true,
      createdAt: Date.now(),
    });
    return { userId, identity: identity(userId) };
  });
}

async function seedOrder(t: T, opts: { number: string; paymentStatus: "paid" | "pending" }) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "KIT NETHER",
      slug: `kit-${opts.number.replace(/\W/g, "")}`,
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
      number: opts.number,
      customerName: "Rodrigo",
      customerEmail: "rodrigo@example.com",
      items: [
        { productId, name: "KIT NETHER", unitPriceCents: 2198, quantity: 1, totalCents: 2198 },
      ],
      subtotalCents: 2198,
      discountCents: 0,
      totalCents: 2198,
      paymentStatus: opts.paymentStatus,
      deliveryStatus: "pending",
      statusHistory: [],
      accessToken: `token-${opts.number}`,
      createdAt: now,
      updatedAt: now,
      paidAt: opts.paymentStatus === "paid" ? now : undefined,
    });
    return { orderId, productId };
  });
}

describe("dashboard: últimos pagamentos", () => {
  test("lista só pedidos pagos (pendente não vira faturamento verde)", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t, "owner", []);
    await seedOrder(t, { number: "#PAGO001", paymentStatus: "paid" });
    await seedOrder(t, { number: "#PEND001", paymentStatus: "pending" });

    const stats = await t
      .withIdentity(admin.identity)
      .query(api.stats.dashboard, {});

    expect(stats.recentOrders).toHaveLength(1);
    expect(stats.recentOrders[0].number).toBe("#PAGO001");
    expect(stats.revenueTotal).toBe(2198);
    expect(stats.ordersPending).toBe(1);
  });
});

describe("entregas automáticas no detalhe do pedido", () => {
  test("devolve apenas os comandos do pedido aberto", async () => {
    const t = convexTest(schema, modules);
    const support = await seedAdmin(t, "support", ["orders.view", "deliveries.view"]);
    const mine = await seedOrder(t, { number: "#MEU0001", paymentStatus: "paid" });
    const other = await seedOrder(t, { number: "#OUT0001", paymentStatus: "paid" });

    await t.run(async (ctx) => {
      const now = Date.now();
      for (const [i, target] of [
        [mine, "mine"],
        [other, "other"],
      ] as const) {
        await ctx.db.insert("deliveryCommands", {
          publicId: `del_${target}`,
          idempotencyKey: `${i.orderId}:0:0`,
          orderId: i.orderId,
          orderNumber: i.orderId === mine.orderId ? "#MEU0001" : "#OUT0001",
          orderItemIndex: 0,
          productId: i.productId,
          productName: "KIT NETHER",
          serverId: "survival-01",
          addonId: "apollo-store",
          clientIdentifier: "MT Rodrigo8981",
          action: "GIVE_KIT",
          variables: [],
          offlineExecute: false,
          executeAt: now,
          status: "PENDING",
          attempts: 0,
          maxAttempts: 5,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const list = await t
      .withIdentity(support.identity)
      .query(api.deliveryCommands.adminListByOrder, { orderId: mine.orderId });

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("del_mine");
    expect(list[0].action).toBe("GIVE_KIT");
  });

  test("visitante não acessa a fila de entregas de um pedido", async () => {
    const t = convexTest(schema, modules);
    const order = await seedOrder(t, { number: "#SEMPERM", paymentStatus: "paid" });
    const guest = await t.run(async (ctx) =>
      identity(await ctx.db.insert("users", { name: "Visitante", isAnonymous: true })),
    );

    await expect(
      t.withIdentity(guest).query(api.deliveryCommands.adminListByOrder, {
        orderId: order.orderId,
      }),
    ).rejects.toThrow(/restrito/i);
  });
});
