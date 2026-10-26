import type { MutationCtx, QueryCtx } from "../_generated/server";

// ─────────────────────────────────────────────────────────────
// Contadores denormalizados (leitura de 1 documento)
//
// Por que existem: o dashboard lia a tabela de produtos INTEIRA (com imagens,
// descrição e receita de entrega em cada documento) só para mostrar
// `productsTotal` — e isso a cada abertura/atualização da página. Um contador
// mantido na MESMA transação da escrita resolve com 1 leitura pequena.
//
// Consistência: o Convex executa mutations de forma serializável, então o
// ajuste do contador e o insert/delete do produto commitam juntos — não existe
// janela em que o número fique errado. Se o documento do contador não existir
// (primeira vez após o deploy), ele é inicializado pela contagem real, que já
// inclui a escrita em curso. Nada é apagado nem recalculado em produção.
// ─────────────────────────────────────────────────────────────

export const COUNTER_KEYS = {
  products: "products",
} as const;

export async function readCounter(ctx: QueryCtx, key: string): Promise<number | null> {
  const doc = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return doc ? doc.value : null;
}

/**
 * Ajusta um contador dentro da transação atual.
 *
 * `baseline` só roda quando o contador ainda não existe; deve devolver a
 * contagem real DEPOIS da escrita (o insert/delete já é visível na transação).
 */
export async function adjustCounter(
  ctx: MutationCtx,
  key: string,
  delta: number,
  baseline: () => Promise<number>,
): Promise<void> {
  const now = Date.now();
  const doc = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (doc) {
    await ctx.db.patch(doc._id, {
      value: Math.max(0, doc.value + delta),
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("counters", {
    key,
    value: Math.max(0, await baseline()),
    updatedAt: now,
  });
}

/** Contagem real de produtos (usada só para inicializar/consertar o contador). */
export async function countProductsReal(ctx: QueryCtx): Promise<number> {
  const all = await ctx.db.query("products").collect();
  return all.length;
}
