/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

// Carrega todos os módulos Convex (exceto os próprios testes)
const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

/** Identidade de usuário no formato aceito por `t.withIdentity`. */
function identity(subject: string) {
  return { subject, issuer: "test", tokenIdentifier: `test|${subject}` };
}

/** Semeia dois clientes (Alice e Bob) com um pedido cada, e um convidado. */
async function seed(t: T) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "VIP", slug: `vip-${Math.random().toString(36).slice(2, 8)}`,
      images: [], tags: [], priceCents: 1000, stock: 0, unlimitedStock: true,
      active: true, featured: false, popular: false, hidden: false,
      minQty: 1, maxQty: 99, order: 0, benefits: [], salesCount: 0,
      delivery: { type: "none", showToCustomer: true },
      createdAt: now, updatedAt: now,
    });
    const userA = await ctx.db.insert("users", {
      name: "Alice", email: "alice@example.com",
    });
    const userB = await ctx.db.insert("users", {
      name: "Bob", email: "bob@example.com",
    });
    const guest = await ctx.db.insert("users", {
      name: "Convidado", isAnonymous: true,
    });

    const orderA = await ctx.db.insert("orders", {
      number: "#ALICE01", customerName: "Alice", customerEmail: "alice@example.com",
      items: [{ productId, name: "VIP", unitPriceCents: 1000, quantity: 1, totalCents: 1000 }],
      subtotalCents: 1000, discountCents: 0, totalCents: 1000,
      paymentStatus: "pending", deliveryStatus: "pending",
      statusHistory: [], accessToken: "token-alice", createdAt: now, updatedAt: now,
    });
    const orderB = await ctx.db.insert("orders", {
      number: "#BOB0001", customerName: "Bob", customerEmail: "bob@example.com",
      items: [{ productId, name: "VIP", unitPriceCents: 1000, quantity: 1, totalCents: 1000 }],
      subtotalCents: 1000, discountCents: 0, totalCents: 1000,
      paymentStatus: "paid", deliveryStatus: "pending",
      statusHistory: [], accessToken: "token-bob", createdAt: now, updatedAt: now,
    });

    return { orderA, orderB, userA, userB, guest };
  });
}

describe("autorização de pedidos (orders.getByNumber)", () => {
  test("o dono logado acessa o próprio pedido", async () => {
    const t = convexTest(schema, modules);
    const { userA } = await seed(t);
    const order = await t
      .withIdentity(identity(userA))
      .query(api.orders.getByNumber, { number: "#ALICE01" });
    expect(order?.number).toBe("#ALICE01");
    expect(order?.customerEmail).toBe("alice@example.com");
  });

  test("o dono NÃO acessa o pedido de outra conta", async () => {
    const t = convexTest(schema, modules);
    const { userA, userB } = await seed(t);
    // Alice tentando ler o pedido do Bob → null
    expect(
      await t.withIdentity(identity(userA)).query(api.orders.getByNumber, { number: "#BOB0001" }),
    ).toBeNull();
    // Bob tentando ler o pedido da Alice → null
    expect(
      await t.withIdentity(identity(userB)).query(api.orders.getByNumber, { number: "#ALICE01" }),
    ).toBeNull();
  });

  test("convidado (anônimo) logado NÃO acessa pedidos de terceiros", async () => {
    const t = convexTest(schema, modules);
    const { guest } = await seed(t);
    expect(
      await t.withIdentity(identity(guest)).query(api.orders.getByNumber, { number: "#ALICE01" }),
    ).toBeNull();
  });

  test("sem sessão e sem token → null (não vaza nem a existência)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect(await t.query(api.orders.getByNumber, { number: "#ALICE01" })).toBeNull();
    expect(
      await t.query(api.orders.getByNumber, { number: "#ALICE01", token: "" }),
    ).toBeNull();
  });

  test("token errado → null; token correto → acessa", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect(
      await t.query(api.orders.getByNumber, { number: "#ALICE01", token: "token-bob" }),
    ).toBeNull();
    const order = await t.query(api.orders.getByNumber, {
      number: "#ALICE01",
      token: "token-alice",
    });
    expect(order?.number).toBe("#ALICE01");
  });

  test("a resposta nunca inclui o accessToken nem campos internos", async () => {
    const t = convexTest(schema, modules);
    const { userA } = await seed(t);
    const order: any = await t
      .withIdentity(identity(userA))
      .query(api.orders.getByNumber, { number: "#ALICE01" });
    expect(order).not.toHaveProperty("accessToken");
    expect(order).not.toHaveProperty("ip");
    expect(order).not.toHaveProperty("uuidField");
    expect(order).not.toHaveProperty("phone");
  });
});

describe("autorização de entregas (orders.guestDeliveries)", () => {
  test("sem token → null (mesmo com o número do pedido)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect(await t.query(api.orders.guestDeliveries, { number: "#BOB0001" })).toBeNull();
  });

  test("token de outro pedido → null", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect(
      await t.query(api.orders.guestDeliveries, { number: "#BOB0001", token: "token-alice" }),
    ).toBeNull();
  });

  test("token correto → lista (vazia quando não há entregas)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect(
      await t.query(api.orders.guestDeliveries, { number: "#BOB0001", token: "token-bob" }),
    ).toEqual([]);
  });
});

describe("bootstrap de owner (team.claimOwnership)", () => {
  test("convidado anônimo (sem e-mail) não consegue virar owner", async () => {
    const t = convexTest(schema, modules);
    const { guest } = await seed(t);
    const res = await t.withIdentity(identity(guest)).mutation(api.team.claimOwnership, {});
    expect(res.claimed).toBe(false);
  });

  test("usuário sem e-mail não consegue virar owner", async () => {
    const t = convexTest(schema, modules);
    const noEmail = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "SemEmail" }),
    );
    const res = await t.withIdentity(identity(noEmail)).mutation(api.team.claimOwnership, {});
    expect(res).toEqual({ claimed: false, reason: "no-email" });
  });
});
