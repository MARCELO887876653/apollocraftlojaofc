import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { scheduleWebhookEvent } from "./webhookDispatch";

// ─────────────────────────────────────────────────────────────
// Status de entrega do PEDIDO a partir da fila real (deliveryCommands).
//
// Antes: só as entregas "legadas" (tabela `deliveries`) fechavam o pedido. As
// entregas automáticas via API v1 (GIVE_KIT/GIVE_ITEM) ficavam DONE na fila e
// o pedido continuava "pendente" para sempre. Agora o status é derivado de
// TODOS os comandos do pedido: entregue somente quando cada parte de cada
// unidade foi confirmada (DONE).
//
// Regras:
//  - pedido já entregue manualmente continua entregue (reenvio de brinde não
//    "desentrega" o pedido);
//  - comando CANCELED não conta como entregue;
//  - falha definitiva (não retentável ou aguardando ação manual) marca o
//    pedido como "failed" — mas só quando nada mais está pendente;
//  - reversões (`:reverse` / `:refund`) não entram na conta.
// ─────────────────────────────────────────────────────────────

export function isReversalCommand(command: any): boolean {
  const key = String(command?.idempotencyKey ?? "");
  return /:(reverse|refund)$/.test(key);
}

export type OrderDeliveryState = "pending" | "processing" | "delivered" | "failed";

/** Calcula o estado sem gravar (usado também pela auditoria). */
export function computeOrderDeliveryState(
  commands: any[],
  legacyDeliveries: any[],
): OrderDeliveryState | null {
  const forward = commands.filter((c) => !isReversalCommand(c));
  if (forward.length === 0 && legacyDeliveries.length === 0) return null;
  const legacyDone = legacyDeliveries.every((d) => d.status === "delivered");

  // Agrupa por item + ação + unidade + shulker: um reenvio cria outra
  // tentativa para a MESMA unidade/parte, e a antiga pode ter sido cancelada.
  // O grupo está entregue se qualquer tentativa dele foi confirmada (evita
  // falso "parcial" após correção de nick/reenvio). Uma shulker é uma unidade
  // de confirmação independente.
  const unitOf = (c: any) =>
    c.unitIndex ??
    (Number((String(c.idempotencyKey).match(/:u(\d+)/) ?? [])[1] ?? 1) - 1);
  const groups = new Map<string, any[]>();
  for (const c of forward) {
    const key = `${c.orderItemIndex ?? 0}:${c.actionId ?? c.action}:${unitOf(c)}:${c.partIndex ?? 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const groupRows = [...groups.values()];
  const allDone = groupRows.every((rows) => rows.some((c) => c.status === "DONE"));
  const permanentFailure = groupRows.some(
    (rows) =>
      !rows.some((c) => c.status === "DONE") &&
      rows.some(
        (c) => c.status === "FAILED" && (c.retryable !== true || c.requiresManualIntervention),
      ),
  );
  const anyActive = groupRows.some((rows) =>
    rows.some(
      (c) =>
        (c.status === "PENDING" || c.status === "PROCESSING" || c.retryable === true) &&
        !rows.some((r) => r.status === "DONE"),
    ),
  );

  if (legacyDone && allDone && (forward.length > 0 || legacyDeliveries.length > 0)) {
    return "delivered";
  }
  if (!anyActive && (permanentFailure || (!legacyDone && legacyDeliveries.length > 0))) {
    return "failed";
  }
  if (forward.some((c) => c.status === "PROCESSING")) return "processing";
  return "pending";
}

export async function syncOrderDeliveryStatus(
  ctx: MutationCtx,
  orderId: Id<"orders">,
): Promise<OrderDeliveryState | null> {
  const order: any = await ctx.db.get(orderId);
  if (!order) return null;
  // Nunca rebaixa um pedido já entregue (reenvio manual de uma unidade extra
  // não deve fazer a loja voltar a dizer "entrega pendente").
  if (order.deliveryStatus === "delivered") return "delivered";

  const commands: any[] = await ctx.db
    .query("deliveryCommands")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const legacy: any[] = await ctx.db
    .query("deliveries")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();

  const next = computeOrderDeliveryState(commands, legacy);
  if (!next || next === order.deliveryStatus) return next;

  // Kits publicados SEM a composição de shulkers (comandos antigos, todos sem
  // `partTotal`) não podem ser fechados automaticamente: o addon confirmou
  // apenas uma shulker e pode faltar conteúdo. Ficam pendentes na auditoria
  // até o kit ser publicado com `parts` e a recuperação rodar.
  if (next === "delivered") {
    const forward = commands.filter((c) => !isReversalCommand(c));
    const hasKit = forward.some((c) => c.action === "GIVE_KIT");
    const allWithoutParts = forward.every((c) => c.partTotal == null);
    if (hasKit && allWithoutParts) return order.deliveryStatus;
  }

  const now = Date.now();
  const notes: Record<OrderDeliveryState, string> = {
    delivered: "Entrega automática concluída — todas as partes confirmadas pelo servidor",
    failed: "Entrega automática falhou — precisa de ação no painel",
    pending: "Entrega automática aguardando o servidor",
    processing: "Entrega automática em processamento",
  };

  await ctx.db.patch(orderId, {
    deliveryStatus: next,
    updatedAt: now,
    // Histórico só para marcos relevantes (evita poluir com pending/processing).
    ...(next === "delivered" || next === "failed"
      ? { statusHistory: [...order.statusHistory, { status: next, at: now, note: notes[next] }] }
      : {}),
  });

  if (next === "delivered") {
    await scheduleWebhookEvent(ctx, "order.delivered", { orderNumber: order.number });
  }
  return next;
}
