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
    const all = await ctx.db.query("auditLogs").collect();
    let list = all.sort((a, b) => b.createdAt - a.createdAt);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.action.toLowerCase().includes(s) ||
          l.userName.toLowerCase().includes(s) ||
          l.entity?.toLowerCase().includes(s),
      );
    }
    return list.slice(0, limit ?? 200);
  },
});
