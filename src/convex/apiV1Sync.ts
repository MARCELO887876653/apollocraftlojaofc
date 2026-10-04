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

    const cats = (await ctx.db.query("categories").collect()).filter((c) =>
      canAccess(c as any, key),
    );
    const prods = (await ctx.db.query("products").collect()).filter((p) =>
      canAccess(p as any, key),
    );

    const changedCategories = cats
      .filter((c) => !c.archivedAt && c.updatedAt > from)
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const changedProducts = prods
      .filter((p) => !p.archivedAt && p.updatedAt > from)
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const archivedCategories = cats
      .filter((c) => c.archivedAt && c.archivedAt > from)
      .sort((a, b) => (a.archivedAt ?? 0) - (b.archivedAt ?? 0));
    const archivedProducts = prods
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
    const hasMore = items.length > page.length;

    return {
      changes: page.map((i) => ({ kind: i.kind, ...i.data })),
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  },
});
