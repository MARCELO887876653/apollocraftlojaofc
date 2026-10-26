import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin";
import { COUNTER_KEYS, readCounter } from "./lib/counters";

// ─────────────────────────────────────────────────────────────
// Estatísticas do painel
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Chave local "YYYY-MM-DD" para agrupar visitas por dia. */
function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Registra 1 visita (chamado pelo VisitTracker, 1x por sessão do navegador). */
export const trackVisit = mutation({
  args: { path: v.optional(v.string()) },
  handler: async (ctx, { path }) => {
    const day = dayKey(Date.now());
    const existing = await ctx.db
      .query("visits")
      .withIndex("by_day", (q) => q.eq("day", day))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { count: existing.count + 1, lastPath: path });
    } else {
      await ctx.db.insert("visits", { day, count: 1, createdAt: Date.now(), lastPath: path });
    }
    return { ok: true };
  },
});

/** Resumo leve usado no card da loja (página "Mais"). */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "orders.view");
    const orders = await ctx.db.query("orders").collect();
    const revenueTotal = orders
      .filter((o) => o.paymentStatus === "paid")
      .reduce((s, o) => s + o.totalCents, 0);
    const customers = await ctx.db.query("customers").collect();
    return { revenueTotal, customersTotal: customers.length };
  },
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "orders.view");
    const orders = await ctx.db.query("orders").collect();
    const customers = await ctx.db.query("customers").collect();
    const visits = await ctx.db.query("visits").collect();

    // ── Produtos: contador denormalizado (1 leitura) ──
    // Antes esta consulta lia a tabela de produtos INTEIRA — cada documento
    // com imagens, descrição, benefícios e receita de entrega — só para exibir
    // a quantidade. O contador é ajustado na mesma transação do insert/delete
    // (lib/catalog.ts e products.remove). A contagem real só acontece se o
    // contador ainda não existir (primeira leitura após o deploy).
    const productCounter = await readCounter(ctx, COUNTER_KEYS.products);
    const productsTotal =
      productCounter ?? (await ctx.db.query("products").collect()).length;

    // ── Entregas: só os status que o painel mostra ──
    // `collect()` lia TODO o histórico de entregas, incluindo as já entregues
    // (a maioria) e o payload de cada uma. Pelo índice `by_status_retry`
    // lemos apenas pendentes/processando/falhas.
    const deliveriesWithStatus = (status: "pending" | "processing" | "failed") =>
      ctx.db
        .query("deliveries")
        .withIndex("by_status_retry", (q) => q.eq("status", status))
        .collect();
    const [deliveriesPendingRows, deliveriesProcessingRows, deliveriesFailedRows] =
      await Promise.all([
        deliveriesWithStatus("pending"),
        deliveriesWithStatus("processing"),
        deliveriesWithStatus("failed"),
      ]);

    const paid = orders.filter((o) => o.paymentStatus === "paid");
    const pending = orders.filter((o) => o.paymentStatus === "pending");
    const now = Date.now();

    const revenueToday = paid
      .filter((o) => (o.paidAt ?? o.createdAt) >= startOfDay(now))
      .reduce((s, o) => s + o.totalCents, 0);
    const revenue30 = paid
      .filter((o) => (o.paidAt ?? o.createdAt) >= now - 30 * DAY_MS)
      .reduce((s, o) => s + o.totalCents, 0);
    const revenueTotal = paid.reduce((s, o) => s + o.totalCents, 0);

    // ── Mês atual vs mês anterior (tendência estilo CentralCart) ──
    const nowD = new Date(now);
    const monthStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1).getTime();
    const prevMonthStart = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1).getTime();

    const monthPaid = paid.filter((o) => (o.paidAt ?? o.createdAt) >= monthStart);
    const monthRevenue = monthPaid.reduce((s, o) => s + o.totalCents, 0);
    const monthOrders = monthPaid.length;
    const prevRevenue = paid
      .filter(
        (o) => (o.paidAt ?? o.createdAt) >= prevMonthStart && (o.paidAt ?? o.createdAt) < monthStart,
      )
      .reduce((s, o) => s + o.totalCents, 0);
    const monthTrend =
      prevRevenue > 0 ? ((monthRevenue - prevRevenue) / prevRevenue) * 100 : null;

    // série diária do mês corrente (para o sparkline laranja)
    const monthDays = Math.max(1, Math.floor((now - monthStart) / DAY_MS) + 1);
    const monthSeries: { day: string; revenue: number; orders: number }[] = [];
    for (let i = 0; i < monthDays; i++) {
      const start = monthStart + i * DAY_MS;
      const dayOrders = paid.filter(
        (o) => (o.paidAt ?? o.createdAt) >= start && (o.paidAt ?? o.createdAt) < start + DAY_MS,
      );
      monthSeries.push({
        day: new Date(start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        revenue: Math.round(dayOrders.reduce((s, o) => s + o.totalCents, 0)) / 100,
        orders: dayOrders.length,
      });
    }

    // série diária dos últimos 14 dias (usada na página Estatísticas)
    const series: { day: string; revenue: number; orders: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const start = now - i * DAY_MS;
      const dayOrders = paid.filter(
        (o) => (o.paidAt ?? o.createdAt) >= start && (o.paidAt ?? o.createdAt) < start + DAY_MS,
      );
      series.push({
        day: new Date(start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        revenue: Math.round(dayOrders.reduce((s, o) => s + o.totalCents, 0)) / 100,
        orders: dayOrders.length,
      });
    }

    // ── Visitas: semana atual (segunda → hoje) + total ──
    const dow = (nowD.getDay() + 6) % 7; // 0 = segunda
    const weekStart = startOfDay(now) - dow * DAY_MS;
    const visitsWeek: { day: string; count: number }[] = [];
    let visitsThisWeek = 0;
    for (let i = 0; i < 7; i++) {
      const ts = weekStart + i * DAY_MS;
      const key = dayKey(ts);
      const count = visits
        .filter((v) => v.day === key)
        .reduce((s, v) => s + v.count, 0);
      visitsWeek.push({ day: WEEKDAYS[new Date(ts).getDay()], count });
      visitsThisWeek += count;
    }
    const visitsTotal = visits.reduce((s, v) => s + v.count, 0);

    // top produtos por receita
    const byProduct: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const o of paid) {
      for (const item of o.items) {
        const key = item.productId;
        if (!byProduct[key]) byProduct[key] = { name: item.name, qty: 0, revenue: 0 };
        byProduct[key].qty += item.quantity;
        byProduct[key].revenue += item.totalCents;
      }
    }
    const topProducts = Object.values(byProduct)
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
      productsTotal,
      deliveriesPending: deliveriesPendingRows.length + deliveriesProcessingRows.length,
      deliveriesFailed: deliveriesFailedRows.length,
      series,
      monthSeries,
      monthRevenue,
      monthOrders,
      monthTrend,
      visitsWeek,
      visitsThisWeek,
      visitsTotal,
      topProducts,
      // "Últimos pagamentos" só lista quem realmente pagou. Antes entrava
      // pedido pendente com valor verde de "+R$", contradizendo a página de
      // pedidos (que mostrava o mesmo pedido como "Aguardando pagamento").
      recentOrders: paid
        .sort((a, b) => (b.paidAt ?? b.createdAt) - (a.paidAt ?? a.createdAt))
        .slice(0, 8)
        .map((o) => ({
          _id: o._id,
          number: o.number,
          customerName: o.customerName,
          customerEmail: o.customerEmail,
          totalCents: o.totalCents,
          paymentStatus: o.paymentStatus,
          createdAt: o.createdAt,
        })),
    };
  },
});
