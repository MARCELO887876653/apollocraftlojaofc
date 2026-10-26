import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin";
import { COUNTER_KEYS, readCounter } from "./lib/counters";
import { DAY_MS, dayKey, readStatsCounters, rollupsReady, startOfDay } from "./lib/statsRollups";
import { legacyOrderStats, rollupOrderStats } from "./lib/statsDashboard";

// ─────────────────────────────────────────────────────────────
// Estatísticas do painel
//
// Dois caminhos:
//  • ROLLUPS (padrão depois do backfill): contadores + buckets diários do
//    período exibido (≤ ~62 documentos pequenos) + 5 produtos + ≤ 40 pedidos
//    recentes. Nada de varrer `orders`. Ver lib/statsRollups.ts.
//  • LEGADO (fallback): cálculo antigo, que lia `orders` e `customers`
//    inteiros. Continua aqui de propósito — é o que mantém o painel correto
//    antes do backfill e o que os testes usam como referência.
// ─────────────────────────────────────────────────────────────

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

    if (await rollupsReady(ctx)) {
      const counters = await readStatsCounters(ctx);
      if (counters) {
        return {
          revenueTotal: counters.revenuePaidCents,
          customersTotal: counters.customersTotal,
        };
      }
    }

    // Fallback (pré-backfill): mesma conta de antes.
    const orders = await ctx.db.query("orders").collect();
    const revenueTotal = orders
      .filter((o) => o.paymentStatus === "paid")
      .reduce((s, o) => s + o.totalCents, 0);
    const customers = await ctx.db.query("customers").collect();
    return { revenueTotal, customersTotal: customers.length };
  },
});

/** Blocos que nunca dependeram da varredura de pedidos. */
async function commonBlocks(ctx: any, now: number) {
  // ── Produtos: contador denormalizado (1 leitura) ──
  // Ajustado na mesma transação do insert/delete (lib/catalog.ts e
  // products.remove); a contagem real só acontece se o contador não existir.
  const productCounter = await readCounter(ctx, COUNTER_KEYS.products);
  const productsTotal = productCounter ?? (await ctx.db.query("products").collect()).length;

  // ── Entregas: só os status que o painel mostra ──
  // `collect()` lia TODO o histórico (a maioria já entregue). Pelo índice
  // `by_status_retry` lemos apenas pendentes/processando/falhas.
  const deliveriesWithStatus = (status: "pending" | "processing" | "failed") =>
    ctx.db
      .query("deliveries")
      .withIndex("by_status_retry", (q: any) => q.eq("status", status))
      .collect();
  const [deliveriesPendingRows, deliveriesProcessingRows, deliveriesFailedRows] = await Promise.all([
    deliveriesWithStatus("pending"),
    deliveriesWithStatus("processing"),
    deliveriesWithStatus("failed"),
  ]);

  // ── Visitas: 1 documento por dia (tabela pequena por natureza) ──
  const visits = await ctx.db.query("visits").collect();
  const nowD = new Date(now);
  const dow = (nowD.getDay() + 6) % 7; // 0 = segunda
  const weekStart = startOfDay(now) - dow * DAY_MS;
  const visitsWeek: { day: string; count: number }[] = [];
  let visitsThisWeek = 0;
  for (let i = 0; i < 7; i++) {
    const ts = weekStart + i * DAY_MS;
    const key = dayKey(ts);
    const count = visits
      .filter((v: any) => v.day === key)
      .reduce((s: number, v: any) => s + v.count, 0);
    visitsWeek.push({ day: WEEKDAYS[new Date(ts).getDay()], count });
    visitsThisWeek += count;
  }
  const visitsTotal = visits.reduce((s: number, v: any) => s + v.count, 0);

  return {
    productsTotal,
    deliveriesPending: deliveriesPendingRows.length + deliveriesProcessingRows.length,
    deliveriesFailed: deliveriesFailedRows.length,
    visitsWeek,
    visitsThisWeek,
    visitsTotal,
  };
}

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "orders.view");
    const now = Date.now();

    const complete = await rollupsReady(ctx);
    const orderStats = complete ? await rollupOrderStats(ctx, now) : null;
    const common = await commonBlocks(ctx, now);

    return {
      ...(orderStats ?? (await legacyOrderStats(ctx, now))),
      ...common,
    };
  },
});
