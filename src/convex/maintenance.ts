import {
  query, mutation, internalMutation, internalQuery,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAdmin } from "./lib/admin";
import { checkRateLimit } from "./lib/data";

// ─────────────────────────────────────────────────────────────
// Modo manutenção — fila de avisos de retorno da loja
//
// O cliente deixa o e-mail na tela de manutenção e fica registrado para
// receber o aviso quando a loja voltar. O envio é disparado pelo admin ao
// desligar a manutenção (ver `settings.updateStore`).
// ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cadastra (ou reativa) um e-mail para receber o aviso de retorno da loja. */
export const subscribe = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const clean = email.trim().toLowerCase();
    if (!clean || clean.length > 160 || !EMAIL_RE.test(clean)) {
      throw new ConvexError("Informe um e-mail válido para ser avisado.");
    }
    const allowed = await checkRateLimit(ctx, `maintenance:${clean}`, 8, 60 * 60 * 1000);
    if (!allowed) {
      throw new ConvexError("Muitas tentativas. Tente novamente em alguns minutos.");
    }

    const existing = await ctx.db
      .query("maintenanceSubscribers")
      .withIndex("by_email", (q) => q.eq("email", clean))
      .first();

    if (existing) {
      // Quem já havia sido avisado volta para a fila (novo ciclo de manutenção).
      if (existing.notifiedAt) await ctx.db.patch(existing._id, { notifiedAt: undefined });
      return { ok: true, already: true };
    }

    await ctx.db.insert("maintenanceSubscribers", { email: clean, createdAt: Date.now() });
    return { ok: true, already: false };
  },
});

/** Quantos e-mails estão na fila (painel admin). */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "settings.manage");
    const all = await ctx.db.query("maintenanceSubscribers").collect();
    return {
      total: all.length,
      pending: all.filter((s) => !s.notifiedAt).length,
      subscribers: all
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100)
        .map((s) => ({ email: s.email, createdAt: s.createdAt, notifiedAt: s.notifiedAt ?? null })),
    };
  },
});

/** Remove um e-mail da fila (painel admin). */
export const remove = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await requireAdmin(ctx, "settings.manage");
    const clean = email.trim().toLowerCase();
    const doc = await ctx.db
      .query("maintenanceSubscribers")
      .withIndex("by_email", (q) => q.eq("email", clean))
      .first();
    if (doc) await ctx.db.delete(doc._id);
    return { ok: true };
  },
});

/** Pendentes de aviso (uso interno do envio). */
export const pending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("maintenanceSubscribers").collect();
    return all
      .filter((s) => !s.notifiedAt)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => ({ id: s._id, email: s.email }));
  },
});

/** Marca como avisados (uso interno). */
export const markNotified = internalMutation({
  args: { ids: v.array(v.id("maintenanceSubscribers")) },
  handler: async (ctx, { ids }) => {
    const now = Date.now();
    for (const id of ids) await ctx.db.patch(id, { notifiedAt: now });
  },
});

/** Devolve todos à fila quando a manutenção é ativada de novo (uso interno). */
export const resetNotified = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("maintenanceSubscribers").collect();
    let reset = 0;
    for (const s of all) {
      if (s.notifiedAt) {
        await ctx.db.patch(s._id, { notifiedAt: undefined });
        reset++;
      }
    }
    return { reset };
  },
});
