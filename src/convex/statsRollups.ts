import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { COUNTER_KEYS, readCounter, setCounter } from "./lib/counters";
import { bumpDaily, bumpProduct, dayKey } from "./lib/statsRollups";

// ─────────────────────────────────────────────────────────────
// Backfill dos rollups (rodar UMA vez, depois do deploy)
//
// Reconstrói `orderStatsDaily` / `orderStatsProducts` e os contadores a partir
// dos pedidos que já existiam. Escreve APENAS dados derivados: nenhum pedido,
// pagamento, cliente, entrega ou produto é alterado. Nada é apagado de
// negócio — o "restart" limpa só as tabelas de rollup, que são recalculáveis.
//
// Uso pela CLI (não publica nada, não altera dados existentes):
//
//   npx convex run statsRollups:backfill '{"restart": true}'
//   npx convex run statsRollups:backfill '{"cursor": "<nextCursor>"}'  // se houver mais lotes
//
// Enquanto não termina (`stats:rollups` != 1), `stats.dashboard` continua no
// caminho antigo (varredura), então o painel nunca mostra número parcial.
//
// Concorrência: o backfill só olha pedidos criados ANTES do `restart`
// (`.lt("createdAt", startMs)`) e os hooks incrementais contam os criados
// depois dele — inclusive o mesmo milissegundo do restart, que fica de fora do
// `.lt`. Assim nenhum pedido entra duas vezes e nenhum fica sem ser contado.
// ─────────────────────────────────────────────────────────────

const MAX_DOCS_PER_RUN = 500;

export const backfill = internalMutation({
  args: {
    restart: v.optional(v.boolean()),
    // Cursor OPACO da paginação do Convex (não um timestamp): dois pedidos
    // criados no mesmo milissegundo não são pulados na virada de lote.
    cursor: v.optional(v.union(v.string(), v.null())),
    batch: v.optional(v.number()),
    // Desligue em bases muito grandes (o snapshot lê os pedidos uma vez para
    // semear os contadores; os hooks cuidam do resto a partir daí).
    snapshotCounters: v.optional(v.boolean()),
  },
  handler: async (ctx, { restart, cursor, batch, snapshotCounters }) => {
    const size = Math.max(1, Math.min(batch ?? 100, 200));

    let startMs = await readCounter(ctx, COUNTER_KEYS.statsRollupStart);

    if (restart) {
      // 1) limpa SOMENTE rollups (dados derivados, recalculáveis)
      for (const table of ["orderStatsDaily", "orderStatsProducts"] as const) {
        for (let round = 0; round < 10; round++) {
          const rows = await ctx.db.query(table).take(MAX_DOCS_PER_RUN);
          for (const row of rows) await ctx.db.delete(row._id);
          if (rows.length < MAX_DOCS_PER_RUN) break;
        }
      }
      await setCounter(ctx, COUNTER_KEYS.statsRollups, 0);

      startMs = Date.now();
      await setCounter(ctx, COUNTER_KEYS.statsRollupStart, startMs);
      cursor = null;

      // 2) semeia os contadores com a verdade atual (uma transação só, então
      //    é consistente: hooks posteriores somam deltas em cima disto).
      if (snapshotCounters !== false) {
        const all = await ctx.db.query("orders").collect();
        const paid = all.filter((o) => o.paymentStatus === "paid");
        const pending = all.filter((o) => o.paymentStatus === "pending");
        const customers = await ctx.db.query("customers").collect();
        await setCounter(ctx, COUNTER_KEYS.ordersTotal, all.length);
        await setCounter(ctx, COUNTER_KEYS.ordersPaid, paid.length);
        await setCounter(ctx, COUNTER_KEYS.ordersPending, pending.length);
        await setCounter(
          ctx,
          COUNTER_KEYS.revenuePaidCents,
          paid.reduce((s, o) => s + o.totalCents, 0),
        );
        await setCounter(ctx, COUNTER_KEYS.customersTotal, customers.length);
      }
    }

    if (startMs === null) {
      throw new ConvexError(
        'Backfill não iniciado. Rode primeiro com restart: true — ex.: npx convex run statsRollups:backfill \'{"restart": true}\'',
      );
    }

    // Só pedidos anteriores ao início do backfill (os novos são dos hooks).
    // UMA paginação por execução (limite do Convex), com cursor opaco.
    const result = await ctx.db
      .query("orders")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", startMs!))
      .paginate({ cursor: cursor ?? null, numItems: size });
    const orders = result.page;

    // Agrega em memória para escrever 1x por dia/produto neste lote.
    const days = new Map<
      string,
      { ordersCreated: number; paidOrders: number; paidRevenueCents: number }
    >();
    const products = new Map<
      string,
      { productId: any; name: string; quantity: number; totalCents: number }
    >();

    for (const order of orders) {
      const created = dayKey(order.createdAt);
      const d = days.get(created) ?? { ordersCreated: 0, paidOrders: 0, paidRevenueCents: 0 };
      d.ordersCreated += 1;
      days.set(created, d);

      if (order.paymentStatus !== "paid") continue;
      const paidDay = dayKey(order.paidAt ?? order.createdAt);
      const p = days.get(paidDay) ?? { ordersCreated: 0, paidOrders: 0, paidRevenueCents: 0 };
      p.paidOrders += 1;
      p.paidRevenueCents += order.totalCents;
      days.set(paidDay, p);

      for (const item of order.items) {
        const key = String(item.productId);
        const prod = products.get(key) ?? {
          productId: item.productId,
          name: item.name,
          quantity: 0,
          totalCents: 0,
        };
        prod.quantity += item.quantity;
        prod.totalCents += item.totalCents;
        prod.name = item.name || prod.name;
        products.set(key, prod);
      }
    }

    for (const [day, delta] of days) await bumpDaily(ctx, day, delta);
    for (const prod of products.values()) await bumpProduct(ctx, prod, 1);

    const done = result.isDone || orders.length === 0;
    if (done) await setCounter(ctx, COUNTER_KEYS.statsRollups, 1);

    return {
      scanned: orders.length,
      days: days.size,
      products: products.size,
      done,
      nextCursor: done ? null : result.continueCursor,
    };
  },
});

/** Estado atual do backfill (leitura, sem alterar nada). */
export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const ready = await readCounter(ctx, COUNTER_KEYS.statsRollups);
    const start = await readCounter(ctx, COUNTER_KEYS.statsRollupStart);
    const dailyDays = (await ctx.db.query("orderStatsDaily").take(1000)).length;
    return {
      ready: ready === 1,
      startedAt: start ?? null,
      dailyDays,
    };
  },
});
