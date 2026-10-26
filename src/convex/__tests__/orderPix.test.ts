/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

const PIX = {
  gatewayPaymentId: "MP-123",
  pixQrCode: "00020126580014br.gov.bcb.pix",
  pixQrCodeBase64: "iVBORw0KGgo=",
  pixTicketUrl: "https://mercadopago/ticket/123",
};

/**
 * Semeia um pedido PENDENTE. `legacy` reproduz os pedidos antigos, que guardavam
 * o QR Code dentro do próprio documento (antes da separação para `orderPix`).
 */
async function seedOrder(t: T, legacy = false) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "VIP",
      slug: `vip-${Math.random().toString(36).slice(2, 8)}`,
      images: [],
      tags: [],
      priceCents: 1000,
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
      delivery: { type: "none", showToCustomer: true },
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      number: "#PIX0001",
      customerName: "Ana",
      customerEmail: "ana@example.com",
      items: [
        { productId, name: "VIP", unitPriceCents: 1000, quantity: 1, totalCents: 1000 },
      ],
      subtotalCents: 1000,
      discountCents: 0,
      totalCents: 1000,
      paymentStatus: "pending",
      deliveryStatus: "pending",
      statusHistory: [],
      accessToken: "tok-ana",
      createdAt: now,
      updatedAt: now,
      ...(legacy
        ? {
            gateway: "mercadopago",
            gatewayPaymentId: PIX.gatewayPaymentId,
            pixQrCode: PIX.pixQrCode,
            pixQrCodeBase64: PIX.pixQrCodeBase64,
            pixTicketUrl: PIX.pixTicketUrl,
          }
        : {}),
    });
    return { orderId };
  });
}

/** O documento do pedido, como está gravado no banco. */
async function readOrder(t: T, orderId: any) {
  return await t.run(async (ctx) => await ctx.db.get(orderId));
}

/** As linhas de `orderPix` (o payload pesado fora do pedido). */
async function readPixRows(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("orderPix").collect());
}

describe("payload PIX em orderPix", () => {
  test("a criação do PIX guarda o QR em orderPix, não no documento do pedido", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t);

    await t.mutation(internal.paymentsData.applyPaymentCreation, { orderId, ...PIX });

    const order: any = await readOrder(t, orderId);
    // O pedido recebe só o que toda listagem/estatística precisa...
    expect(order.gateway).toBe("mercadopago");
    expect(order.gatewayPaymentId).toBe(PIX.gatewayPaymentId);
    expect(order.paymentMethod).toBe("pix");
    // ...o QR Code (imagem base64) NÃO entra mais aqui: era 78% do documento.
    expect(order.pixQrCode).toBeUndefined();
    expect(order.pixQrCodeBase64).toBeUndefined();
    expect(order.pixTicketUrl).toBeUndefined();

    const rows: any[] = await readPixRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].orderId).toBe(orderId);
    expect(rows[0].pixQrCode).toBe(PIX.pixQrCode);
    expect(rows[0].pixQrCodeBase64).toBe(PIX.pixQrCodeBase64);
  });

  test("gerar o PIX de novo atualiza a linha em vez de duplicar (idempotente)", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t);

    await t.mutation(internal.paymentsData.applyPaymentCreation, { orderId, ...PIX });
    await t.mutation(internal.paymentsData.applyPaymentCreation, {
      orderId,
      ...PIX,
      pixQrCodeBase64: "NOVO=",
    });

    const rows: any[] = await readPixRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].pixQrCodeBase64).toBe("NOVO=");
  });

  test("a tela do pedido continua recebendo o QR Code (com o token do pedido)", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t);
    await t.mutation(internal.paymentsData.applyPaymentCreation, { orderId, ...PIX });

    const view: any = await t.query(api.orders.getByNumber, {
      number: "#PIX0001",
      token: "tok-ana",
    });
    expect(view.pixQrCode).toBe(PIX.pixQrCode);
    expect(view.pixQrCodeBase64).toBe(PIX.pixQrCodeBase64);
    expect(view.pixTicketUrl).toBe(PIX.pixTicketUrl);
    expect(view.paymentStatus).toBe("pending");
    // A resposta nunca expõe o token de acesso nem campos internos.
    expect(view.accessToken).toBeUndefined();

    // Sem token e sem login, nada é revelado.
    const denied = await t.query(api.orders.getByNumber, { number: "#PIX0001" });
    expect(denied).toBeNull();
  });

  test("pedido antigo (QR no documento) continua funcionando sem migração", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t, true);

    expect(await readPixRows(t)).toHaveLength(0);
    const view: any = await t.query(api.orders.getByNumber, {
      number: "#PIX0001",
      token: "tok-ana",
    });
    expect(view.pixQrCodeBase64).toBe(PIX.pixQrCodeBase64);

    // E o caminho de leitura compartilhado faz o mesmo.
    const pix = await t.run(async (ctx) => {
      const order: any = await ctx.db.get(orderId);
      const { readOrderPix } = await import("../lib/data");
      return await readOrderPix(ctx, order);
    });
    expect(pix.pixQrCode).toBe(PIX.pixQrCode);
  });

  test("a migração move o QR para orderPix sem perder nada", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedOrder(t, true);

    const result = await t.mutation(internal.paymentsData.migratePixToOrderPix, {});
    expect(result.moved).toBe(1);
    expect(result.nextCursor).toBeNull();

    const order: any = await readOrder(t, orderId);
    expect(order.pixQrCode).toBeUndefined();
    expect(order.pixQrCodeBase64).toBeUndefined();

    const rows: any[] = await readPixRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].pixQrCode).toBe(PIX.pixQrCode);
    expect(rows[0].pixTicketUrl).toBe(PIX.pixTicketUrl);

    // Depois da migração, o cliente continua vendo o PIX normalmente.
    const view: any = await t.query(api.orders.getByNumber, {
      number: "#PIX0001",
      token: "tok-ana",
    });
    expect(view.pixQrCodeBase64).toBe(PIX.pixQrCodeBase64);
  });

  test("migração é idempotente (rodar de novo não duplica nem apaga)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, true);

    await t.mutation(internal.paymentsData.migratePixToOrderPix, {});
    const again = await t.mutation(internal.paymentsData.migratePixToOrderPix, {});

    expect(again.moved).toBe(0);
    const rows: any[] = await readPixRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].pixQrCodeBase64).toBe(PIX.pixQrCodeBase64);
  });
});
