import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";

// ─────────────────────────────────────────────────────────────
// Dispatch de webhooks de saída com "porta fechada"
//
// Antes, TODA transição agendava `webhooksOut.sendEvent` — uma action (fora do
// runtime V8) + uma query — mesmo quando a loja não tinha nenhum webhook
// configurado. Era o caso da base real: 0 webhooks e uma action por evento de
// pedido/entrega, sempre terminando em `if (!hooks.length) return`.
//
// Aqui a checagem acontece na PRÓPRIA mutation, no índice `by_active`: sem
// webhook ativo inscrito no evento, nada é agendado e nenhuma action roda.
// Com webhook ativo, o agendamento é exatamente o de antes (0ms de delay), e o
// envio continua assinado/registrado do mesmo jeito.
// ─────────────────────────────────────────────────────────────

const MAX_HOOKS = 25;

/** true quando existe webhook ativo inscrito no evento (ou em "*"). */
export async function hasWebhookFor(ctx: MutationCtx, event: string): Promise<boolean> {
  const hooks = await ctx.db
    .query("webhooksOut")
    .withIndex("by_active", (q) => q.eq("active", true))
    .take(MAX_HOOKS);
  return hooks.some((hook) => hook.events?.includes(event) || hook.events?.includes("*"));
}

/**
 * Agenda o evento só se algum webhook ativo o escuta.
 * Devolve `true` quando o envio foi agendado.
 */
export async function scheduleWebhookEvent(
  ctx: MutationCtx,
  event: string,
  payload: any,
): Promise<boolean> {
  if (!(await hasWebhookFor(ctx, event))) return false;
  await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, { event, payload });
  return true;
}
