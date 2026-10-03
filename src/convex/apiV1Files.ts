import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

// ─────────────────────────────────────────────────────────────
// Imagens via API v1: reutiliza o MESMO storage do Convex usado pelo
// painel (files.ts). Fluxo para addons:
//   1) POST /api/v1/files/upload-url     → devolve upload_url
//   2) addon faz POST do binário nessa URL → recebe { storageId }
//   3) POST /api/v1/files/finalize { storage_id } → devolve { url }
//   4) usa essa url em product.image / category.image
// ─────────────────────────────────────────────────────────────

export const internalGenerateUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const internalFinalizeUpload = internalMutation({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    let url: string | null = null;
    try {
      url = await ctx.storage.getUrl(storageId as any);
    } catch {
      url = null;
    }
    if (!url) {
      throw new ConvexError({
        status: 422,
        code: "INVALID_STORAGE_ID",
        message: "storage_id inválido ou ainda não enviado.",
      });
    }
    return { url, storage_id: storageId };
  },
});
