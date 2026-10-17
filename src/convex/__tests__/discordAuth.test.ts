/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

const CLIENT_ID = "1304504761076404225";
const SECRET = "a".repeat(32);

/** Semeia um dono ativo (owner passa em qualquer permissão). */
async function seedOwner(t: T): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Dono", email: "dono@example.com" });
    await ctx.db.insert("adminUsers", {
      email: "dono@example.com",
      name: "Dono",
      userId,
      role: "owner",
      permissions: [],
      active: true,
      createdAt: Date.now(),
    });
    return userId;
  });
}

function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: "test", tokenIdentifier: `test|${userId}` });
}

/** Lê o valor cru salvo em settings (para conferir o que ficou no banco). */
async function storedConfig(t: T) {
  return await t.run(async (ctx) => {
    const docs = await ctx.db.query("settings").collect();
    const doc = docs.find((entry) => entry.key === "discord_auth");
    return doc?.value as
      | { enabled: boolean; clientId: string; clientSecret: string }
      | undefined;
  });
}

describe("aba Discord — credenciais do login", () => {
  test("não é possível configurar sem ser da equipe", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.discordAuth.adminSave, { enabled: true, clientId: CLIENT_ID, clientSecret: SECRET }),
    ).rejects.toThrow(/equipe/i);
    await expect(t.query(api.discordAuth.adminGet, {})).rejects.toThrow(/equipe/i);
  });

  test("salva as credenciais e devolve o estado pronto (sem expor o segredo)", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);

    const result = await asUser(t, owner).mutation(api.discordAuth.adminSave, {
      enabled: true,
      clientId: ` ${CLIENT_ID} `,
      clientSecret: ` ${SECRET} `,
    });

    expect(result).toMatchObject({ enabled: true, clientId: CLIENT_ID, hasSecret: true, status: "ready" });
    expect(JSON.stringify(result)).not.toContain(SECRET);

    const admin = await asUser(t, owner).query(api.discordAuth.adminGet, {});
    expect(admin).toMatchObject({ enabled: true, clientId: CLIENT_ID, hasSecret: true, status: "ready" });
    expect(JSON.stringify(admin)).not.toContain(SECRET);
    expect(typeof admin.updatedAt).toBe("number");
  });

  test("o servidor guarda o segredo para o provider usar", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);
    await asUser(t, owner).mutation(api.discordAuth.adminSave, {
      enabled: true,
      clientId: CLIENT_ID,
      clientSecret: SECRET,
    });

    const internalConfig = await t.query(internal.discordAuth.internalCredentials, {});
    expect(internalConfig).toEqual({ enabled: true, clientId: CLIENT_ID, clientSecret: SECRET });
  });

  test("deixar o secret em branco mantém o que já estava salvo", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);
    await asUser(t, owner).mutation(api.discordAuth.adminSave, {
      enabled: true,
      clientId: CLIENT_ID,
      clientSecret: SECRET,
    });

    await asUser(t, owner).mutation(api.discordAuth.adminSave, {
      enabled: false,
      clientId: CLIENT_ID,
      clientSecret: "",
    });

    const stored = await storedConfig(t);
    expect(stored?.enabled).toBe(false);
    expect(stored?.clientSecret).toBe(SECRET);
  });

  test("recusa Client ID que não é snowflake do Discord", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);
    const error = await asUser(t, owner)
      .mutation(api.discordAuth.adminSave, { enabled: false, clientId: "abc123", clientSecret: SECRET })
      .then(() => null, (e) => e);
    expect(String(error?.data ?? error?.message)).toMatch(/Client ID inválido/i);
  });

  test("recusa secret curto demais (colado incompleto)", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);
    const error = await asUser(t, owner)
      .mutation(api.discordAuth.adminSave, { enabled: false, clientId: CLIENT_ID, clientSecret: "curto" })
      .then(() => null, (e) => e);
    expect(String(error?.data ?? error?.message)).toMatch(/Client Secret inválido/i);
  });

  test("não ativa sem as duas credenciais", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);
    const error = await asUser(t, owner)
      .mutation(api.discordAuth.adminSave, { enabled: true, clientId: CLIENT_ID })
      .then(() => null, (e) => e);
    expect(String(error?.data ?? error?.message)).toMatch(/Client ID e o Client Secret/i);
  });

  test("a config pública só aparece quando está pronta para uso", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);

    // Sem nada configurado: a tela de login não mostra o botão.
    expect(await t.query(api.discordAuth.getPublicConfig, {})).toEqual({
      enabled: false,
      clientId: null,
    });

    // Salvo mas desligado: continua escondido.
    await asUser(t, owner).mutation(api.discordAuth.adminSave, {
      enabled: false,
      clientId: CLIENT_ID,
      clientSecret: SECRET,
    });
    expect(await t.query(api.discordAuth.getPublicConfig, {})).toEqual({
      enabled: false,
      clientId: null,
    });

    // Ligado: o botão aparece e o Client ID vai junto (é público, vai na URL).
    await asUser(t, owner).mutation(api.discordAuth.adminSave, {
      enabled: true,
      clientId: CLIENT_ID,
    });
    expect(await t.query(api.discordAuth.getPublicConfig, {})).toEqual({
      enabled: true,
      clientId: CLIENT_ID,
    });
  });

  test("remover credenciais desliga o login e apaga o segredo", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);
    await asUser(t, owner).mutation(api.discordAuth.adminSave, {
      enabled: true,
      clientId: CLIENT_ID,
      clientSecret: SECRET,
    });

    await asUser(t, owner).mutation(api.discordAuth.adminClear, {});

    expect(await storedConfig(t)).toMatchObject({ enabled: false, clientId: "", clientSecret: "" });
    expect(await asUser(t, owner).query(api.discordAuth.adminGet, {})).toMatchObject({
      enabled: false,
      clientId: "",
      hasSecret: false,
      status: "off",
    });
  });

  test("a auditoria registra a mudança sem o segredo", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t);
    await asUser(t, owner).mutation(api.discordAuth.adminSave, {
      enabled: true,
      clientId: CLIENT_ID,
      clientSecret: SECRET,
    });

    const logs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const log = logs.find((entry) => entry.action === "settings.discord");
    expect(log).toBeTruthy();
    expect(log?.details).toMatchObject({ enabled: true, clientId: CLIENT_ID });
    expect(JSON.stringify(log?.details)).not.toContain(SECRET);
  });
});

// ─────────────────────────────────────────────────────────────
// Provider "discord": troca de código e vínculo de contas
// ─────────────────────────────────────────────────────────────

describe("provider discord — vínculo por e-mail", () => {
  test("acha o cliente existente pelo e-mail verificado", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Cliente",
        email: "cliente@loja.com",
        emailVerificationTime: Date.now(),
      }),
    );

    expect(
      await t.query(internal.discordAuth.internalUserIdByEmail, { email: "cliente@loja.com" }),
    ).toBe(userId);
  });

  test("não vincula quando o e-mail não foi verificado na loja", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Visitante", email: "cliente@loja.com" }),
    );

    expect(
      await t.query(internal.discordAuth.internalUserIdByEmail, { email: "cliente@loja.com" }),
    ).toBeNull();
  });
});
