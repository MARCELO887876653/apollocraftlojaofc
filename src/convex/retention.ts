import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Política de retenção dos logs operacionais
//
// IMPORTANTE: NADA é apagado automaticamente. Não existe cron aqui. A remoção
// só acontece se o dono da loja rodar `retention.purge` (painel) ou
// `retention.purgeFromCli` (CLI) com `confirm: true`, sempre em lotes pequenos.
//
// Requisitos considerados antes de propor qualquer prazo:
//  • Auditoria: `auditLogs` (quem fez o quê no painel) NÃO entra nesta
//    política — é trilha de responsabilidade e não deve ser encurtada.
//  • Suporte: `deliveryEvents` é o "log completo" que o operador lê ao abrir
//    uma entrega (claim, reenvio, falha). É o registro usado para responder
//    "por que o item não chegou?". Prazo maior que os outros.
//  • Segurança: `apiLogs` guarda chave/servidor/endpoint/erro. Serve para
//    investigar abuso e chave vazada. Depois de alguns meses o valor cai, mas
//    erros recentes precisam existir.
//  • Recuperação: nada aqui é dado de negócio (pedido, pagamento, cliente,
//    produto). Apagar log antigo nunca altera pedido, saldo ou entrega.
//  • Entregas vivas: `deliveryEvents`/`deliveryAttempts` de uma entrega que
//    ainda está PENDING/PROCESSING nunca são removidos, mesmo que antigos —
//    senão o painel perderia a linha do tempo de algo que ainda vai acontecer.
// ─────────────────────────────────────────────────────────────

export const RETENTION_POLICY = {
  apiLogs: {
    days: 90,
    why: "Chamadas da API (sucesso amostrado + erros). Serve para investigar abuso/chave vazada no trimestre.",
  },
  deliveryEvents: {
    days: 180,
    why: "Linha do tempo das entregas usada no suporte. Meio ano cobre contestação e reembolso.",
  },
  deliveryAttempts: {
    days: 90,
    why: "Histórico técnico de tentativas (lease/erro). Redundante com deliveryEvents depois de 90 dias.",
  },
} as const;

/** Menor prazo aceito: evita apagar o log de ontem por engano. */
const MIN_DAYS = 30;
/** Teto por execução: mantém cada mutation longe dos limites de transação. */
const MAX_DOCS_PER_RUN = 1000;
const PREVIEW_LIMIT = 200;

const retentionTable = v.union(
  v.literal("apiLogs"),
  v.literal("deliveryEvents"),
  v.literal("deliveryAttempts"),
);

function cutoffFor(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

/**
 * Prévia (somente leitura): quantos registros existem além do prazo.
 * A varredura é limitada — mostra "200+" em vez de ler a tabela inteira.
 */
async function previewCore(ctx: any) {
  const out: {
    table: keyof typeof RETENTION_POLICY;
    days: number;
    cutoff: number;
    candidates: number;
    truncated: boolean;
    why: string;
  }[] = [];
  for (const [table, policy] of Object.entries(RETENTION_POLICY)) {
    const cutoff = cutoffFor(policy.days);
    const docs = await ctx.db
      .query(table)
      .withIndex("by_createdAt", (q: any) => q.lt("createdAt", cutoff))
      .take(PREVIEW_LIMIT + 1);
    out.push({
      table: table as keyof typeof RETENTION_POLICY,
      days: policy.days,
      cutoff,
      candidates: Math.min(docs.length, PREVIEW_LIMIT),
      truncated: docs.length > PREVIEW_LIMIT,
      why: policy.why,
    });
  }
  return { policy: RETENTION_POLICY, tables: out, deletesAutomatically: false };
}

/**
 * Remove um lote de registros além do prazo. Só roda com `confirm: true`.
 * Retorna `hasMore` para o operador decidir se repete.
 */
async function purgeCore(
  ctx: any,
  args: { table: string; olderThanDays: number; maxDocs?: number; confirm: boolean },
  admin: any | null,
) {
  if (!args.confirm) {
    throw new ConvexError(
      "Nada foi apagado. Reenvie com confirm: true para remover os registros além do prazo.",
    );
  }
  const days = Math.floor(args.olderThanDays);
  if (!Number.isFinite(days) || days < MIN_DAYS) {
    throw new ConvexError(
      `O prazo mínimo é ${MIN_DAYS} dias. Use um valor maior para não perder log recente.`,
    );
  }
  const cap = Math.max(1, Math.min(Math.floor(args.maxDocs ?? 200), MAX_DOCS_PER_RUN));
  const cutoff = cutoffFor(days);

  const docs = await ctx.db
    .query(args.table)
    .withIndex("by_createdAt", (q: any) => q.lt("createdAt", cutoff))
    .take(cap);

  let deleted = 0;
  let skippedLive = 0;
  for (const doc of docs as any[]) {
    // Nunca remove o log de uma entrega ainda em andamento.
    if (args.table !== "apiLogs" && doc.deliveryId) {
      const command: any = await ctx.db.get(doc.deliveryId);
      if (command && (command.status === "PENDING" || command.status === "PROCESSING")) {
        skippedLive++;
        continue;
      }
    }
    await ctx.db.delete(doc._id);
    deleted++;
  }

  await logAudit(ctx, admin, "retention.purge", args.table, undefined, {
    olderThanDays: days,
    cutoff,
    deleted,
    skippedLive,
  });
  return { deleted, skippedLive, hasMore: docs.length === cap, cutoff };
}

const purgeArgs = {
  table: retentionTable,
  olderThanDays: v.number(),
  maxDocs: v.optional(v.number()),
  confirm: v.boolean(),
};

/** Prévia pelo painel (admin autenticado). */
export const preview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "settings.manage");
    return await previewCore(ctx);
  },
});

/** Purge pelo painel: exige admin + confirmação explícita. */
export const purge = mutation({
  args: purgeArgs,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, "settings.manage");
    return await purgeCore(ctx, args, admin);
  },
});

/**
 * Variantes para a CLI (`bun convex run`), que não tem sessão de admin.
 * Continuam exigindo `confirm: true`; quem tem acesso à CLI já tem controle
 * total do deployment. A auditoria registra "sistema".
 */
export const previewFromCli = internalQuery({
  args: {},
  handler: async (ctx) => await previewCore(ctx),
});

export const purgeFromCli = internalMutation({
  args: purgeArgs,
  handler: async (ctx, args) => await purgeCore(ctx, args, null),
});
