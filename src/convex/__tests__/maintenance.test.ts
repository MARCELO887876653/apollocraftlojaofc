/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { DEFAULT_STORE } from "../lib/data";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

/** Semeia a configuração da loja (opcionalmente em manutenção) e um produto. */
async function seedStore(t: T, maintenanceEnabled: boolean) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("settings", {
      key: "store",
      value: {
        ...DEFAULT_STORE,
        maintenance: {
          enabled: maintenanceEnabled,
          title: "Estamos em manutenção",
          message: "Voltaremos em breve com novidades!",
          eta: "em 2 horas",
        },
      },
      updatedAt: now,
    });
    const productId = await ctx.db.insert("products", {
      name: "VIP", slug: `vip-${Math.random().toString(36).slice(2, 8)}`,
      images: [], tags: [], priceCents: 100, stock: 0, unlimitedStock: true,
      active: true, featured: false, popular: false, hidden: false,
      minQty: 1, maxQty: 99, order: 0, benefits: [], salesCount: 0,
      delivery: { type: "none", showToCustomer: true },
      createdAt: now, updatedAt: now,
    });
    return productId;
  });
}

describe("modo manutenção — fila de avisos de retorno", () => {
  test("cadastra o e-mail (normalizado) e ignora duplicados", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(api.maintenance.subscribe, { email: " Cliente@Loja.com " });
    expect(first).toEqual({ ok: true, already: false });

    const second = await t.mutation(api.maintenance.subscribe, { email: "cliente@loja.com" });
    expect(second).toEqual({ ok: true, already: true });

    const all = await t.run((ctx) => ctx.db.query("maintenanceSubscribers").collect());
    expect(all.length).toBe(1);
    expect(all[0].email).toBe("cliente@loja.com");
    expect(all[0].notifiedAt).toBeUndefined();
  });

  test("rejeita e-mail inválido", async () => {
    const t = convexTest(schema, modules);
    const error = await t
      .mutation(api.maintenance.subscribe, { email: "sem-arroba" })
      .then(() => null, (e) => e);
    expect(error).toBeTruthy();
    expect(String(error?.data ?? error?.message)).toMatch(/válido/i);
  });

  test("quem já foi avisado volta para a fila ao se cadastrar de novo", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.maintenance.subscribe, { email: "cliente@loja.com" });
    await t.run(async (ctx) => {
      const doc = await ctx.db.query("maintenanceSubscribers").first();
      await ctx.db.patch(doc!._id, { notifiedAt: Date.now() });
    });

    await t.mutation(api.maintenance.subscribe, { email: "cliente@loja.com" });
    const all = await t.run((ctx) => ctx.db.query("maintenanceSubscribers").collect());
    expect(all.length).toBe(1);
    expect(all[0].notifiedAt).toBeUndefined();
  });

  test("loja em manutenção recusa pedidos novos", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedStore(t, true);

    const error = await t
      .mutation(api.orders.create, {
        items: [{ productId, quantity: 1 }],
        customer: { name: "Umbra", email: "cliente@loja.com" },
      })
      .then(() => null, (e) => e);

    expect(error).toBeTruthy();
    expect(String(error?.data ?? error?.message)).toMatch(/manutenção/i);
  });

  test("loja aberta aceita pedido normalmente", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedStore(t, false);

    const result = await t.mutation(api.orders.create, {
      items: [{ productId, quantity: 1 }],
      customer: { name: "Umbra", email: "cliente@loja.com" },
    });
    expect(result.number).toMatch(/^#/);
  });
});
