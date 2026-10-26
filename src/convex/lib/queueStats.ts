import type { MutationCtx, QueryCtx } from "../_generated/server";

// ─────────────────────────────────────────────────────────────
// Contadores por status da fila de entregas automáticas
//
// O painel de "Entregas automáticas" lia TODOS os comandos já criados só para
// mostrar 5 badges (pendentes, processando, concluídas, falhas, canceladas) e
// as abas. Aqui os cinco números ficam num único documento, ajustado na MESMA
// transação em que o status do comando muda — como o contador de produtos
// (lib/counters.ts).
//
// O documento é criado na primeira mudança de status, já contando o estado
// real da tabela (o ajuste é aplicado depois do patch, então a contagem real
// já inclui a mudança atual). Nada é apagado e nenhum comando é alterado.
// ─────────────────────────────────────────────────────────────

const KEY = "deliveryCommands";

export type CommandStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "CANCELED";

export type QueueCounts = {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  canceled: number;
};

const FIELD: Record<CommandStatus, keyof QueueCounts> = {
  PENDING: "pending",
  PROCESSING: "processing",
  DONE: "done",
  FAILED: "failed",
  CANCELED: "canceled",
};

async function countStatusReal(ctx: QueryCtx, status: CommandStatus): Promise<number> {
  const rows = await ctx.db
    .query("deliveryCommands")
    .withIndex("by_status_createdAt", (q) => q.eq("status", status))
    .collect();
  return rows.length;
}

/** Contagem real (5 varreduras) — usada só enquanto o documento não existe. */
export async function computeQueueCountsReal(ctx: QueryCtx): Promise<QueueCounts> {
  const [pending, processing, done, failed, canceled] = await Promise.all([
    countStatusReal(ctx, "PENDING"),
    countStatusReal(ctx, "PROCESSING"),
    countStatusReal(ctx, "DONE"),
    countStatusReal(ctx, "FAILED"),
    countStatusReal(ctx, "CANCELED"),
  ]);
  return { pending, processing, done, failed, canceled };
}

/** Contadores atuais; `null` quando o documento ainda não existe. */
export async function readQueueCounts(ctx: QueryCtx): Promise<QueueCounts | null> {
  const doc = await ctx.db
    .query("deliveryQueueStats")
    .withIndex("by_key", (q) => q.eq("key", KEY))
    .first();
  if (!doc) return null;
  return {
    pending: doc.pending,
    processing: doc.processing,
    done: doc.done,
    failed: doc.failed,
    canceled: doc.canceled,
  };
}

/**
 * Registra a mudança de status de um comando. Chame DEPOIS do `patch` no
 * documento — assim a inicialização (primeira vez) já enxerga o novo estado.
 * `from`/`to` iguais ou ausentes são ignorados.
 */
export async function moveQueueCount(
  ctx: MutationCtx,
  from: CommandStatus | undefined,
  to: CommandStatus | undefined,
): Promise<void> {
  if (from === to) return;
  const now = Date.now();
  const doc = await ctx.db
    .query("deliveryQueueStats")
    .withIndex("by_key", (q) => q.eq("key", KEY))
    .first();

  if (!doc) {
    // Primeira vez: conta a tabela real (5 varreduras, só uma vez na vida).
    const [pending, processing, done, failed, canceled] = await Promise.all([
      countStatusReal(ctx, "PENDING"),
      countStatusReal(ctx, "PROCESSING"),
      countStatusReal(ctx, "DONE"),
      countStatusReal(ctx, "FAILED"),
      countStatusReal(ctx, "CANCELED"),
    ]);
    await ctx.db.insert("deliveryQueueStats", {
      key: KEY,
      pending,
      processing,
      done,
      failed,
      canceled,
      updatedAt: now,
    });
    return;
  }

  const patch: any = { updatedAt: now };
  const bump = (status: CommandStatus, delta: number) => {
    const field = FIELD[status];
    patch[field] = Math.max(0, (doc as any)[field] + delta);
  };
  if (from) bump(from, -1);
  if (to) bump(to, 1);
  await ctx.db.patch(doc._id, patch);
}
