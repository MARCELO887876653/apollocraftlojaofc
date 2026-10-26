import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { canAccess } from "./apiV1Catalog";

// ─────────────────────────────────────────────────────────────
// Sincronização incremental (addon → GET /api/v1/sync/changes?cursor=...).
//
// Em vez de baixar o catálogo inteiro a cada poll, o addon guarda o
// `next_cursor` e pede apenas o que mudou desde então (produtos, categorias
// e recursos arquivados/tombstones). Escopo respeitado por server_id/addon_id.
//
// O cursor é o maior `updatedAt` já visto (string numérica).
// ─────────────────────────────────────────────────────────────

function optStr(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function compactCategory(c: any) {
  return {
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    position: c.order,
    enabled: c.active,
    external_id: c.externalId ?? null,
    revision: c.revision ?? 1,
    updated_at: new Date(c.updatedAt).toISOString(),
  };
}

function compactProduct(p: any) {
  const actions: any[] = Array.isArray(p.deliveryV1?.actions) ? p.deliveryV1.actions : [];
  const local = actions.find((a) => a.mode === "LOCAL_REFERENCE") ?? null;
  return {
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    price_cents: p.priceCents,
    category_id: p.categoryId ?? null,
    enabled: p.active,
    status: p.status ?? (p.active ? "PUBLISHED" : "DRAFT"),
    external_id: p.externalId ?? null,
    revision: p.revision ?? 1,
    delivery_mode: local ? "LOCAL_REFERENCE" : actions.length ? "SERVER" : "NONE",
    reference_id: local?.referenceId ?? null,
    reference_revision: local?.referenceRevision ?? null,
    updated_at: new Date(p.updatedAt).toISOString(),
  };
}

export const internalSyncChanges = internalQuery({
  args: {
    serverId: v.string(),
    addonId: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, { serverId, addonId, cursor, limit }) => {
    const since = cursor ? Number(cursor) : 0;
    const from = Number.isFinite(since) ? since : 0;
    const cap = Math.max(1, Math.min(limit, 200));
    const key = { serverId: serverId || "GLOBAL", addonId };

    // Lê APENAS o que mudou desde o cursor, pelo índice `by_updatedAt`.
    //
    // Por que: o addon chama esta rota a cada ~2 minutos (medido no deployment:
    // 1.459 chamadas em 56 horas) e a versão anterior varria produtos e
    // categorias INTEIROS em cada chamada — ~41 KB de leitura por poll, ~25 MB
    // por dia, mesmo quando nada tinha mudado. Como normalmente nada mudou, a
    // faixa do índice vem vazia e o custo vira ~zero.
    //
    // Arquivar, editar e criar sempre gravam `updatedAt` (e o arquivamento grava
    // `archivedAt = updatedAt`), então a faixa cobre também os tombstones.
    const window = Math.min(cap * 2 + 25, 500);
    const [cats, prods] = await Promise.all([
      ctx.db
        .query("categories")
        .withIndex("by_updatedAt", (q) => q.gt("updatedAt", from))
        .take(window),
      ctx.db
        .query("products")
        .withIndex("by_updatedAt", (q) => q.gt("updatedAt", from))
        .take(window),
    ]);

    const changedCategories = cats
      .filter((c) => canAccess(c as any, key))
      .filter((c) => !c.archivedAt)
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const changedProducts = prods
      .filter((p) => canAccess(p as any, key))
      .filter((p) => !p.archivedAt)
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const archivedCategories = cats
      .filter((c) => canAccess(c as any, key))
      .filter((c) => c.archivedAt && c.archivedAt > from)
      .sort((a, b) => (a.archivedAt ?? 0) - (b.archivedAt ?? 0));
    const archivedProducts = prods
      .filter((p) => canAccess(p as any, key))
      .filter((p) => p.archivedAt && p.archivedAt > from)
      .sort((a, b) => (a.archivedAt ?? 0) - (b.archivedAt ?? 0));

    // Combina e limita pelo cursor (menor timestamp primeiro).
    type Item = { ts: number; kind: string; data: any };
    const items: Item[] = [
      ...changedCategories.map((c) => ({ ts: c.updatedAt, kind: "CATEGORY_UPDATED", data: compactCategory(c) })),
      ...changedProducts.map((p) => ({ ts: p.updatedAt, kind: "PRODUCT_UPDATED", data: compactProduct(p) })),
      ...archivedCategories.map((c) => ({
        ts: c.archivedAt ?? c.updatedAt,
        kind: "CATEGORY_ARCHIVED",
        data: { id: String(c._id), external_id: c.externalId ?? null, updated_at: new Date(c.archivedAt ?? c.updatedAt).toISOString() },
      })),
      ...archivedProducts.map((p) => ({
        ts: p.archivedAt ?? p.updatedAt,
        kind: "PRODUCT_ARCHIVED",
        data: { id: String(p._id), external_id: p.externalId ?? null, updated_at: new Date(p.archivedAt ?? p.updatedAt).toISOString() },
      })),
    ].sort((a, b) => a.ts - b.ts);

    const page = items.slice(0, cap);
    const nextCursor = page.length ? String(page[page.length - 1].ts) : String(from);
    // Há mais mudanças quando a página encheu ou quando alguma das leituras
    // bateu no teto da janela (aí existe item que não foi buscado). Página
    // vazia nunca marca `has_more`: sem item não há cursor novo para avançar e
    // o addon ficaria repetindo a mesma consulta.
    const hasMore =
      page.length > 0 && (items.length > page.length || cats.length === window || prods.length === window);

    return {
      changes: page.map((i) => ({ kind: i.kind, ...i.data })),
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  },
});
