import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Auditoria — todas as ações da equipe
// ─────────────────────────────────────────────────────────────

export const listAudit = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { search, limit }) => {
    await requireAdmin(ctx, "logs.view");
    const max = limit ?? 200;
    // Índice por data (mais recente → mais antigo): não precisa carregar a
    // tabela inteira de auditoria, que só cresce.
    const recent = ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc");
    if (!search) {
      return await recent.take(max);
    }
    // Com busca, percorre do mais recente para o mais antigo e para assim que
    // junta os resultados pedidos.
    const s = search.toLowerCase();
    const found = [];
    for await (const l of recent) {
      if (
        l.action.toLowerCase().includes(s) ||
        l.userName.toLowerCase().includes(s) ||
        l.entity?.toLowerCase().includes(s)
      ) {
        found.push(l);
        if (found.length >= max) break;
      }
    }
    return found;
  },
});
