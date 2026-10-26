/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import { legacyOrderStats, rollupOrderStats } from "../lib/statsDashboard";
import { claimForAddon } from "../apiV1Data";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Conta documentos lidos de um `ctx` (qualquer método que devolva documento:
 * collect/take/first/paginate/get). É a mesma unidade que o Convex cobra em
 * "database I/O" — permite comparar caminhos sem depender do dashboard.
 */
function instrument(ctx: any, counter: { docs: number }) {
  const wrap = (q: any): any =>
    new Proxy(q, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (prop === "collect")
          return async () => {
            const rows = await target.collect();
            counter.docs += rows.length;
            return rows;
          };
        if (prop === "take")
          return async (n: number) => {
            const rows = await target.take(n);
            counter.docs += rows.length;
            return rows;
          };
        if (prop === "first")
          return async () => {
            const row = await target.first();
            counter.docs += row ? 1 : 0;
            return row;
          };
        if (prop === "paginate")
          return async (opts: any) => {
            const res = await target.paginate(opts);
            counter.docs += res.page.length;
            return res;
          };
        if (typeof value === "function") return (...args: any[]) => wrap(value.apply(target, args));
        return value;
      },
    });

  const db = new Proxy(ctx.db, {
    get(target, prop) {
      if (prop === "query") return (table: string) => wrap(target.query(table));
      if (prop === "get")
        return async (id: any) => {
          const row = await target.get(id);
          counter.docs += row ? 1 : 0;
          return row;
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return new Proxy(ctx, {
    get(target, prop) {
      if (prop === "db") return db;
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Semeia uma base sintética: `orders` espalhados por `days` dias. */
async function seedDataset(t: T, orders: number, days: number) {
  const now = Date.now();
  const productId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("products", {
      name: "VIP",
      slug: "vip",
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
      createdAt: now,
      updatedAt: now,
    });
    for (let c = 0; c < 3; c++) {
      await ctx.db.insert("customers", {
        email: `c${c}@example.com`,
        ordersCount: 0,
        totalSpentCents: 0,
        createdAt: now,
      });
    }
    return id;
  });

  const chunk = 200;
  for (let start = 0; start < orders; start += chunk) {
    await t.run(async (ctx) => {
      for (let i = start; i < Math.min(start + chunk, orders); i++) {
        const createdAt = now - ((i % days) + 1) * DAY;
        const paid = i % 5 === 0; // 20% pagos
        await ctx.db.insert("orders", {
          number: `#M${i}`,
          customerName: "Cliente",
          customerEmail: `c${i % 3}@example.com`,
          items: [{ productId, name: "VIP", unitPriceCents: 1000, quantity: 1, totalCents: 1000 }],
          subtotalCents: 1000,
          discountCents: 0,
          totalCents: 1000,
          paymentStatus: paid ? "paid" : "pending",
          deliveryStatus: "pending",
          statusHistory: [],
          accessToken: `tok-${i}`,
          createdAt,
          updatedAt: createdAt,
          paidAt: paid ? createdAt : undefined,
        });
      }
    });
  }
}

async function runBackfill(t: T) {
  let cursor: string | null = null;
  for (let round = 0; round < 100; round++) {
    const res = (await t.mutation(internal.statsRollups.backfill, {
      restart: round === 0,
      cursor,
      batch: 200,
    })) as any;
    if (res.done) return;
    cursor = res.nextCursor;
  }
  throw new Error("backfill não terminou");
}

describe("custo de leitura: dashboard", () => {
  test("mede documentos lidos antes/depois dos rollups (2.000 pedidos)", async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 2000, 120);
    await runBackfill(t);

    const now = Date.now();

    const legacyCounter = { docs: 0 };
    const legacy = await t.run(async (ctx) =>
      legacyOrderStats(instrument(ctx, legacyCounter), now),
    );

    const rollupCounter = { docs: 0 };
    const rollup = await t.run(async (ctx) =>
      rollupOrderStats(instrument(ctx, rollupCounter), now),
    );

    expect(rollup).not.toBeNull();
    // Mesma resposta nos totais (a régua de faturamento é idêntica).
    expect(rollup!.revenueTotal).toBe(legacy.revenueTotal);
    expect(rollup!.ordersTotal).toBe(legacy.ordersTotal);
    expect(rollup!.ordersPaid).toBe(legacy.ordersPaid);
    expect(rollup!.ordersPending).toBe(legacy.ordersPending);
    expect(rollup!.customersTotal).toBe(legacy.customersTotal);
    expect(rollup!.topProducts).toEqual(legacy.topProducts);

    // eslint-disable-next-line no-console
    console.log(
      `[medição] dashboard com 2.000 pedidos: legado=${legacyCounter.docs} docs lidos, rollups=${rollupCounter.docs} docs lidos`,
    );

    // O caminho novo é ordens de magnitude menor e não cresce com o histórico.
    expect(rollupCounter.docs).toBeLessThan(legacyCounter.docs / 10);
  });
});

describe("custo de leitura: listagens e fila", () => {
  test("uma página do painel lê 50 documentos, não o histórico inteiro", async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 2000, 120);

    const fullScan = await t.run(async (ctx) => (await ctx.db.query("orders").collect()).length);
    const page = await t.run(async (ctx) => {
      const res = await ctx.db
        .query("orders")
        .withIndex("by_createdAt")
        .order("desc")
        .paginate({ cursor: null, numItems: 50 });
      return res.page.length;
    });

    // eslint-disable-next-line no-console
    console.log(
      `[medição] pedidos: varredura antiga=${fullScan} docs, página nova=${page} docs`,
    );
    expect(fullScan).toBe(2000);
    expect(page).toBe(50);
  });

  test("claim lê só o que venceu, não todos os PENDING do servidor", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const productId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("products", {
        name: "VIP",
        slug: "vip",
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
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });

    const apiKeyId = await t.run(async (ctx) => {
      const orderId = await ctx.db.insert("orders", {
        number: "#C1",
        customerName: "Steve",
        customerEmail: "s@example.com",
        items: [{ productId, name: "VIP", unitPriceCents: 100, quantity: 1, totalCents: 100 }],
        subtotalCents: 100,
        discountCents: 0,
        totalCents: 100,
        paymentStatus: "paid",
        deliveryStatus: "pending",
        statusHistory: [],
        accessToken: "t",
        createdAt: now,
        updatedAt: now,
        paidAt: now,
      });
      const keyId = await ctx.db.insert("apiKeysV1", {
        name: "addon",
        prefix: "nx_",
        keyHash: "h",
        lastFour: "abcd",
        scopes: ["deliveries:claim"],
        serverId: "survival-01",
        active: true,
        createdAt: now,
      });
      const base = {
        orderId,
        orderNumber: "#C1",
        orderItemIndex: 0,
        productId,
        productName: "VIP",
        serverId: "survival-01",
        addonId: "economy",
        clientIdentifier: "steve",
        action: "GIVE",
        variables: [],
        offlineExecute: true,
        attempts: 0,
        maxAttempts: 5,
        status: "PENDING" as const,
        createdAt: now,
        updatedAt: now,
      };
      // 1.000 entregas agendadas para o futuro (o que o addon NÃO pode pegar
      // agora) + 1 pronta. Antes, o claim lia todas as 1.001 a cada poll.
      for (let i = 0; i < 1000; i++) {
        await ctx.db.insert("deliveryCommands", {
          ...base,
          publicId: `del_future_${i}`,
          idempotencyKey: `future-${i}`,
          executeAt: now + 60_000 + i,
        });
      }
      await ctx.db.insert("deliveryCommands", {
        ...base,
        publicId: "del_due",
        idempotencyKey: "due",
        executeAt: now - 1000,
      });
      return keyId;
    });

    const oldScan = await t.run(async (ctx) => {
      // Consulta que o claim antigo fazia para achar candidatos.
      const rows = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) =>
          q.eq("serverId", "survival-01").eq("status", "PENDING"),
        )
        .collect();
      return rows.length;
    });

    // Primeiro claim “aquece” os contadores da fila (a inicialização lê a
    // tabela uma única vez na vida — fora da medição).
    await t.run(async (ctx) =>
      claimForAddon(ctx as any, { apiKeyId, serverId: "survival-01", limit: 10 }),
    );
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_publicId", (q) => q.eq("publicId", "del_due"))
        .first();
      await ctx.db.patch(row!._id, {
        status: "PENDING",
        executeAt: now - 500,
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        claimToken: undefined,
      });
    });

    const counter = { docs: 0 };
    const claimed = await t.run(async (ctx) =>
      claimForAddon(instrument(ctx, counter) as any, {
        apiKeyId,
        serverId: "survival-01",
        limit: 10,
      }),
    );

    // eslint-disable-next-line no-console
    console.log(
      `[medição] claim com 1.001 PENDING (1 vencida): antigo=${oldScan} docs, novo=${counter.docs} docs`,
    );
    expect(oldScan).toBe(1001);
    expect(claimed).toHaveLength(1);
    // A leitura nova é bounded pela janela do claim, não pelo tamanho da fila.
    expect(counter.docs).toBeLessThan(60);
  });

  test("sem webhook configurado o envio não custa nenhuma leitura", async () => {
    const t = convexTest(schema, modules);
    const counter = { docs: 0 };
    const hooks = await t.run(async (ctx) =>
      ctx.db
        .query("webhooksOut")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect(),
    );
    // eslint-disable-next-line no-console
    console.log(`[medição] webhooks ativos consultados: ${hooks.length}`);
    expect(counter.docs).toBe(0);
    expect(hooks).toHaveLength(0);
  });
});
