/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { hasWebhookFor, scheduleWebhookEvent } from "../lib/webhookDispatch";
import { readQueueCounts, computeQueueCountsReal } from "../lib/queueStats";
import { dayKey } from "../lib/statsRollups";

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
    return identity(userId);
  });
}

const DAY = 24 * 60 * 60 * 1000;

type SeedOrderOptions = {
  number: string;
  paymentStatus: "pending" | "paid" | "refunded" | "cancelled";
  totalCents?: number;
  createdAt?: number;
  paidAt?: number;
  productId?: any;
  productName?: string;
  quantity?: number;
};

async function seedProduct(t: T, name = "KIT NETHER", priceCents = 2198) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("products", {
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`,
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

async function seedOrder(t: T, opts: SeedOrderOptions) {
  // O produto é criado FORA de `t.run` (aninhar execuções trava o convex-test).
  const productId = opts.productId ?? (await seedProduct(t, opts.productName));
  return await t.run(async (ctx) => {
    const now = Date.now();
    // 5s atrás: o backfill só cobre pedidos ANTERIORES ao seu início (os
    // criados depois dele são contados pelos hooks incrementais).
    const createdAt = opts.createdAt ?? now - 5000;
    const total = opts.totalCents ?? 2198;
    const quantity = opts.quantity ?? 1;
    const orderId = await ctx.db.insert("orders", {
      number: opts.number,
      customerName: "Rodrigo",
      customerEmail: "rodrigo@example.com",
      items: [
        {
          productId,
          name: opts.productName ?? "KIT NETHER",
          unitPriceCents: total,
          quantity,
          totalCents: total,
        },
      ],
      subtotalCents: total,
      discountCents: 0,
      totalCents: total,
      paymentStatus: opts.paymentStatus,
      deliveryStatus: "pending",
      statusHistory: [],
      accessToken: `token-${opts.number}`,
      createdAt,
      updatedAt: createdAt,
      paidAt: opts.paidAt ?? (opts.paymentStatus === "paid" ? createdAt : undefined),
    });
    return { orderId, productId };
  });
}

// ─────────────────────────────────────────────────────────────
// 1) Rollups: mesma conta do caminho antigo, sem varrer pedidos
// ─────────────────────────────────────────────────────────────

describe("stats: rollups incrementais", () => {
  test("backfill reproduz exatamente os números do caminho legado", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const now = Date.now();

    // Mesmo produto em dois pedidos pagos (testa o rollup por produto).
    const productId = await seedProduct(t, "VIP DIAMANTE", 5000);
    await seedOrder(t, {
      number: "#A1",
      paymentStatus: "paid",
      totalCents: 5000,
      paidAt: now - 1 * DAY,
      createdAt: now - 2 * DAY,
      productId,
      productName: "VIP DIAMANTE",
      quantity: 2,
    });
    await seedOrder(t, {
      number: "#A2",
      paymentStatus: "paid",
      totalCents: 3000,
      paidAt: now,
      createdAt: now - 3 * DAY,
      productId,
      productName: "VIP DIAMANTE",
    });
    await seedOrder(t, {
      number: "#A3",
      paymentStatus: "pending",
      totalCents: 2198,
      createdAt: now - 4 * DAY,
    });
    await seedOrder(t, {
      number: "#A4",
      paymentStatus: "refunded",
      totalCents: 1999,
      paidAt: now - 6 * DAY,
      createdAt: now - 7 * DAY,
    });
    await seedOrder(t, {
      number: "#A5",
      paymentStatus: "paid",
      totalCents: 1000,
      paidAt: now - 40 * DAY,
      createdAt: now - 41 * DAY,
    });

    const before = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;

    // Backfill: reconstrói só dados derivados.
    const backfill = await t.mutation(internal.statsRollups.backfill, { restart: true });
    expect(backfill.done).toBe(true);

    const after = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;

    // Totais exatos (faturamento considera só "paid", como as listagens).
    expect(after.revenueTotal).toBe(before.revenueTotal);
    expect(after.ordersTotal).toBe(before.ordersTotal);
    expect(after.ordersPaid).toBe(before.ordersPaid);
    expect(after.ordersPending).toBe(before.ordersPending);
    expect(after.customersTotal).toBe(before.customersTotal);
    expect(after.revenueToday).toBe(before.revenueToday);
    expect(after.monthRevenue).toBe(before.monthRevenue);
    expect(after.monthOrders).toBe(before.monthOrders);
    expect(after.topProducts).toEqual(before.topProducts);
    expect(after.recentOrders.map((o: any) => o.number)).toEqual(
      before.recentOrders.map((o: any) => o.number),
    );
  });

  test("backfill não conta duas vezes um pagamento posterior ao seu início", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const productId = await seedProduct(t, "VIP OURO", 4000);

    // Pago ANTES do início do backfill: esse dia é reconstruído pelo backfill.
    const paidBefore = now - 1 * DAY;
    await seedOrder(t, {
      number: "#G1",
      paymentStatus: "paid",
      totalCents: 4000,
      paidAt: paidBefore,
      createdAt: now - 2 * DAY,
      productId,
      productName: "VIP OURO",
      quantity: 1,
    });
    // Pago DEPOIS do início do backfill: quem conta é o hook incremental, que
    // roda no instante do pagamento. Se o backfill também contasse, a receita
    // deste dia entraria em dobro (era o furo real da versão anterior).
    const paidAfter = now + 2 * DAY;
    await seedOrder(t, {
      number: "#G2",
      paymentStatus: "paid",
      totalCents: 7000,
      paidAt: paidAfter,
      createdAt: now - 2 * DAY,
      productId,
      productName: "VIP OURO",
      quantity: 1,
    });

    await t.mutation(internal.statsRollups.backfill, { restart: true });

    const rows = await t.run(async (ctx) => ({
      daily: await ctx.db.query("orderStatsDaily").collect(),
      counters: await ctx.db.query("counters").collect(),
      products: await ctx.db.query("orderStatsProducts").collect(),
    }));

    const beforeRow = rows.daily.find((d) => d.day === dayKey(paidBefore));
    const afterRow = rows.daily.find((d) => d.day === dayKey(paidAfter));

    // Dia do pagamento anterior: reconstruído pelo backfill.
    expect(beforeRow?.paidOrders).toBe(1);
    expect(beforeRow?.paidRevenueCents).toBe(4000);
    // Dia do pagamento posterior: NÃO entra pelo backfill (é do hook).
    expect(afterRow?.paidOrders ?? 0).toBe(0);
    expect(afterRow?.paidRevenueCents ?? 0).toBe(0);

    // O contador de pagos é ABSOLUTO (snapshot do estado atual): conta os dois.
    expect(rows.counters.find((c) => c.key === "orders:paid")?.value).toBe(2);
    // A venda por produto soma só o que o backfill pode reconstruir.
    expect(rows.products[0]?.qtySold).toBe(1);
    expect(rows.products[0]?.revenueCents).toBe(4000);
  });

  test("rodar o backfill de novo depois de concluído não soma em dobro", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const paidAt = now - 3 * DAY;
    await seedOrder(t, {
      number: "#H1",
      paymentStatus: "paid",
      totalCents: 2500,
      paidAt,
      createdAt: now - 4 * DAY,
    });

    await t.mutation(internal.statsRollups.backfill, { restart: true });
    const dailyRow = () =>
      t.run(async (ctx) =>
        (await ctx.db.query("orderStatsDaily").collect()).find((d) => d.day === dayKey(paidAt)),
      );
    const first = await dailyRow();
    expect(first?.paidOrders).toBe(1);
    expect(first?.paidRevenueCents).toBe(2500);

    // Segunda passada sem `restart`: um backfill concluído é no-op. Antes, ela
    // relia o mesmo intervalo e somava tudo de novo (receita em dobro).
    const again = await t.mutation(internal.statsRollups.backfill, {});
    expect(again.done).toBe(true);
    expect((again as any).alreadyDone).toBe(true);

    const second = await dailyRow();
    expect(second?.paidOrders).toBe(1);
    expect(second?.paidRevenueCents).toBe(2500);

    const stats = (await t.withIdentity(await seedAdmin(t)).query(api.stats.dashboard, {})) as any;
    expect(stats.ordersPaid).toBe(1);
    expect(stats.revenueTotal).toBe(2500);
  });

  test("30 dias e série diária somam o mesmo faturamento pago do período", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const now = Date.now();

    await seedOrder(t, {
      number: "#B1",
      paymentStatus: "paid",
      totalCents: 1000,
      paidAt: now - 1000,
      createdAt: now - 1000,
    });
    await seedOrder(t, {
      number: "#B2",
      paymentStatus: "paid",
      totalCents: 2500,
      paidAt: now - 5 * DAY,
      createdAt: now - 6 * DAY,
    });
    await seedOrder(t, {
      number: "#B3",
      paymentStatus: "paid",
      totalCents: 700,
      paidAt: now - 31 * DAY,
      createdAt: now - 32 * DAY,
    });
    await seedOrder(t, { number: "#B4", paymentStatus: "pending", totalCents: 9999, createdAt: now });

    await t.mutation(internal.statsRollups.backfill, { restart: true });
    const stats = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;

    // página de 30 dias: B1 + B2 (B3 está fora da janela)
    expect(stats.revenue30).toBe(3500);
    // a série de 14 dias é uma janela contida nos 30 dias
    const seriesTotal = Math.round(stats.series.reduce((s: number, p: any) => s + p.revenue, 0) * 100);
    expect(seriesTotal).toBe(3500);
    // total histórico inclui o pedido de 31 dias atrás
    expect(stats.revenueTotal).toBe(4200);
  });

  test("pagamento confirmado duas vezes conta uma vez; estorno devolve o faturamento", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const productId = await seedProduct(t, "MOEDAS", 1000);
    const orderId = await seedOrder(t, {
      number: "#C1",
      paymentStatus: "pending",
      totalCents: 1000,
      productId,
      productName: "MOEDAS",
    });
    await t.mutation(internal.statsRollups.backfill, { restart: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(orderId.orderId, { gatewayPaymentId: "MP-C1", gateway: "mercadopago" });
    });

    // gateway confirma (webhook + polling podem chamar isso várias vezes)
    await t.mutation(internal.paymentsData.applyGatewayStatus, {
      gatewayPaymentId: "MP-C1",
      mpStatus: "paid",
    });
    await t.mutation(internal.paymentsData.applyGatewayStatus, {
      gatewayPaymentId: "MP-C1",
      mpStatus: "paid",
    });

    let stats = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;
    expect(stats.revenueTotal).toBe(1000);
    expect(stats.ordersPaid).toBe(1);
    expect(stats.ordersPending).toBe(0);
    expect(stats.topProducts[0]).toMatchObject({ name: "MOEDAS", qty: 1, revenue: 1000 });

    // reembolso: sai do faturamento e do rollup do produto
    await t.mutation(internal.paymentsData.applyGatewayStatus, {
      gatewayPaymentId: "MP-C1",
      mpStatus: "refunded",
    });
    stats = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;
    expect(stats.revenueTotal).toBe(0);
    expect(stats.ordersPaid).toBe(0);
    expect(stats.topProducts.find((p: any) => p.name === "MOEDAS")?.revenue ?? 0).toBe(0);

    // e o painel legado concorda com os contadores
    const daily = await t.run(async (ctx) => await ctx.db.query("orderStatsDaily").collect());
    expect(daily.reduce((s, d) => s + d.paidRevenueCents, 0)).toBe(0);
  });

  test("confirmações concorrentes do gateway não duplicam faturamento", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const { orderId } = await seedOrder(t, { number: "#E1", paymentStatus: "pending", totalCents: 3000 });
    await t.run(async (ctx) => {
      await ctx.db.patch(orderId, { gatewayPaymentId: "MP-E1", gateway: "mercadopago" });
    });
    await t.mutation(internal.statsRollups.backfill, { restart: true });

    // webhook e polling podem chegar juntos: as mutations são serializáveis.
    await Promise.all([
      t.mutation(internal.paymentsData.applyGatewayStatus, {
        gatewayPaymentId: "MP-E1",
        mpStatus: "paid",
      }),
      t.mutation(internal.paymentsData.applyGatewayStatus, {
        gatewayPaymentId: "MP-E1",
        mpStatus: "paid",
      }),
    ]);

    const stats = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;
    expect(stats.revenueTotal).toBe(3000);
    expect(stats.ordersPaid).toBe(1);
  });

  test("checkout → PIX confirmado: contadores nascem certos e a receita entra uma vez", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const productId = await seedProduct(t, "VIP PIX", 1500);

    const created = (await t.mutation(api.orders.create, {
      items: [{ productId, quantity: 1 }],
      customer: { name: "Ana", email: "ana@example.com", minecraftNick: "ana" },
    })) as any;

    // pedido nasce pendente: nada de receita, contadores coerentes
    let stats = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;
    expect(stats.ordersTotal).toBe(1);
    expect(stats.ordersPending).toBe(1);
    expect(stats.ordersPaid).toBe(0);
    expect(stats.revenueTotal).toBe(0);
    expect(stats.customersTotal).toBe(1);

    await t.run(async (ctx) => {
      await ctx.db.patch(created.orderId, { gatewayPaymentId: "MP-PIX-1", gateway: "mercadopago" });
    });
    // ativa o caminho de rollups para conferir os hooks incrementais
    await t.mutation(internal.statsRollups.backfill, { restart: true });

    await t.mutation(internal.paymentsData.applyGatewayStatus, {
      gatewayPaymentId: "MP-PIX-1",
      mpStatus: "paid",
    });

    stats = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;
    expect(stats.revenueTotal).toBe(1500);
    expect(stats.revenueToday).toBe(1500);
    expect(stats.ordersPaid).toBe(1);
    expect(stats.ordersPending).toBe(0);
    expect(stats.topProducts[0]).toMatchObject({ name: "VIP PIX", qty: 1, revenue: 1500 });
  });

  test("status manual do admin (pago → reembolsado) mantém contadores e buckets coerentes", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const { orderId } = await seedOrder(t, { number: "#D1", paymentStatus: "pending", totalCents: 4200 });
    await t.mutation(internal.statsRollups.backfill, { restart: true });

    await t.withIdentity(admin).mutation(api.orders.adminUpdateStatus, {
      id: orderId,
      paymentStatus: "paid",
    });
    let stats = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;
    expect(stats.revenueTotal).toBe(4200);
    expect(stats.ordersPaid).toBe(1);

    await t.withIdentity(admin).mutation(api.orders.adminUpdateStatus, {
      id: orderId,
      paymentStatus: "refunded",
    });
    stats = (await t.withIdentity(admin).query(api.stats.dashboard, {})) as any;
    expect(stats.revenueTotal).toBe(0);
    expect(stats.ordersPaid).toBe(0);
    expect(stats.ordersPending).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 2) Listagens administrativas paginadas
// ─────────────────────────────────────────────────────────────

describe("listagens do painel: paginação por cursor", () => {
  async function seedMany(t: T, count: number, status: "paid" | "pending") {
    const productId = await seedProduct(t, "ITEM");
    const base = Date.now() - count * 60_000;
    const ids: string[] = [];
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        const id = await ctx.db.insert("orders", {
          number: `#P${String(i).padStart(3, "0")}`,
          customerName: `Cliente ${i}`,
          customerEmail: `cliente${i}@example.com`,
          items: [{ productId, name: "ITEM", unitPriceCents: 100, quantity: 1, totalCents: 100 }],
          subtotalCents: 100,
          discountCents: 0,
          totalCents: 100,
          paymentStatus: status,
          deliveryStatus: "pending",
          statusHistory: [],
          accessToken: `tok-${i}`,
          createdAt: base + i * 60_000,
          updatedAt: base + i * 60_000,
          paidAt: status === "paid" ? base + i * 60_000 : undefined,
        });
        ids.push(id as unknown as string);
      }
    });
    return ids;
  }

  test("pedidos: 3 páginas sem duplicar, mais recentes primeiro", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    await seedMany(t, 120, "pending");

    const seen: string[] = [];
    let cursor: string | null = null;
    let rounds = 0;
    let isDone = false;
    while (!isDone && rounds < 10) {
      const res = (await t.withIdentity(admin).query(api.orders.adminList, {
        cursor,
        limit: 50,
      })) as any;
      expect(res.page.length).toBeLessThanOrEqual(50);
      seen.push(...res.page.map((o: any) => o._id));
      isDone = res.isDone;
      cursor = res.continueCursor;
      rounds++;
    }
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    // ordenação: createdAt desc
    const rows = await t.run(async (ctx) => await ctx.db.query("orders").collect());
    const byId = new Map(rows.map((r) => [r._id as unknown as string, r.createdAt]));
    const dates = seen.map((id) => byId.get(id)!);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  test("pedidos: filtro por status pagina dentro do índice", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    await seedMany(t, 60, "paid");
    const pend = await seedMany(t, 60, "pending");

    const first = (await t.withIdentity(admin).query(api.orders.adminList, {
      status: "paid",
      cursor: null,
      limit: 50,
    })) as any;
    expect(first.page).toHaveLength(50);
    expect(first.isDone).toBe(false);
    expect(first.page.every((o: any) => o.paymentStatus === "paid")).toBe(true);

    const second = (await t.withIdentity(admin).query(api.orders.adminList, {
      status: "paid",
      cursor: first.continueCursor,
      limit: 50,
    })) as any;
    expect(second.page).toHaveLength(10);
    expect(second.isDone).toBe(true);
    expect(second.page.every((o: any) => o.paymentStatus === "paid")).toBe(true);

    // nenhum pedido pendente entrou no filtro pago
    const ids = [...first.page, ...second.page].map((o: any) => o._id);
    expect(ids.some((id: string) => pend.includes(id))).toBe(false);
  });

  test("pedidos: busca continua funcionando sobre as páginas", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    await seedMany(t, 120, "pending");

    let cursor: string | null = null;
    let found: any[] = [];
    let rounds = 0;
    while (rounds < 10) {
      const res = (await t.withIdentity(admin).query(api.orders.adminList, {
        search: "#P07",
        cursor,
        limit: 50,
      })) as any;
      found.push(...res.page);
      if (res.isDone) break;
      cursor = res.continueCursor;
      rounds++;
    }
    expect(found.map((o: any) => o.number).sort()).toEqual(["#P070", "#P071", "#P072", "#P073", "#P074", "#P075", "#P076", "#P077", "#P078", "#P079"]);
  });

  test("entregas automáticas: filtro de agendadas + badges sem varrer a tabela", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const now = Date.now();
    const productId = await seedProduct(t, "VIP");

    await t.run(async (ctx) => {
      const base = {
        idempotencyKey: "x",
        orderId: "" as any,
        orderNumber: "#X",
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
        createdAt: now,
        updatedAt: now,
      };
      // 3 prontas + 2 agendadas no futuro
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("deliveryCommands", {
          ...base,
          publicId: `del_due_${i}`,
          idempotencyKey: `due-${i}`,
          executeAt: now - 1000,
          status: "PENDING",
        });
      }
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("deliveryCommands", {
          ...base,
          publicId: `del_future_${i}`,
          idempotencyKey: `future-${i}`,
          executeAt: now + 60_000,
          status: "PENDING",
        });
      }
    });

    const due = (await t.withIdentity(admin).query(api.deliveryCommands.adminList, {
      status: "PENDING",
      scheduled: "due",
      cursor: null,
    })) as any;
    expect(due.page).toHaveLength(3);
    expect(due.counts.PENDING).toBe(3);
    expect(due.counts.SCHEDULED).toBe(2);
    expect(due.counts.ALL).toBe(5);

    const scheduled = (await t.withIdentity(admin).query(api.deliveryCommands.adminList, {
      status: "PENDING",
      scheduled: "only",
      cursor: null,
    })) as any;
    expect(scheduled.page).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────
// 3) Fila do addon: claim só pega o que venceu
// ─────────────────────────────────────────────────────────────

describe("fila do addon: claim seletivo", () => {
  async function seedQueue(t: T) {
    const now = Date.now();
    const productId = await seedProduct(t, "VIP");
    const apiKeyId = await t.run(async (ctx) => {
      const orderId = await ctx.db.insert("orders", {
        number: "#Q1",
        customerName: "Steve",
        customerEmail: "steve@example.com",
        items: [{ productId, name: "VIP", unitPriceCents: 100, quantity: 1, totalCents: 100 }],
        subtotalCents: 100,
        discountCents: 0,
        totalCents: 100,
        paymentStatus: "paid",
        deliveryStatus: "pending",
        statusHistory: [],
        accessToken: "tok-q1",
        createdAt: now,
        updatedAt: now,
        paidAt: now,
      });
      const keyId = await ctx.db.insert("apiKeysV1", {
        name: "addon",
        prefix: "nx_live_",
        keyHash: "hash",
        lastFour: "abcd",
        scopes: ["deliveries:claim", "deliveries:update", "deliveries:read"],
        serverId: "survival-01",
        active: true,
        createdAt: now,
      });
      const base = {
        orderId,
        orderNumber: "#Q1",
        orderItemIndex: 0,
        productId,
        productName: "VIP",
        addonId: "economy",
        clientIdentifier: "steve",
        action: "GIVE",
        variables: [],
        offlineExecute: true,
        attempts: 0,
        maxAttempts: 5,
        createdAt: now,
        updatedAt: now,
      };
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("deliveryCommands", {
          ...base,
          publicId: `del_due_${i}`,
          idempotencyKey: `q-due-${i}`,
          serverId: "survival-01",
          executeAt: now - 1000 - i,
          status: "PENDING",
        });
      }
      await ctx.db.insert("deliveryCommands", {
        ...base,
        publicId: "del_future",
        idempotencyKey: "q-future",
        serverId: "survival-01",
        executeAt: now + 60_000,
        status: "PENDING",
      });
      await ctx.db.insert("deliveryCommands", {
        ...base,
        publicId: "del_retry_ok",
        idempotencyKey: "q-retry-ok",
        serverId: "survival-01",
        executeAt: now - 5000,
        status: "FAILED",
        retryable: true,
        nextAttemptAt: now - 1000,
      });
      await ctx.db.insert("deliveryCommands", {
        ...base,
        publicId: "del_retry_future",
        idempotencyKey: "q-retry-future",
        serverId: "survival-01",
        executeAt: now - 5000,
        status: "FAILED",
        retryable: true,
        nextAttemptAt: now + 60_000,
      });
      await ctx.db.insert("deliveryCommands", {
        ...base,
        publicId: "del_other_server",
        idempotencyKey: "q-other",
        serverId: "creative-01",
        executeAt: now - 1000,
        status: "PENDING",
      });
      return keyId;
    });
    return { apiKeyId, productId };
  }

  test("só entrega o que venceu (PENDING vencida + retry vencido) no servidor visível", async () => {
    const t = convexTest(schema, modules);
    const { apiKeyId } = await seedQueue(t);

    const claimed = (await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 10,
    })) as any[];

    const ids = claimed.map((c) => c.id).sort();
    expect(ids).toEqual(["del_due_0", "del_due_1", "del_due_2", "del_retry_ok"]);
    // o retry vencido continua retentável depois de pego
    expect(claimed.every((c) => c.claim_token.startsWith("clm_"))).toBe(true);

    // segundo claim não pega nada (nada venceu e as outras estão reservadas)
    const again = (await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 10,
    })) as any[];
    expect(again).toHaveLength(0);

    // contadores por status acompanham (1 FAILED virou PROCESSING)
    const counts = await t.run(async (ctx) => await readQueueCounts(ctx));
    const real = await t.run(async (ctx) => await computeQueueCountsReal(ctx));
    expect(counts).toEqual(real);
  });

  test("claim expirado volta pra fila e o contador de PROCESSING zera", async () => {
    const t = convexTest(schema, modules);
    const { apiKeyId } = await seedQueue(t);

    await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 10,
    });
    // addon caiu: o lease expira
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_status_createdAt", (q) => q.eq("status", "PROCESSING"))
        .collect();
      for (const row of rows) await ctx.db.patch(row._id, { claimExpiresAt: Date.now() - 1000 });
    });

    const reclaimed = (await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 10,
    })) as any[];
    // as 3 PENDING vencidas voltam; o retry vencido também
    expect(reclaimed.length).toBe(4);
    const counts = await t.run(async (ctx) => await readQueueCounts(ctx));
    const real = await t.run(async (ctx) => await computeQueueCountsReal(ctx));
    expect(counts).toEqual(real);
  });
});

// ─────────────────────────────────────────────────────────────
// 4) Webhooks: nada é agendado quando ninguém escuta
// ─────────────────────────────────────────────────────────────

describe("webhooks de saída: porta fechada", () => {
  test("sem webhook configurado, o evento não é agendado", async () => {
    const t = convexTest(schema, modules);
    const scheduled = await t.run(async (ctx) => {
      const has = await hasWebhookFor(ctx as any, "order.paid");
      const sent = await scheduleWebhookEvent(ctx as any, "order.paid", { ok: true });
      return { has, sent };
    });
    expect(scheduled).toEqual({ has: false, sent: false });
  });

  test("webhook ativo inscrito recebe; evento não inscrito continua sem agendamento", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("webhooksOut", {
        name: "Discord",
        url: "https://discord.com/api/webhooks/1/abc",
        secret: "s3cr3t",
        events: ["order.paid"],
        active: true,
        failureCount: 0,
        createdAt: Date.now(),
      });
      await ctx.db.insert("webhooksOut", {
        name: "Desativado",
        url: "https://example.com/hook",
        secret: "s3cr3t",
        events: ["*"],
        active: false,
        failureCount: 0,
        createdAt: Date.now(),
      });
    });

    const result = await t.run(async (ctx) => {
      return {
        paid: await scheduleWebhookEvent(ctx as any, "order.paid", { n: 1 }),
        created: await scheduleWebhookEvent(ctx as any, "order.created", { n: 2 }),
      };
    });
    expect(result).toEqual({ paid: true, created: false });
  });
});

// ─────────────────────────────────────────────────────────────
// 5) Cancelar/reenviar mantém os badges coerentes
// ─────────────────────────────────────────────────────────────

describe("fila: badges por status após ações do painel", () => {
  test("cancelar e reenviar mantém contadores iguais à contagem real", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const now = Date.now();
    const productId = await seedProduct(t, "VIP");

    const commandId = await t.run(async (ctx) => {
      const orderId = await ctx.db.insert("orders", {
        number: "#R1",
        customerName: "Ana",
        customerEmail: "ana@example.com",
        items: [{ productId, name: "VIP", unitPriceCents: 100, quantity: 1, totalCents: 100 }],
        subtotalCents: 100,
        discountCents: 0,
        totalCents: 100,
        paymentStatus: "paid",
        deliveryStatus: "pending",
        statusHistory: [],
        accessToken: "tok-r1",
        createdAt: now,
        updatedAt: now,
        paidAt: now,
      });
      return await ctx.db.insert("deliveryCommands", {
        publicId: "del_r1",
        idempotencyKey: "r1",
        orderId,
        orderNumber: "#R1",
        orderItemIndex: 0,
        productId,
        productName: "VIP",
        serverId: "survival-01",
        addonId: "economy",
        clientIdentifier: "ana",
        action: "GIVE",
        variables: [],
        offlineExecute: true,
        executeAt: now,
        status: "PENDING",
        attempts: 0,
        maxAttempts: 5,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.withIdentity(admin).mutation(api.deliveryCommands.adminCancel, { id: commandId });
    let counts = await t.run(async (ctx) => await readQueueCounts(ctx));
    let real = await t.run(async (ctx) => await computeQueueCountsReal(ctx));
    expect(counts).toEqual(real);
    expect(counts).toMatchObject({ pending: 0, canceled: 1 });

    await t.withIdentity(admin).mutation(api.deliveryCommands.adminRetry, { id: commandId });
    counts = await t.run(async (ctx) => await readQueueCounts(ctx));
    real = await t.run(async (ctx) => await computeQueueCountsReal(ctx));
    expect(counts).toEqual(real);
    expect(counts).toMatchObject({ pending: 1, canceled: 0 });
  });
});
