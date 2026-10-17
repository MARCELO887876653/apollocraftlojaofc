/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

function identity(subject: string) {
  return { subject, issuer: "test", tokenIdentifier: `test|${subject}` };
}

/** Semeia um usuário admin com o cargo informado e retorna sua identidade. */
async function seedAdmin(
  t: T,
  opts: { email: string; role: string; active?: boolean },
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: opts.email.split("@")[0],
      email: opts.email,
    });
    const adminId = await ctx.db.insert("adminUsers", {
      email: opts.email,
      name: opts.email.split("@")[0],
      userId,
      role: opts.role,
      permissions: opts.role === "owner" ? ["team.manage"] : ["team.manage"],
      active: opts.active ?? true,
      createdAt: Date.now(),
    });
    return { userId, adminId, identity: identity(userId) };
  });
}

const MODULE_DESCRIPTION = "gestão de donos (team.upsert/setActive/remove)";

describe(MODULE_DESCRIPTION, () => {
  test("um dono pode promover outro membro a dono", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedAdmin(t, { email: "dono@apollo.com", role: "owner" });

    const newId = await t
      .withIdentity(owner.identity)
      .mutation(api.team.upsert, {
        email: "socio@apollo.com",
        name: "Sócio",
        role: "owner",
      });

    // `team.upsert` devolve um id de adminUsers; sem a anotação o `db.get`
    // aceita qualquer tabela e o resultado vem como união de todos os docs.
    const created = await t.run(async (ctx) => ctx.db.get(newId as Id<"adminUsers">));
    expect(created?.role).toBe("owner");
    // Dono recebe todas as permissões automaticamente.
    expect(created?.permissions.length).toBeGreaterThan(0);
  });

  test("um administrador NÃO pode conceder o cargo de dono", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t, { email: "adm@apollo.com", role: "custom" });

    await expect(
      t.withIdentity(admin.identity).mutation(api.team.upsert, {
        email: "socio@apollo.com",
        name: "Sócio",
        role: "owner",
      }),
    ).rejects.toThrow(/dono/i);
  });

  test("o único dono ativo não pode ser rebaixado", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedAdmin(t, { email: "dono@apollo.com", role: "owner" });

    await expect(
      t.withIdentity(owner.identity).mutation(api.team.upsert, {
        email: "dono@apollo.com",
        name: "Dono",
        role: "admin",
      }),
    ).rejects.toThrow(/último dono/i);
  });

  test("com dois donos, um pode ser rebaixado sem erro", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedAdmin(t, { email: "dono@apollo.com", role: "owner" });
    await seedAdmin(t, { email: "socio@apollo.com", role: "owner" });

    const id = await t.run(async (ctx) => {
      const all = await ctx.db.query("adminUsers").collect();
      return all.find((a) => a.email === "socio@apollo.com")!._id;
    });

    await t.withIdentity(owner.identity).mutation(api.team.upsert, {
      email: "socio@apollo.com",
      name: "Sócio",
      role: "admin",
    });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated?.role).toBe("admin");
  });
});
