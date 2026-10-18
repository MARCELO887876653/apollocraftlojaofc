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

/** Pedido pendente com uma entrega normal e um comando automático na fila. */
async function seed(t: T) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "KIT NETHER",
      slug: `kit-${Math.random().toString(36).slice(2, 8)}`,
      images: [],
      tags: [],
      priceCents: 1099,
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

    const adminUserId = await ctx.db.insert("users", {
      name: "Dono",
      email: "dono@apollo.com",
    });
    await ctx.db.insert("adminUsers", {
      email: "dono@apollo.com",
      name: "Dono",
      userId: adminUserId,
      role: "owner",
      permissions: [],
      active: true,
      createdAt: now,
    });

    const orderId = await ctx.db.insert("orders", {
      number: "#MANUAL1",
      customerName: "Rodrigo",
      customerEmail: "rodrigo@example.com",
      minecraftNick: "MT Rodrigo8981",
      items: [
        {
          productId,
          name: "KIT NETHER",
          unitPriceCents: 1099,
          quantity: 2,
          totalCents: 2198,
        },
      ],
      subtotalCents: 2198,
      discountCents: 0,
      totalCents: 2198,
      gateway: "mercadopago",
      gatewayPaymentId: "184874514076",
      paymentStatus: "pending",
      deliveryStatus: "pending",
      statusHistory: [{ status: "pending", at: now, note: "Pedido criado" }],
      accessToken: "token-manual",
      createdAt: now,
      updatedAt: now,
    });

    const deliveryId = await ctx.db.insert("deliveries", {
      orderId,
      orderNumber: "#MANUAL1",
      productId,
      productName: "KIT NETHER",
      type: "manual",
      target: "MT Rodrigo8981",
      quantity: 2,
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      createdAt: now,
      updatedAt: now,
    });

    const commandId = await ctx.db.insert("deliveryCommands", {
      publicId: "del_manual1",
      idempotencyKey: `${orderId}:0:0`,
      orderId,
      orderNumber: "#MANUAL1",
      orderItemIndex: 0,
      productId,
      productName: "KIT NETHER",
      serverId: "survival-01",
      addonId: "apollo-store",
      clientIdentifier: "MT Rodrigo8981",
      action: "GIVE_KIT",
      variables: [],
      offlineExecute: false,
      executeAt: now,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 5,
      createdAt: now,
      updatedAt: now,
    });

    return { orderId, deliveryId, commandId, identity: identity(adminUserId) };
  });
}

describe("entrega manual pelo painel (orders.adminDeliverManually)", () => {
  test("não entrega pedido pendente sem confirmar o pagamento", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);

    await expect(
      t.withIdentity(s.identity).mutation(api.orders.adminDeliverManually, {
        id: s.orderId,
        confirmPayment: false,
      }),
    ).rejects.toThrow(/aguardando pagamento/i);
  });

  test("confirma o PIX, conclui a entrega e cancela o comando automático", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);

    await t.withIdentity(s.identity).mutation(api.orders.adminDeliverManually, {
      id: s.orderId,
      note: "VIP entregue no servidor",
      confirmPayment: true,
    });

    const after = await t.run(async (ctx) => {
      const order = await ctx.db.get(s.orderId);
      const delivery = await ctx.db.get(s.deliveryId);
      const command = await ctx.db.get(s.commandId);
      return { order, delivery, command };
    });

    expect(after.order?.paymentStatus).toBe("paid");
    expect(after.order?.paidAt).toBeTypeOf("number");
    expect(after.order?.deliveryStatus).toBe("delivered");
    // Entrega registrada com o que o admin escreveu (aparece para o cliente).
    expect(after.delivery?.status).toBe("delivered");
    expect(after.delivery?.payload).toBe("VIP entregue no servidor");
    // Sem isto o addon entregaria o kit de novo quando o jogador entrasse.
    expect(after.command?.status).toBe("CANCELED");
    // O histórico guarda os dois passos.
    const notes = after.order?.statusHistory.map((h) => h.note ?? "") ?? [];
    expect(notes.some((n) => n.includes("Pagamento confirmado"))).toBe(true);
    expect(notes.some((n) => n.includes("VIP entregue no servidor"))).toBe(true);
  });

  test("pedido já pago: entrega sem mexer no status do pagamento", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(s.orderId, { paymentStatus: "paid", paidAt: 123 });
    });

    const res = await t.withIdentity(s.identity).mutation(api.orders.adminDeliverManually, {
      id: s.orderId,
      confirmPayment: true,
    });

    const after = await t.run(async (ctx) => ({
      order: await ctx.db.get(s.orderId),
      delivery: await ctx.db.get(s.deliveryId),
    }));
    expect(res.paid).toBe(false);
    expect(res.delivered).toBe(1);
    expect(after.order?.paidAt).toBe(123);
    expect(after.delivery?.status).toBe("delivered");
  });
});
