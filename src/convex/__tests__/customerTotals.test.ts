/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
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

async function seedProduct(t: T, priceCents = 1599) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("products", {
      name: "KIT NETHER",
      slug: `kit-${Math.random().toString(36).slice(2, 8)}`,
      images: [],
      tags: [],
      priceCents,
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
  });
}

/** Pedido já pago com cobrança no gateway (para testar estorno). */
async function seedPaidOrderWithGateway(t: T, email = "rodrigo@example.com", totalCents = 2198) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "VIP Ouro",
      slug: `vip-${Math.random().toString(36).slice(2, 8)}`,
      images: [],
      tags: [],
      priceCents: totalCents,
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
      createdAt: now,
      updatedAt: now,
    });
    const customerId = await ctx.db.insert("customers", {
      email,
      name: "Rodrigo",
      ordersCount: 1,
      totalSpentCents: totalCents,
      createdAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      number: `#PAGO${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      customerId,
      customerName: "Rodrigo",
      customerEmail: email,
      items: [{ productId, name: "VIP Ouro", unitPriceCents: totalCents, quantity: 1, totalCents }],
      subtotalCents: totalCents,
      discountCents: 0,
      totalCents,
      paymentStatus: "paid",
      deliveryStatus: "pending",
      gatewayPaymentId: "MP-1",
      statusHistory: [],
      accessToken: "tok",
      createdAt: now,
      updatedAt: now,
      paidAt: now,
    });
    return { orderId, customerId, productId, totalCents };
  });
}

async function customerByEmail(t: T, email: string) {
  return await t.run(async (ctx) => {
    const all = await ctx.db.query("customers").collect();
    return all.find((c) => c.email === email);
  });
}

function withFakeTimers<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  return fn().finally(() => vi.useRealTimers());
}

// ─────────────────────────────────────────────────────────────
// O "total gasto" do cliente tinha o mesmo defeito em todos os números
// derivados: Top 3 compradores da home (R$ 83,91 numa loja que faturou
// R$ 60,95) e a tela de Clientes do painel. A regra agora é a da dashboard:
// só pedido PAGO conta.
// ─────────────────────────────────────────────────────────────

describe("acumulado de compras do cliente", () => {
  test("checkout não soma pedido pendente (PIX gerado e não pago)", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t);

    await t.mutation(api.orders.create, {
      items: [{ productId, quantity: 1 }],
      customer: { name: "Rodrigo", email: "rodrigo@example.com" },
    });

    const customer = await customerByEmail(t, "rodrigo@example.com");
    expect(customer?.ordersCount).toBe(0);
    expect(customer?.totalSpentCents).toBe(0);
    // o cadastro em si continua sendo criado no checkout
    expect(customer?.name).toBe("Rodrigo");
  });

  test("confirmar o pagamento no painel soma; reembolsar estorna", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const productId = await seedProduct(t, 1599);

    const { orderId } = await t.mutation(api.orders.create, {
      items: [{ productId, quantity: 1 }],
      customer: { name: "Rodrigo", email: "rodrigo@example.com" },
    });

    await t.withIdentity(admin.identity).mutation(api.orders.adminUpdateStatus, {
      id: orderId,
      paymentStatus: "paid",
      note: "PIX confirmado",
    });
    let customer = await customerByEmail(t, "rodrigo@example.com");
    expect(customer?.ordersCount).toBe(1);
    expect(customer?.totalSpentCents).toBe(1599);

    await t.withIdentity(admin.identity).mutation(api.orders.adminUpdateStatus, {
      id: orderId,
      paymentStatus: "refunded",
    });
    customer = await customerByEmail(t, "rodrigo@example.com");
    expect(customer?.ordersCount).toBe(0);
    expect(customer?.totalSpentCents).toBe(0);
  });

  test("entrega manual com pagamento confirmado também soma", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const productId = await seedProduct(t, 2198);

    const { orderId } = await t.mutation(api.orders.create, {
      items: [{ productId, quantity: 1 }],
      customer: { name: "Rodrigo", email: "rodrigo@example.com" },
    });

    await t.withIdentity(admin.identity).mutation(api.orders.adminDeliverManually, {
      id: orderId,
      confirmPayment: true,
      note: "PIX caiu",
    });

    const customer = await customerByEmail(t, "rodrigo@example.com");
    expect(customer?.ordersCount).toBe(1);
    expect(customer?.totalSpentCents).toBe(2198);
  });

  test("gateway: pagamento aprovado soma e reembolso estorna", async () => {
    const t = convexTest(schema, modules);
    const { customerId, totalCents } = await seedPaidOrderWithGateway(t);
    // começa consistente (pago): o gateway só transita para reembolso daqui
    let customer = await t.run(async (ctx) => await ctx.db.get(customerId));
    expect(customer?.totalSpentCents).toBe(totalCents);

    await withFakeTimers(async () => {
      await t.mutation(internal.paymentsData.applyGatewayStatus, {
        gatewayPaymentId: "MP-1",
        mpStatus: "refunded",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    });

    customer = await t.run(async (ctx) => await ctx.db.get(customerId));
    expect(customer?.totalSpentCents).toBe(0);
    expect(customer?.ordersCount).toBe(0);
  });

  test("aprovação duplicada do gateway não soma duas vezes", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, 1000);

    const { orderId } = await t.mutation(api.orders.create, {
      items: [{ productId, quantity: 1 }],
      customer: { name: "Rodrigo", email: "rodrigo@example.com" },
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(orderId, { gatewayPaymentId: "MP-9" });
    });

    await withFakeTimers(async () => {
      await t.mutation(internal.paymentsData.applyGatewayStatus, {
        gatewayPaymentId: "MP-9",
        mpStatus: "paid",
      });
      await t.mutation(internal.paymentsData.applyGatewayStatus, {
        gatewayPaymentId: "MP-9",
        mpStatus: "paid",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    });

    const customer = await customerByEmail(t, "rodrigo@example.com");
    expect(customer?.ordersCount).toBe(1);
    expect(customer?.totalSpentCents).toBe(1000);
  });
});

describe("recálculo dos totais já gravados", () => {
  /** Cliente com acumulado inflado por um pedido abandonado. */
  async function seedInflated(t: T) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const productId = await ctx.db.insert("products", {
        name: "KIT", slug: `kit-${Math.random().toString(36).slice(2, 8)}`,
        images: [], tags: [], priceCents: 1599, stock: 0, unlimitedStock: true,
        active: true, featured: false, popular: false, hidden: false,
        minQty: 1, maxQty: 99, order: 0, benefits: [], salesCount: 0,
        delivery: { type: "manual", showToCustomer: true },
        createdAt: now, updatedAt: now,
      });
      const customerId = await ctx.db.insert("customers", {
        email: "rodrigo@example.com",
        name: "MT Rodrigo8981",
        ordersCount: 4, // 3 abandonados + 1 pago
        totalSpentCents: 1599 * 4,
        createdAt: now,
      });
      for (const [i, status] of ["paid", "pending", "pending", "pending"].entries()) {
        await ctx.db.insert("orders", {
          number: `#LEGADO${i}`,
          customerId,
          customerName: "MT Rodrigo8981",
          customerEmail: "rodrigo@example.com",
          items: [{ productId, name: "KIT", unitPriceCents: 1599, quantity: 1, totalCents: 1599 }],
          subtotalCents: 1599, discountCents: 0, totalCents: 1599,
          paymentStatus: status as any, deliveryStatus: "pending",
          statusHistory: [], accessToken: `tok-${i}`, createdAt: now, updatedAt: now,
        });
      }
      return customerId;
    });
  }

  test("painel dispara o recálculo e os totais passam a contar só pedidos pagos", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const customerId = await seedInflated(t);

    const before = await t.withIdentity(admin.identity).query(api.customers.repairTotalsStatus, {});
    expect(before).toEqual({ running: false, done: false, repaired: 0 });

    await withFakeTimers(async () => {
      const started = await t.withIdentity(admin.identity).mutation(api.customers.repairTotals, {});
      expect(started.started).toBe(true);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    });

    const customer = await t.run(async (ctx) => await ctx.db.get(customerId));
    expect(customer?.ordersCount).toBe(1);
    expect(customer?.totalSpentCents).toBe(1599);

    const after = await t.withIdentity(admin.identity).query(api.customers.repairTotalsStatus, {});
    expect(after.running).toBe(false);
    expect(after.done).toBe(true);
    expect(after.repaired).toBe(1);
  });

  test("o Top 3 da home some com o valor fantasma depois do recálculo", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    await seedInflated(t);

    const before = await t.query(api.storefront.getHome, {});
    expect(before.topBuyers[0].totalSpentCents).toBe(1599 * 4);

    await withFakeTimers(async () => {
      await t.withIdentity(admin.identity).mutation(api.customers.repairTotals, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    });

    const after = await t.query(api.storefront.getHome, {});
    expect(after.topBuyers[0].totalSpentCents).toBe(1599);
  });

  test("cron dispara o recálculo sozinho quando ninguém abre o painel", async () => {
    const t = convexTest(schema, modules);
    const customerId = await seedInflated(t);

    await withFakeTimers(async () => {
      await t.mutation(internal.customers.repairTotalsStart, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    });

    const customer = await t.run(async (ctx) => await ctx.db.get(customerId));
    expect(customer?.totalSpentCents).toBe(1599);

    // segunda chamada não reinicia nada (roda uma vez na vida da loja)
    const again = await t.mutation(internal.customers.repairTotalsStart, {});
    expect(again.started).toBe(false);
  });

  test("recálculo é idempotente: rodar de novo não muda mais nada", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    await seedInflated(t);

    await withFakeTimers(async () => {
      await t.withIdentity(admin.identity).mutation(api.customers.repairTotals, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    });
    const first = await t.withIdentity(admin.identity).query(api.customers.repairTotalsStatus, {});
    expect(first.done).toBe(true);
    expect(first.repaired).toBe(1);

    await withFakeTimers(async () => {
      await t.withIdentity(admin.identity).mutation(api.customers.repairTotals, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    });
    const second = await t.withIdentity(admin.identity).query(api.customers.repairTotalsStatus, {});

    expect(second.repaired).toBe(first.repaired);
  });
});
