import type { QueryCtx } from "../_generated/server";
import {
  DAY_MS,
  dayKey,
  readDailyBuckets,
  readStatsCounters,
  startOfDay,
  topProducts,
} from "./statsRollups";

// ─────────────────────────────────────────────────────────────
// Números do dashboard que dependem de pedidos
//
// Dois caminhos, com a MESMA régua (`paymentStatus === "paid"`):
//  • `rollupOrderStats` — lê contadores + buckets diários (pós-backfill);
//  • `legacyOrderStats` — varre `orders` e `customers` (antes do backfill e
//    referência dos testes).
//
// Ficam fora de `stats.ts` para o teste de custo de leitura poder chamar cada
// caminho com o mesmo `ctx` instrumentado.
// ─────────────────────────────────────────────────────────────

export type SeriesPoint = { day: string; revenue: number; orders: number };

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export async function legacyOrderStats(ctx: QueryCtx, now: number) {
  const orders = await ctx.db.query("orders").collect();
  const customers = await ctx.db.query("customers").collect();

  const paid = orders.filter((o: any) => o.paymentStatus === "paid");
  const pending = orders.filter((o: any) => o.paymentStatus === "pending");

  const paidAtOf = (o: any) => o.paidAt ?? o.createdAt;
  const revenueToday = paid
    .filter((o: any) => paidAtOf(o) >= startOfDay(now))
    .reduce((s: number, o: any) => s + o.totalCents, 0);
  const revenue30 = paid
    .filter((o: any) => paidAtOf(o) >= now - 30 * DAY_MS)
    .reduce((s: number, o: any) => s + o.totalCents, 0);
  const revenueTotal = paid.reduce((s: number, o: any) => s + o.totalCents, 0);

  const nowD = new Date(now);
  const monthStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1).getTime();
  const prevMonthStart = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1).getTime();

  const monthPaid = paid.filter((o: any) => paidAtOf(o) >= monthStart);
  const monthRevenue = monthPaid.reduce((s: number, o: any) => s + o.totalCents, 0);
  const monthOrders = monthPaid.length;
  const prevRevenue = paid
    .filter((o: any) => paidAtOf(o) >= prevMonthStart && paidAtOf(o) < monthStart)
    .reduce((s: number, o: any) => s + o.totalCents, 0);
  const monthTrend =
    prevRevenue > 0 ? ((monthRevenue - prevRevenue) / prevRevenue) * 100 : null;

  const monthDays = Math.max(1, Math.floor((now - monthStart) / DAY_MS) + 1);
  const monthSeries: SeriesPoint[] = [];
  for (let i = 0; i < monthDays; i++) {
    const start = monthStart + i * DAY_MS;
    const dayOrders = paid.filter(
      (o: any) => paidAtOf(o) >= start && paidAtOf(o) < start + DAY_MS,
    );
    monthSeries.push({
      day: dayLabel(start),
      revenue: Math.round(dayOrders.reduce((s: number, o: any) => s + o.totalCents, 0)) / 100,
      orders: dayOrders.length,
    });
  }

  const series: SeriesPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = now - i * DAY_MS;
    const dayOrders = paid.filter(
      (o: any) => paidAtOf(o) >= start && paidAtOf(o) < start + DAY_MS,
    );
    series.push({
      day: dayLabel(start),
      revenue: Math.round(dayOrders.reduce((s: number, o: any) => s + o.totalCents, 0)) / 100,
      orders: dayOrders.length,
    });
  }

  const byProduct: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const o of paid) {
    for (const item of (o as any).items) {
      const key = item.productId;
      if (!byProduct[key]) byProduct[key] = { name: item.name, qty: 0, revenue: 0 };
      byProduct[key].qty += item.quantity;
      byProduct[key].revenue += item.totalCents;
    }
  }
  const top = Object.values(byProduct)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    revenueToday,
    revenue30,
    revenueTotal,
    ordersTotal: orders.length,
    ordersPaid: paid.length,
    ordersPending: pending.length,
    customersTotal: customers.length,
    series,
    monthSeries,
    monthRevenue,
    monthOrders,
    monthTrend,
    topProducts: top,
    recentOrders: paid
      .sort((a: any, b: any) => paidAtOf(b) - paidAtOf(a))
      .slice(0, 8)
      .map((o: any) => ({
        _id: o._id,
        number: o.number,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        totalCents: o.totalCents,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt,
      })),
  };
}

export async function rollupOrderStats(ctx: QueryCtx, now: number) {
  const counters = await readStatsCounters(ctx);
  if (!counters) return null; // contadores ainda não semeados → usa legado

  const nowD = new Date(now);
  const todayStart = startOfDay(now);
  const monthStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1).getTime();
  const prevMonthStart = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1).getTime();

  // Uma leitura cobre a série de 14 dias, os 30 dias e o mês anterior.
  const rangeStart = Math.min(todayStart - 29 * DAY_MS, prevMonthStart);
  const buckets = await readDailyBuckets(ctx, dayKey(rangeStart));
  const byDay = new Map<string, { paidOrders: number; paidRevenueCents: number }>();
  for (const b of buckets) {
    byDay.set(b.day, { paidOrders: b.paidOrders, paidRevenueCents: b.paidRevenueCents });
  }
  const bucketAt = (ts: number) => byDay.get(dayKey(ts));

  /** Soma por dia de calendário (janela alinhada ao dia, como os buckets). */
  const sumBetween = (from: number, toExclusive: number) => {
    let revenue = 0;
    let orders = 0;
    for (let ts = startOfDay(from); ts < toExclusive; ts += DAY_MS) {
      const b = bucketAt(ts);
      if (!b) continue;
      revenue += b.paidRevenueCents;
      orders += b.paidOrders;
    }
    return { revenue, orders };
  };

  const today = bucketAt(todayStart);
  const revenueToday = today?.paidRevenueCents ?? 0;
  // Últimos 30 dias de calendário (inclui hoje). Antes era uma janela rolante
  // de 720h — o mesmo faturamento, agora alinhado ao dia que a série mostra.
  const last30 = sumBetween(todayStart - 29 * DAY_MS, todayStart + DAY_MS);
  const revenue30 = last30.revenue;
  const month = sumBetween(monthStart, todayStart + DAY_MS);
  const prev = sumBetween(prevMonthStart, monthStart);
  const monthTrend = prev.revenue > 0 ? ((month.revenue - prev.revenue) / prev.revenue) * 100 : null;

  const series: SeriesPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayTs = todayStart - i * DAY_MS;
    const b = bucketAt(dayTs);
    series.push({
      day: dayLabel(dayTs),
      revenue: (b?.paidRevenueCents ?? 0) / 100,
      orders: b?.paidOrders ?? 0,
    });
  }

  const monthSeries: SeriesPoint[] = [];
  for (let ts = monthStart; ts <= todayStart; ts += DAY_MS) {
    const b = bucketAt(ts);
    monthSeries.push({
      day: dayLabel(ts),
      revenue: (b?.paidRevenueCents ?? 0) / 100,
      orders: b?.paidOrders ?? 0,
    });
  }

  // "Últimos pagamentos": o índice by_paidAt evita varrer pedidos antigos.
  const recentPool = await ctx.db
    .query("orders")
    .withIndex("by_paidAt")
    .order("desc")
    .take(40);
  const recentOrders = recentPool
    .filter((o: any) => o.paymentStatus === "paid")
    .slice(0, 8)
    .map((o: any) => ({
      _id: o._id,
      number: o.number,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      totalCents: o.totalCents,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt,
    }));

  return {
    revenueToday,
    revenue30,
    revenueTotal: counters.revenuePaidCents,
    ordersTotal: counters.ordersTotal,
    ordersPaid: counters.ordersPaid,
    ordersPending: counters.ordersPending,
    customersTotal: counters.customersTotal,
    series,
    monthSeries,
    monthRevenue: month.revenue,
    monthOrders: month.orders,
    monthTrend,
    topProducts: await topProducts(ctx, 5),
    recentOrders,
  };
}
