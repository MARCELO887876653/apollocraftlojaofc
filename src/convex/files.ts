import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin";

// ─────────────────────────────────────────────────────────────
// Upload de imagens (logo, favicon, produtos, banners, OG…)
// Fluxo: generateUploadUrl → POST do arquivo → finalizeUpload
// ─────────────────────────────────────────────────────────────

/** Gera uma URL de upload direto para o storage (somente equipe admin). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Confirma o upload e devolve a URL pública da imagem. */
export const finalizeUpload = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireAdmin(ctx);
    const meta = await ctx.db.system.get(storageId);
    if (!meta) throw new Error("Upload não encontrado");
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Não foi possível obter a URL da imagem");
    return { url, storageId };
  },
});
