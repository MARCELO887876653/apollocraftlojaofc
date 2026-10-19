import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────
// Acumulado PAGO do cliente (`customers.ordersCount` / `totalSpentCents`)
//
// O que estava errado: o checkout somava o valor do pedido no cliente no
// momento da CRIAÇÃO — e todo pedido nasce "pending". Pedido abandonado (ou
// PIX gerado e não pago) entrava para sempre no acumulado do cliente: home e
// painel chegaram a mostrar um "Top 3 compradores" de R$ 83,91 numa loja que
// só tinha faturado R$ 60,95. A correção é somar apenas quando o pagamento é
// confirmado, e estornar no reembolso — a MESMA régua da dashboard e da página
// de pedidos (`paymentStatus === "paid"`).
// ─────────────────────────────────────────────────────────────

/** Totais de compra considerando só pedidos realmente pagos. */
export function paidOrderTotals(
  orders: Array<{ paymentStatus: string; totalCents: number }>,
): { ordersCount: number; totalSpentCents: number } {
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  return {
    ordersCount: paid.length,
    totalSpentCents: paid.reduce((sum, o) => sum + o.totalCents, 0),
  };
}

/** Cliente dono do pedido: pelo vínculo direto ou, em pedidos antigos, pelo e-mail. */
async function findCustomerId(
  ctx: MutationCtx,
  order: { customerId?: Id<"customers"> | null; customerEmail: string },
): Promise<Id<"customers"> | null> {
  if (order.customerId) return order.customerId;
  const byEmail = await ctx.db
    .query("customers")
    .withIndex("by_email", (q) => q.eq("email", order.customerEmail))
    .first();
  return byEmail?._id ?? null;
}

/**
 * Aplica (`sign: 1`) ou desfaz (`sign: -1`) no acumulado do cliente o valor de
 * um pedido que passou a estar pago — ou deixou de estar (reembolso/cancelamento).
 *
 * Idempotência fica com quem chama: os dois caminhos de confirmação só chamam
 * na transição real de status (nunca em "já estava pago").
 */
export async function applyPaidOrderToCustomer(
  ctx: MutationCtx,
  order: Pick<Doc<"orders">, "customerId" | "customerEmail" | "totalCents">,
  sign: 1 | -1,
): Promise<void> {
  const customerId = await findCustomerId(ctx, order);
  if (!customerId) return;
  const customer = await ctx.db.get(customerId);
  if (!customer) return;
  await ctx.db.patch(customerId, {
    ordersCount: Math.max(0, customer.ordersCount + sign),
    totalSpentCents: Math.max(0, customer.totalSpentCents + sign * order.totalCents),
  });
}
