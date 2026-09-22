import { query } from "./_generated/server";
import { requireAdmin } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Estatísticas do painel
// ─────────────────────────────────────────────────────────────

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "orders.view");
    const orders = await ctx.db.query("orders").collect();
    const customers = await ctx.db.query("customers").collect();
    const products = await ctx.db.query("products").collect();
    const deliveries = await ctx.db.query("deliveries").collect();

    const paid = orders.filter((o) => o.paymentStatus === "paid");
    const pending = orders.filter((o) => o.paymentStatus === "pending");
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const revenueToday = paid
      .filter((o) => (o.paidAt ?? o.createdAt) >= now - dayMs)
      .reduce((s, o) => s + o.totalCents, 0);
    const revenue30 = paid
      .filter((o) => (o.paidAt ?? o.createdAt) >= now - 30 * dayMs)
      .reduce((s, o) => s + o.totalCents, 0);
    const revenueTotal = paid.reduce((s, o) => s + o.totalCents, 0);

    // série diária dos últimos 14 dias (receita + pedidos)
    const series: { day: string; revenue: number; orders: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const start = now - i * dayMs;
      const dayOrders = paid.filter(
        (o) => (o.paidAt ?? o.createdAt) >= start && (o.paidAt ?? o.createdAt) < start + dayMs,
      );
      series.push({
        day: new Date(start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        revenue: Math.round(dayOrders.reduce((s, o) => s + o.totalCents, 0)) / 100,
        orders: dayOrders.length,
      });
    }

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
      productsTotal: products.length,
      deliveriesPending: deliveries.filter((d) => d.status === "pending" || d.status === "processing").length,
      deliveriesFailed: deliveries.filter((d) => d.status === "failed").length,
      series,
      topProducts,
      recentOrders: orders
        .sort((a, b) => b.createdAt - a.createdAt)
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
