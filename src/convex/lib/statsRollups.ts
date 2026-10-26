import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { COUNTER_KEYS, adjustCounter, readCounter } from "./counters";

// ─────────────────────────────────────────────────────────────
// Rollups das estatísticas do painel
//
// O problema: `stats.dashboard` lia a tabela `orders` INTEIRA (e `customers`,
// e `visits`) a cada abertura/atualização da página, só para somar faturamento
// do dia, dos últimos 30 dias, do mês e a série diária. O custo crescia junto
// com o histórico da loja, mesmo que o painel mostrasse sempre os mesmos 5
// números e 14 dias de série.
//
// A solução aqui é incremental, na MESMA transação da mudança de status:
//  • 1 documento por dia (`orderStatsDaily`) com pedidos criados, pedidos
//    pagos e faturamento pago daquele dia;
//  • 1 documento por produto (`orderStatsProducts`) com quantidade e receita;
//  • contadores de total/pagos/pendentes/receita/clientes na tabela `counters`.
//
// Precisão: um pedido só entra quando o status vira "paid" e sai quando deixa
// de ser "paid" (estorno/cancelamento/reembolso) — exatamente a mesma régua que
// as listagens usam (`paymentStatus === "paid"`). O valor sai do dia em que o
// pedido foi pago (`paidAt`), então o histórico não muda de dia depois.
//
// O histórico anterior ao deploy é reconstruído por `statsRollups.backfill`
// (lê pedidos, escreve SÓ dados derivados — nada de negócio é alterado).
// Enquanto o backfill não termina, `stats.dashboard` usa o caminho antigo,
// então o painel nunca mostra número incompleto.
// ─────────────────────────────────────────────────────────────

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Chave local "YYYY-MM-DD" (mesma convenção de `visits`). */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type StatsOrder = {
  createdAt: number;
  paidAt?: number;
  totalCents: number;
  items: Array<{
    productId: Id<"products">;
    name: string;
    quantity: number;
    totalCents: number;
  }>;
};

type DailyDelta = {
  ordersCreated?: number;
  paidOrders?: number;
  paidRevenueCents?: number;
};

export async function bumpDaily(ctx: MutationCtx, day: string, delta: DailyDelta) {
  const now = Date.now();
  const doc = await ctx.db
    .query("orderStatsDaily")
    .withIndex("by_day", (q) => q.eq("day", day))
    .first();
  if (!doc) {
    await ctx.db.insert("orderStatsDaily", {
      day,
      ordersCreated: Math.max(0, delta.ordersCreated ?? 0),
      paidOrders: Math.max(0, delta.paidOrders ?? 0),
      paidRevenueCents: Math.max(0, delta.paidRevenueCents ?? 0),
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch(doc._id, {
    ordersCreated: Math.max(0, doc.ordersCreated + (delta.ordersCreated ?? 0)),
    paidOrders: Math.max(0, doc.paidOrders + (delta.paidOrders ?? 0)),
    paidRevenueCents: Math.max(0, doc.paidRevenueCents + (delta.paidRevenueCents ?? 0)),
    updatedAt: now,
  });
}

export async function bumpProduct(
  ctx: MutationCtx,
  item: { productId: Id<"products">; name: string; quantity: number; totalCents: number },
  sign: 1 | -1,
) {
  const now = Date.now();
  const doc = await ctx.db
    .query("orderStatsProducts")
    .withIndex("by_product", (q) => q.eq("productId", item.productId))
    .first();
  if (!doc) {
    if (sign < 0) return; // nada a estornar
    await ctx.db.insert("orderStatsProducts", {
      productId: item.productId,
      name: item.name,
      qtySold: Math.max(0, item.quantity),
      revenueCents: Math.max(0, item.totalCents),
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch(doc._id, {
    name: item.name || doc.name,
    qtySold: Math.max(0, doc.qtySold + sign * item.quantity),
    revenueCents: Math.max(0, doc.revenueCents + sign * item.totalCents),
    updatedAt: now,
  });
}

// ─── Baselines (só quando o contador ainda não existe) ───
// Rodam no máximo uma vez por contador, na primeira escrita após o deploy.

async function countOrdersReal(ctx: QueryCtx): Promise<number> {
  return (await ctx.db.query("orders").collect()).length;
}

async function countStatusReal(ctx: QueryCtx, status: string): Promise<number> {
  return (
    await ctx.db
      .query("orders")
      .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", status as any))
      .collect()
  ).length;
}

async function revenuePaidReal(ctx: QueryCtx): Promise<number> {
  const paid = await ctx.db
    .query("orders")
    .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", "paid"))
    .collect();
  return paid.reduce((s, o) => s + o.totalCents, 0);
}

async function countCustomersReal(ctx: QueryCtx): Promise<number> {
  return (await ctx.db.query("customers").collect()).length;
}

// ─── Escritas incrementais (chamadas nas transições) ───

/** Pedido novo (sempre nasce "pending", ver orders.create). */
export async function recordOrderCreated(
  ctx: MutationCtx,
  order: { createdAt: number },
): Promise<void> {
  await bumpDaily(ctx, dayKey(order.createdAt), { ordersCreated: 1 });
  await adjustCounter(ctx, COUNTER_KEYS.ordersTotal, 1, () => countOrdersReal(ctx));
  await adjustCounter(ctx, COUNTER_KEYS.ordersPending, 1, () => countStatusReal(ctx, "pending"));
}

/** Cliente novo (o checkout cria no primeiro pedido do e-mail). */
export async function recordCustomerCreated(ctx: MutationCtx): Promise<void> {
  await adjustCounter(ctx, COUNTER_KEYS.customersTotal, 1, () => countCustomersReal(ctx));
}

/**
 * Aplica a mudança de status de UM pedido nos rollups.
 *
 * `order` deve representar o pedido DEPOIS da mudança (com `paidAt` já
 * preenchido quando o novo status é "paid"). `from`/`to` são os status de
 * pagamento. Chamar só nas transições reais — a mesma regra de
 * `lib/customerTotals.ts`, para não contar duas vezes.
 */
export async function applyOrderStatusChange(
  ctx: MutationCtx,
  order: StatsOrder,
  from: string,
  to: string,
): Promise<void> {
  if (from === to) return;

  if (from === "pending") {
    await adjustCounter(ctx, COUNTER_KEYS.ordersPending, -1, () => countStatusReal(ctx, "pending"));
  }
  if (to === "pending") {
    await adjustCounter(ctx, COUNTER_KEYS.ordersPending, 1, () => countStatusReal(ctx, "pending"));
  }

  const becamePaid = from !== "paid" && to === "paid";
  const leftPaid = from === "paid" && to !== "paid";
  if (!becamePaid && !leftPaid) return;

  const sign: 1 | -1 = becamePaid ? 1 : -1;
  // Sempre o dia do PAGAMENTO: estorno não move receita para o dia de hoje.
  const when = order.paidAt ?? Date.now();

  await adjustCounter(ctx, COUNTER_KEYS.ordersPaid, sign, () => countStatusReal(ctx, "paid"));
  await adjustCounter(
    ctx,
    COUNTER_KEYS.revenuePaidCents,
    sign * order.totalCents,
    () => revenuePaidReal(ctx),
  );
  await bumpDaily(ctx, dayKey(when), {
    paidOrders: sign,
    paidRevenueCents: sign * order.totalCents,
  });
  for (const item of order.items) await bumpProduct(ctx, item, sign);
}

// ─── Leituras para o painel ───

export type StatsCounters = {
  ordersTotal: number;
  ordersPaid: number;
  ordersPending: number;
  revenuePaidCents: number;
  customersTotal: number;
};

/** Todos os contadores de uma vez. `null` = ainda não inicializado. */
export async function readStatsCounters(ctx: QueryCtx): Promise<StatsCounters | null> {
  const [ordersTotal, ordersPaid, ordersPending, revenuePaidCents, customersTotal] =
    await Promise.all([
      readCounter(ctx, COUNTER_KEYS.ordersTotal),
      readCounter(ctx, COUNTER_KEYS.ordersPaid),
      readCounter(ctx, COUNTER_KEYS.ordersPending),
      readCounter(ctx, COUNTER_KEYS.revenuePaidCents),
      readCounter(ctx, COUNTER_KEYS.customersTotal),
    ]);
  if (
    ordersTotal === null ||
    ordersPaid === null ||
    ordersPending === null ||
    revenuePaidCents === null ||
    customersTotal === null
  ) {
    return null;
  }
  return { ordersTotal, ordersPaid, ordersPending, revenuePaidCents, customersTotal };
}

/** Buckets diários a partir de uma chave "YYYY-MM-DD" (inclusive). */
export async function readDailyBuckets(ctx: QueryCtx, fromDay: string) {
  return await ctx.db
    .query("orderStatsDaily")
    .withIndex("by_day", (q) => q.gte("day", fromDay))
    .collect();
}

export async function topProducts(ctx: QueryCtx, limit = 5) {
  const rows = await ctx.db
    .query("orderStatsProducts")
    .withIndex("by_revenue")
    .order("desc")
    .take(limit);
  return rows.map((r) => ({ name: r.name, qty: r.qtySold, revenue: r.revenueCents }));
}

/** true quando o backfill dos rollups terminou (painel pode usar o caminho O(1)). */
export async function rollupsReady(ctx: QueryCtx): Promise<boolean> {
  return (await readCounter(ctx, COUNTER_KEYS.statsRollups)) === 1;
}
