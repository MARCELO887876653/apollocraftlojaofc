/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

async function seedUser(t: T) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", { name: "Cliente", email: "cliente@loja.com" }),
  );
}

function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: "test", tokenIdentifier: `test|${userId}` });
}

/**
 * Guarda um arquivo no storage de teste JÁ com `contentType`: no Convex real
 * isso vem do Content-Type do POST no upload, mas o convex-test grava apenas
 * tamanho/sha256. Sem completar aqui, a validação de "é imagem?" nunca seria
 * exercitada pelo teste.
 */
async function storeFile(t: T, options: { type: string; bytes: number }) {
  return await t.run(async (ctx) => {
    const id = await ctx.storage.store(
      new Blob([new Uint8Array(options.bytes)], { type: options.type }),
    );
    await ctx.db.patch(id, { contentType: options.type });
    return id;
  });
}

describe("perfil — nome", () => {
  test("exige login", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.profile.updateProfile, { name: "Novo" })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
  });

  test("limpa espaços extras e limita o tamanho", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const result = await asUser(t, userId).mutation(api.profile.updateProfile, {
      name: "  Apollo   Craft  ",
    });
    expect(result.name).toBe("Apollo Craft");

    const long = await asUser(t, userId).mutation(api.profile.updateProfile, {
      name: "x".repeat(200),
    });
    expect(long.name?.length).toBe(60);
  });

  test("recusa nome vazio", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await expect(
      asUser(t, userId).mutation(api.profile.updateProfile, { name: "   " }),
    ).rejects.toThrow(/nome válido/i);
  });

  test("sem nada para salvar, avisa em vez de gravar vazio", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await expect(asUser(t, userId).mutation(api.profile.updateProfile, {})).rejects.toThrow(
      /Nada para salvar/i,
    );
  });
});

describe("perfil — foto", () => {
  test("aceita só imagem do storage e limita o tamanho", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const notImage = await storeFile(t, { type: "application/pdf", bytes: 10 });
    await expect(
      asUser(t, userId).mutation(api.profile.setAvatar, { storageId: notImage }),
    ).rejects.toThrow(/imagem/i);
    // O arquivo inválido não fica ocupando espaço no storage.
    expect(await t.run(async (ctx) => ctx.db.system.get(notImage))).toBeNull();

    const tooBig = await storeFile(t, { type: "image/png", bytes: 6 * 1024 * 1024 });
    await expect(
      asUser(t, userId).mutation(api.profile.setAvatar, { storageId: tooBig }),
    ).rejects.toThrow(/5 MB/);

    const ok = await storeFile(t, { type: "image/png", bytes: 1024 });
    const saved = await asUser(t, userId).mutation(api.profile.setAvatar, { storageId: ok });
    expect(saved.url).toContain("/api/storage/");

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user?.image).toBe(saved.url);
  });

  test("trocar de foto apaga a anterior do storage", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const first = await storeFile(t, { type: "image/png", bytes: 512 });
    await asUser(t, userId).mutation(api.profile.setAvatar, { storageId: first });

    const second = await storeFile(t, { type: "image/jpeg", bytes: 512 });
    const saved = await asUser(t, userId).mutation(api.profile.setAvatar, { storageId: second });

    expect(await t.run(async (ctx) => ctx.db.system.get(first))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.system.get(second))).not.toBeNull();
    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user?.image).toBe(saved.url);
  });

  test("remover a foto (image: null) limpa o campo e o arquivo", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const file = await storeFile(t, { type: "image/png", bytes: 512 });
    await asUser(t, userId).mutation(api.profile.setAvatar, { storageId: file });

    const result = await asUser(t, userId).mutation(api.profile.updateProfile, { image: null });
    expect(result.image).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.system.get(file))).toBeNull();
  });

  test("não aceita endereço de imagem externo/inseguro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await expect(
      asUser(t, userId).mutation(api.profile.updateProfile, { image: "http://x.test/a.png" }),
    ).rejects.toThrow(/imagem/i);
  });

  test("sem login não gera URL de upload", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.profile.avatarUploadUrl, {})).rejects.toThrow(/Entre na sua conta/i);
  });
});

describe("perfil — formas de entrar na conta", () => {
  test("lista os provedores vinculados (ex.: discord)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "email-otp",
        providerAccountId: "cliente@loja.com",
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "discord",
        providerAccountId: "1304504761076404225",
      });
    });

    const providers = await asUser(t, userId).query(api.profile.myProviders, {});
    expect(providers.sort()).toEqual(["discord", "email-otp"]);
    expect(await t.query(api.profile.myProviders, {})).toEqual([]);
  });
});
