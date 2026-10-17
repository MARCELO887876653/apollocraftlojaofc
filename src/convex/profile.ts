import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { AVATAR_MAX_MB } from "./lib/discord";

// ─────────────────────────────────────────────────────────────
// Perfil do cliente (área "Minha Conta")
//
// Nome e foto. A foto vai para o storage do Convex (upload direto do
// navegador) e a URL pública fica em `users.image` — o mesmo campo que o
// Convex Auth preenche quando a pessoa entra pelo Discord. Guardamos também
// `avatarStorageId` para conseguir apagar a foto antiga ao trocar/remover.
// ─────────────────────────────────────────────────────────────

const MAX_AVATAR_BYTES = AVATAR_MAX_MB * 1024 * 1024;

async function deleteStoredFile(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined | null,
) {
  if (!storageId) return;
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Arquivo já removido: não impede a troca da foto.
  }
}

function normalizeAvatarUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://") || trimmed.length > 2048) {
    throw new Error("A foto precisa ser uma imagem enviada por você.");
  }
  return trimmed;
}

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    /** `null` (ou "") remove a foto atual. */
    image: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { name, image }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("UNAUTHENTICATED");
    }
    const patch: { name?: string; image?: string | undefined } = {};

    if (name !== undefined) {
      const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 60);
      if (!trimmed) {
        throw new Error("Informe um nome válido.");
      }
      patch.name = trimmed;
    }

    const previous = await ctx.db.get(userId);
    if (image !== undefined) {
      patch.image = image ? normalizeAvatarUrl(image) : undefined;
    }

    if (Object.keys(patch).length === 0) {
      throw new Error("Nada para salvar.");
    }

    // Ao remover a foto, apagamos também o arquivo e o registro do id.
    const clearingAvatar = image !== undefined && !patch.image;
    await ctx.db.patch(userId, clearingAvatar ? { ...patch, avatarStorageId: undefined } : patch);
    if (clearingAvatar) {
      await deleteStoredFile(ctx, previous?.avatarStorageId);
    }

    const user = await ctx.db.get(userId);
    return { name: user?.name ?? null, image: user?.image ?? null };
  },
});

/** URL de upload direto para o storage (qualquer cliente logado). */
export const avatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Entre na sua conta para enviar uma foto.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Confirma o upload e o define como foto do perfil.
 *
 * Devolve `{ ok: false, error }` em vez de lançar quando o arquivo não serve:
 * uma mutation que lança desfaz tudo o que ela gravou, e aí a exclusão do
 * arquivo recusado seria desfeita junto (ficaria lixo no storage para sempre).
 */
export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("UNAUTHENTICATED");
    }

    const meta = await ctx.db.system.get(storageId);
    if (!meta) {
      return { ok: false as const, error: "Upload não encontrado. Envie a foto novamente." };
    }
    const type = meta.contentType ?? "";
    if (!type.startsWith("image/")) {
      await deleteStoredFile(ctx, storageId);
      return { ok: false as const, error: "Envie um arquivo de imagem (JPG, PNG, WEBP ou GIF)." };
    }
    if (meta.size > MAX_AVATAR_BYTES) {
      await deleteStoredFile(ctx, storageId);
      return { ok: false as const, error: `A foto deve ter no máximo ${AVATAR_MAX_MB} MB.` };
    }

    const url = await ctx.storage.getUrl(storageId);
    if (!url) {
      await deleteStoredFile(ctx, storageId);
      return { ok: false as const, error: "Não foi possível gerar a URL da foto." };
    }

    const previous = await ctx.db.get(userId);
    await ctx.db.patch(userId, { image: url, avatarStorageId: storageId });
    await deleteStoredFile(ctx, previous?.avatarStorageId);

    return { ok: true as const, url };
  },
});

/**
 * Provedores (formas de entrar) vinculados a esta conta. A tela "Minha Conta"
 * usa para mostrar "Discord conectado" quando a pessoa entrou pelo Discord.
 */
export const myProviders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [] as string[];
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    return accounts.map((account) => account.provider);
  },
});
