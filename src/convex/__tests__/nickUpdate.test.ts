/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

function identity(subject: string) {
  return { subject, issuer: "test", tokenIdentifier: `test|${subject}` };
}

/**
 * Pedido pago com:
 *  - GIVE_KIT PENDENTE para o nick antigo (o caso do cliente que digitou errado);
 *  - GIVE_KIT já DONE (não pode ser reenviado nem perder o destinatário original).
 */
async function seed(t: T) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "KIT SUB DIMA",
      slug: `kit-${Math.random().toString(36).slice(2, 8)}`,
      images: [],
      tags: [],
      priceCents: 899,
      stock: 0,
      unlimitedStock: true,
      active: true,
      featured: false,
      popular: false,
      hidden: false,
      minQty: 1,
      maxQty: 99,
      order: 0,
      benefits: [],
      salesCount: 0,
      delivery: { type: "manual", showToCustomer: true },
      createdAt: now,
      updatedAt: now,
    });

    const adminUserId = await ctx.db.insert("users", { name: "Dono", email: "dono@apollo.com" });
    await ctx.db.insert("adminUsers", {
      email: "dono@apollo.com",
      name: "Dono",
      userId: adminUserId,
      role: "owner",
      permissions: [],
      active: true,
      createdAt: now,
    });

    const customerId = await ctx.db.insert("customers", {
      email: "lopesbenicio799@gmail.com",
      name: "Benicio",
      minecraftNick: "Wofulsoda6619",
      ordersCount: 1,
      totalSpentCents: 899,
      createdAt: now - 3000,
    });

    const orderId = await ctx.db.insert("orders", {
      number: "#PXF1",
      customerId,
      customerName: "Benicio",
      customerEmail: "lopesbenicio799@gmail.com",
      minecraftNick: "Wofulsoda6619",
      items: [
        { productId, name: "KIT SUB DIMA", unitPriceCents: 899, quantity: 1, totalCents: 899 },
      ],
      subtotalCents: 899,
      discountCents: 0,
      totalCents: 899,
      gateway: "mercadopago",
      gatewayPaymentId: "190745116600",
      paymentStatus: "paid",
      paidAt: now - 1000,
      deliveryStatus: "pending",
      statusHistory: [{ status: "pending", at: now - 2000, note: "Pedido criado" }],
      accessToken: "token-nick",
      createdAt: now - 2000,
      updatedAt: now - 1000,
    });

    const pendingId = await ctx.db.insert("deliveryCommands", {
      publicId: "del_nick_pending",
      idempotencyKey: `${orderId}:0:0`,
      orderId,
      orderNumber: "#PXF1",
      orderItemIndex: 0,
      productId,
      productName: "KIT SUB DIMA",
      serverId: "survival-01",
      addonId: "apollo-store",
      clientIdentifier: "Wofulsoda6619",
      action: "GIVE_KIT",
      command: "/givekit {nick} sub_dima",
      payload: { kit: "sub_dima" },
      variables: [{ name: "nickname", value: "Wofulsoda6619" }],
      offlineExecute: false,
      executeAt: now - 1000,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 5,
      createdAt: now - 1000,
      updatedAt: now - 1000,
    });

    const doneId = await ctx.db.insert("deliveryCommands", {
      publicId: "del_nick_done",
      idempotencyKey: `${orderId}:0:1`,
      orderId,
      orderNumber: "#PXF1",
      orderItemIndex: 0,
      productId,
      productName: "KIT SUB DIMA",
      serverId: "survival-01",
      addonId: "apollo-store",
      clientIdentifier: "Wofulsoda6619",
      action: "GIVE_KIT",
      variables: [{ name: "nickname", value: "Wofulsoda6619" }],
      offlineExecute: false,
      executeAt: now - 5000,
      status: "DONE",
      attempts: 1,
      maxAttempts: 5,
      completedAt: now - 4000,
      createdAt: now - 5000,
      updatedAt: now - 4000,
    });

    return { orderId, pendingId, doneId, productId, customerId, identity: identity(adminUserId) };
  });
}

describe("correção do nick do Minecraft (orders.adminUpdateMinecraftNick)", () => {
  test("salvar troca o nick do pedido e o destinatário das entregas pendentes", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);

    const res = await t.withIdentity(s.identity).mutation(api.orders.adminUpdateMinecraftNick, {
      id: s.orderId,
      minecraftNick: "BenicioCorreto",
    });

    expect(res.oldNick).toBe("Wofulsoda6619");
    expect(res.newNick).toBe("BenicioCorreto");
    expect(res.updatedCommands).toBe(1);
    expect(res.created).toBe(0);

    const after = await t.run(async (ctx) => ({
      order: await ctx.db.get(s.orderId),
      pending: await ctx.db.get(s.pendingId),
      done: await ctx.db.get(s.doneId),
      customer: await ctx.db.get(s.customerId),
    }));

    expect(after.order?.minecraftNick).toBe("BenicioCorreto");
    // Pagamento, valores e número intactos.
    expect(after.order?.paymentStatus).toBe("paid");
    expect(after.order?.totalCents).toBe(899);
    expect(after.order?.number).toBe("#PXF1");
    // O addon lê daqui no claim.
    expect(after.pending?.clientIdentifier).toBe("BenicioCorreto");
    expect(after.pending?.variables).toEqual([{ name: "nickname", value: "BenicioCorreto" }]);
    // Placeholders do comando continuam (o addon substitui na execução).
    expect(after.pending?.command).toBe("/givekit {nick} sub_dima");
    // Entrega já concluída não é tocada.
    expect(after.done?.clientIdentifier).toBe("Wofulsoda6619");
    expect(after.done?.status).toBe("DONE");
    // Cadastro do cliente acompanha (o próximo checkout já sugere o nick certo).
    expect(after.customer?.minecraftNick).toBe("BenicioCorreto");

    const notes = after.order?.statusHistory.map((h) => h.note ?? "") ?? [];
    expect(notes.some((n) => n.includes("Dono") && n.includes("Wofulsoda6619") && n.includes("BenicioCorreto"))).toBe(true);
  });

  test("salvar e reenviar invalida a tentativa antiga e enfileira uma nova com o nick novo", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);

    const res = await t.withIdentity(s.identity).mutation(api.orders.adminUpdateMinecraftNick, {
      id: s.orderId,
      minecraftNick: "BenicioCorreto",
      resend: true,
    });

    expect(res.canceled).toBe(1);
    expect(res.created).toBe(1);

    const after = await t.run(async (ctx) => {
      const order = await ctx.db.get(s.orderId);
      const old = await ctx.db.get(s.pendingId);
      const done = await ctx.db.get(s.doneId);
      const all = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_order", (q) => q.eq("orderId", s.orderId))
        .collect();
      return { order, old, done, all };
    });

    expect(after.old?.status).toBe("CANCELED");
    expect(after.old?.clientIdentifier).toBe("BenicioCorreto");

    const fresh = after.all.filter((c) => c.publicId !== "del_nick_pending" && c.publicId !== "del_nick_done");
    expect(fresh).toHaveLength(1);
    expect(fresh[0].status).toBe("PENDING");
    expect(fresh[0].clientIdentifier).toBe("BenicioCorreto");
    expect(fresh[0].variables).toContainEqual({ name: "nickname", value: "BenicioCorreto" });
    expect(fresh[0].idempotencyKey).not.toBe(`${s.orderId}:0:0`);
    expect(fresh[0].offlineExecute).toBe(false);

    // Nunca duplica o que já foi entregue.
    expect(after.done?.status).toBe("DONE");
    expect(after.all.filter((c) => c.status === "DONE")).toHaveLength(1);
    expect(after.order?.deliveryStatus).toBe("pending");

    const events = await t.run(async (ctx) =>
      ctx.db
        .query("deliveryEvents")
        .withIndex("by_order", (q) => q.eq("orderId", s.orderId))
        .collect(),
    );
    expect(events.some((e) => e.type === "CANCELED")).toBe(true);
    expect(events.some((e) => e.type === "CREATED" && (e.message ?? "").includes("BenicioCorreto"))).toBe(true);
  });

  test("bloqueia a alteração quando existe entrega em processamento", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(s.pendingId, { status: "PROCESSING", claimToken: "clm_x" });
    });

    await expect(
      t.withIdentity(s.identity).mutation(api.orders.adminUpdateMinecraftNick, {
        id: s.orderId,
        minecraftNick: "BenicioCorreto",
        resend: true,
      }),
    ).rejects.toThrow(/processamento/i);

    const order = await t.run(async (ctx) => ctx.db.get(s.orderId));
    expect(order?.minecraftNick).toBe("Wofulsoda6619");
  });

  test("rejeita nick inválido e nick igual ao atual", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);

    await expect(
      t.withIdentity(s.identity).mutation(api.orders.adminUpdateMinecraftNick, {
        id: s.orderId,
        minecraftNick: "ab",
      }),
    ).rejects.toThrow(/inválido/i);

    await expect(
      t.withIdentity(s.identity).mutation(api.orders.adminUpdateMinecraftNick, {
        id: s.orderId,
        minecraftNick: "nick!",
      }),
    ).rejects.toThrow(/inválido/i);

    await expect(
      t.withIdentity(s.identity).mutation(api.orders.adminUpdateMinecraftNick, {
        id: s.orderId,
        minecraftNick: "Wofulsoda6619",
      }),
    ).rejects.toThrow(/igual/i);
  });

  test("reenviar sem nada pendente não cria entrega nova", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(s.pendingId, { status: "DONE", completedAt: Date.now() });
    });

    const res = await t.withIdentity(s.identity).mutation(api.orders.adminUpdateMinecraftNick, {
      id: s.orderId,
      minecraftNick: "BenicioCorreto",
      resend: true,
    });
    expect(res.created).toBe(0);
    expect(res.canceled).toBe(0);
  });
});
