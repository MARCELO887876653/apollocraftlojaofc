import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// ─────────────────────────────────────────────────────────────
// Perfil do cliente (área "Minha Conta")
// ─────────────────────────────────────────────────────────────

/** Atualiza o nome de exibição do usuário logado. */
export const updateProfile = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("UNAUTHENTICATED");
    }
    const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!trimmed) {
      throw new Error("Informe um nome válido.");
    }
    await ctx.db.patch(userId, { name: trimmed });
    return { name: trimmed };
  },
});
