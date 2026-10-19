import { query, mutation, internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { requireAdmin, logAudit } from "./lib/admin";
import { getSetting, setSetting } from "./lib/data";
import { paidOrderTotals } from "./lib/customerTotals";

// ─── Admin ───

export const adminList = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requireAdmin(ctx, "customers.view");
    const all = await ctx.db.query("customers").collect();
    const list = all.sort((a, b) => b.totalSpentCents - a.totalSpentCents);
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(
      (c) =>
        c.email.toLowerCase().includes(s) ||
        c.name?.toLowerCase().includes(s) ||
        c.minecraftNick?.toLowerCase().includes(s) ||
        c.discord?.toLowerCase().includes(s),
    );
  },
});

export const adminGet = query({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "customers.view");
    const customer = await ctx.db.get(id);
    if (!customer) return null;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("customerEmail", customer.email))
      .collect();
    orders.sort((a, b) => b.createdAt - a.createdAt);
    return { customer, orders };
  },
});

// ─── Público: Top 3 compradores (ranking da home) ───

export const topBuyers = query({
  args: {},
  handler: async (ctx) => {
    // Índice por total gasto (maior → menor): não precisa varrer todos os
    // clientes para montar um Top 3.
    const top = await ctx.db
      .query("customers")
      .withIndex("by_spent")
      .order("desc")
      .take(25);
    return top
      .filter((c) => c.ordersCount > 0 && c.totalSpentCents > 0)
      .sort((a, b) => b.totalSpentCents - a.totalSpentCents)
      .slice(0, 3)
      .map((c) => ({
        _id: c._id,
        name: c.name || c.minecraftNick || c.email.split("@")[0],
        totalSpentCents: c.totalSpentCents,
      }));
  },
});

// ─── Recálculo do acumulado de compras ───
//
// O acúmulo antigo contava pedido CRIADO (sempre "pending"), então cliente que
// gerou PIX e não pagou aparecia com "total gasto" de compra que a loja nunca
// recebeu — o Top 3 da home mostrava R$ 83,91 numa loja que faturou R$ 60,95.
// Estes três pedaços consertam os números já gravados, uma única vez, em lotes
// (a loja pode ter muitos clientes/pedidos).

const REPAIR_SETTING = "customerTotalsRepair";
const REPAIR_BATCH = 200;

type RepairState = {
  startedAt: number;
  repaired: number;
  cursor?: number;
  doneAt?: number;
};

/** Liga o recálculo uma única vez (quem chamar depois só recebe o estado). */
async function startRepair(
  ctx: MutationCtx,
): Promise<{ started: boolean; running: boolean }> {
  const state = await getSetting<RepairState>(ctx, REPAIR_SETTING);
  if (state) return { started: false, running: !state.doneAt };
  await setSetting(ctx, REPAIR_SETTING, { startedAt: Date.now(), repaired: 0 } satisfies RepairState);
  await ctx.scheduler.runAfter(0, internal.customers.repairTotalsBatch, {});
  return { started: true, running: true };
}

/**
 * Reprocessa um lote de clientes (do maior gasto para o menor) e reagenda o
 * próximo até a base acabar. O cursor é o MENOR totalSpentCents já visitado:
 * como o recálculo só diminui valores, a varredura sempre avança e termina.
 */
export const repairTotalsBatch = internalMutation({
  args: { cursor: v.optional(v.number()) },
  handler: async (ctx, { cursor }) => {
    const state = await getSetting<RepairState>(ctx, REPAIR_SETTING);
    if (state?.doneAt) return { done: true as const, repaired: state.repaired };

    const batch = await ctx.db
      .query("customers")
      .withIndex("by_spent", (q) =>
        cursor === undefined ? q : q.lt("totalSpentCents", cursor),
      )
      .order("desc")
      .take(REPAIR_BATCH);

    let repaired = 0;
    let lastSpent = cursor ?? Number.POSITIVE_INFINITY;
    for (const customer of batch) {
      lastSpent = Math.min(lastSpent, customer.totalSpentCents);
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_email", (q) => q.eq("customerEmail", customer.email))
        .collect();
      const totals = paidOrderTotals(orders);
      if (
        totals.ordersCount === customer.ordersCount &&
        totals.totalSpentCents === customer.totalSpentCents
      ) {
        continue;
      }
      await ctx.db.patch(customer._id, totals);
      repaired++;
    }

    const totalRepaired = (state?.repaired ?? 0) + repaired;
    const done = batch.length < REPAIR_BATCH;
    await setSetting(ctx, REPAIR_SETTING, {
      startedAt: state?.startedAt ?? Date.now(),
      repaired: totalRepaired,
      ...(done ? { doneAt: Date.now() } : { cursor: lastSpent }),
    });
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.customers.repairTotalsBatch, { cursor: lastSpent });
    }
    return { done, repaired: totalRepaired };
  },
});

/** Estado do recálculo — a tela de clientes usa para não mentir no botão. */
export const repairTotalsStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "customers.view");
    const state = await getSetting<RepairState>(ctx, REPAIR_SETTING);
    return {
      running: Boolean(state && !state.doneAt),
      done: Boolean(state?.doneAt),
      repaired: state?.repaired ?? 0,
    };
  },
});

/** Dispara o recálculo pelo painel (roda em segundo plano, em lotes). */
export const repairTotals = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx, "customers.view");
    const result = await startRepair(ctx);
    if (result.started) {
      await logAudit(ctx, admin, "customers.repair_totals", "customers", "all");
    }
    return result;
  },
});

/** Mesma correção, disparada pelo cron quando ninguém abriu o painel. */
export const repairTotalsStart = internalMutation({
  args: {},
  handler: async (ctx) => await startRepair(ctx),
});

// ─── Conta do cliente (autenticado) ───

export const myOrders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("customerEmail", user.email!))
      .collect();
    orders.sort((a, b) => b.createdAt - a.createdAt);
    return orders;
  },
});
