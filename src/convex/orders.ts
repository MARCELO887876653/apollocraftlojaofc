import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { requireAdmin, logAudit } from "./lib/admin";
import {
  checkRateLimit, generateOrderNumber, generateToken, getSetting,
} from "./lib/data";
import { deliveryStatusValidator, paymentStatusValidator } from "./schema";

// ─── Checkout: criação de pedido (TODOS os valores recalculados no servidor) ───

export const create = mutation({
  args: {
    items: v.array(
      v.object({
        productId: v.id("products"),
        variantId: v.optional(v.id("productVariants")),
        quantity: v.number(),
      }),
    ),
    couponCode: v.optional(v.string()),
    customer: v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      discord: v.optional(v.string()),
      minecraftNick: v.optional(v.string()),
      phone: v.optional(v.string()),
      uuid: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { items, couponCode, customer }) => {
    const store = (await getSetting(ctx, "store")) as any;

    // rate limit por pedido de checkout
    const rlKey = `checkout:${customer.email ?? "anon"}`;
    const allowed = await checkRateLimit(ctx, rlKey, 15, 60 * 60 * 1000);
    if (!allowed) throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");

    if (!items.length) throw new Error("Carrinho vazio");

    // valida campos de checkout conforme configuração do painel.
    // Campos desativados NÃO são rejeitados: apenas são ignorados (o frontend
    // pré-preenche nome/e-mail/discord da conta logada, e o e-mail é sempre
    // necessário para recibo e consulta de pedidos).
    const label: Record<string, string> = {
      name: "Nome", email: "E-mail", discord: "Discord",
      minecraftNick: "Nickname do Minecraft", phone: "Telefone", uuid: "UUID",
    };
    for (const f of store?.checkoutFields ?? []) {
      if (!f.enabled) continue;
      const value = (customer as any)[f.key];
      if (f.required && f.key === "email" && !value) continue; // validado abaixo (com fallback da conta)
      if (f.required && (!value || String(value).trim() === ""))
        throw new Error(`${label[f.key] ?? f.label} é obrigatório`);
    }
    if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      // fallback: usa o e-mail da conta logada (evita erro quando o visitante
      // deixa o campo vazio mas está autenticado)
      const userId = await getAuthUserId(ctx);
      const user = userId ? await ctx.db.get(userId) : null;
      const accountEmail = user?.email;
      if (accountEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
        customer.email = accountEmail;
      } else {
        throw new Error("E-mail inválido");
      }
    }

    // recalcula itens a partir do banco
    let subtotal = 0;
    const orderItems: Array<{
      productId: any; variantId?: any; name: string; variantName?: string;
      image?: string; unitPriceCents: number; quantity: number; totalCents: number;
    }> = [];
    const reserved: Array<{ kind: "product" | "variant"; id: any; qty: number; wasUnlimited: boolean; prevStock: number }> = [];

    for (const item of items) {
      if (item.quantity < 1) throw new Error("Quantidade inválida");
      const product = await ctx.db.get(item.productId);
      if (!product || !product.active || product.hidden)
        throw new Error("Produto indisponível");
      if (item.quantity < product.minQty)
        throw new Error(`Quantidade mínima de "${product.name}" é ${product.minQty}`);
      if (item.quantity > product.maxQty)
        throw new Error(`Quantidade máxima de "${product.name}" é ${product.maxQty}`);

      let unitPrice = product.priceCents;
      let variantDoc = null;
      if (item.variantId) {
        variantDoc = await ctx.db.get(item.variantId);
        if (!variantDoc || variantDoc.productId !== product._id || !variantDoc.active)
          throw new Error("Variante indisponível");
        unitPrice = variantDoc.priceCents;
      }

      // estoque
      const stockHolder = variantDoc ?? product;
      if (!stockHolder.unlimitedStock && stockHolder.stock < item.quantity)
        throw new Error(`Estoque insuficiente de "${product.name}"`);

      subtotal += unitPrice * item.quantity;
      orderItems.push({
        productId: product._id,
        variantId: variantDoc?._id,
        name: product.name,
        variantName: variantDoc?.name,
        image: product.image,
        unitPriceCents: unitPrice,
        quantity: item.quantity,
        totalCents: unitPrice * item.quantity,
      });
      reserved.push({
        kind: variantDoc ? "variant" : "product",
        id: stockHolder._id,
        qty: item.quantity,
        wasUnlimited: stockHolder.unlimitedStock,
        prevStock: stockHolder.stock,
      });
    }

    // desconto de estoque transacional
    for (const r of reserved) {
      if (r.wasUnlimited) continue;
      const doc: any = await ctx.db.get(r.id);
      if (!doc || doc.unlimitedStock) continue;
      if (doc.stock < r.qty) throw new Error(`Estoque insuficiente de "${doc.name}"`);
      await ctx.db.patch(r.id, { stock: doc.stock - r.qty });
    }

    // cupom — sempre validado no servidor
    let discount = 0;
    let appliedCoupon: any = null;
    if (couponCode) {
      const normalized = couponCode.trim().toUpperCase();
      const coupon = await ctx.db
        .query("coupons")
        .withIndex("by_code", (q) => q.eq("code", normalized))
        .first();
      if (!coupon || !coupon.active) throw new Error("Cupom inválido");
      const now = Date.now();
      if (coupon.startsAt && now < coupon.startsAt) throw new Error("Cupom ainda não começou");
      if (coupon.endsAt && now > coupon.endsAt) throw new Error("Cupom expirado");
      if (coupon.maxUses && coupon.usesCount >= coupon.maxUses) throw new Error("Cupom esgotado");
      if (coupon.maxUsesPerCustomer) {
        const usages = await ctx.db
          .query("couponUsages")
          .withIndex("by_coupon_email", (q) => q.eq("couponId", coupon._id).eq("email", customer.email!))
          .collect();
        if (usages.length >= coupon.maxUsesPerCustomer)
          throw new Error("Você já usou este cupom o máximo de vezes");
      }
      // subtotal elegível com restrições
      let eligible = 0;
      for (const item of orderItems) {
        if (coupon.excludedProductIds?.includes(item.productId)) continue;
        if (coupon.productIds?.length && !coupon.productIds.includes(item.productId)) continue;
        if (coupon.categoryIds?.length) {
          const product: any = await ctx.db.get(item.productId);
          if (!product?.categoryId || !coupon.categoryIds.includes(product.categoryId)) continue;
        }
        eligible += item.totalCents;
      }
      if (eligible === 0) throw new Error("Cupom não aplicável aos itens do carrinho");
      if (coupon.minSubtotalCents && eligible < coupon.minSubtotalCents)
        throw new Error(`Cupom exige pedido mínimo de ${(coupon.minSubtotalCents / 100).toFixed(2)}`);
      discount = coupon.type === "percent"
        ? Math.floor((eligible * coupon.value) / 100)
        : Math.min(coupon.value, eligible);
      if (coupon.maxDiscountCents) discount = Math.min(discount, coupon.maxDiscountCents);
      appliedCoupon = coupon;
    }

    const total = Math.max(0, subtotal - discount);
    const now = Date.now();
    const number = await generateOrderNumber(ctx);
    // Token forte de acesso do convidado ao status do pedido (usado no link
    // `/pedido/{number}?token=...`). É a credencial que autoriza a consulta
    // pública — o número do pedido, por si só, NÃO autoriza.
    const accessToken = generateToken(24);
    // Normaliza strings vazias para undefined (evita "" salvo como se fosse dado real)
    for (const k of ["name", "discord", "minecraftNick", "phone", "uuid"] as const) {
      const v = (customer as any)[k];
      if (typeof v === "string" && v.trim() === "") (customer as any)[k] = undefined;
      else if (typeof v === "string") (customer as any)[k] = v.trim();
    }

    // cliente
    let customerId: any;
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_email", (q) => q.eq("email", customer.email!))
      .first();
    if (existing) {
      customerId = existing._id;
      await ctx.db.patch(existing._id, {
        name: customer.name ?? existing.name,
        discord: customer.discord ?? existing.discord,
        minecraftNick: customer.minecraftNick ?? existing.minecraftNick,
        phone: customer.phone ?? existing.phone,
        ordersCount: existing.ordersCount + 1,
        totalSpentCents: existing.totalSpentCents + total,
        lastOrderAt: now,
      });
    } else {
      customerId = await ctx.db.insert("customers", {
        email: customer.email!,
        name: customer.name,
        discord: customer.discord,
        minecraftNick: customer.minecraftNick,
        phone: customer.phone,
        ordersCount: 1,
        totalSpentCents: total,
        firstOrderAt: now,
        lastOrderAt: now,
        createdAt: now,
      });
    }

    const orderId = await ctx.db.insert("orders", {
      number,
      customerId,
      customerName: customer.name ?? customer.email!.split("@")[0],
      customerEmail: customer.email!,
      discord: customer.discord,
      minecraftNick: customer.minecraftNick,
      uuidField: customer.uuid,
      phone: customer.phone,
      items: orderItems,
      subtotalCents: subtotal,
      discountCents: discount,
      totalCents: total,
      couponCode: appliedCoupon?.code,
      gateway: undefined,
      paymentStatus: "pending",
      deliveryStatus: "pending",
      statusHistory: [{ status: "pending", at: now, note: "Pedido criado" }],
      accessToken,
      createdAt: now,
      updatedAt: now,
    });

    if (appliedCoupon) {
      await ctx.db.patch(appliedCoupon._id, {
        usesCount: appliedCoupon.usesCount + 1,
        totalDiscountCents: appliedCoupon.totalDiscountCents + discount,
      });
      await ctx.db.insert("couponUsages", {
        couponId: appliedCoupon._id,
        orderId,
        email: customer.email!,
        discountCents: discount,
        createdAt: now,
      });
    }

    // webhooks de saída: pedido criado
    await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
      event: "order.created",
      payload: {
        orderNumber: number,
        total: total / 100,
        customerEmail: customer.email,
        customerName: customer.name ?? customer.email?.split("@")[0],
        items: orderItems.map((i: any) => ({ name: i.name, variant: i.variantName, quantity: i.quantity })),
      },
    });

    // vendas + criação da fila de entrega
    for (const item of orderItems) {
      const product: any = await ctx.db.get(item.productId);
      if (!product) continue;
      await ctx.db.patch(product._id, { salesCount: product.salesCount + item.quantity });
      if (product.delivery.type !== "none") {
        await ctx.db.insert("deliveries", {
          orderId,
          orderNumber: number,
          productId: product._id as any,
          productName: product.name,
          type: product.delivery.type,
          target: customer.minecraftNick ?? customer.discord ?? customer.email!,
          quantity: item.quantity,
          status: "pending",
          attempts: 0,
          maxAttempts: 5,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return { orderId, number, accessToken, total };
  },
});

// ─── Público ───

/** Autoriza a leitura de um pedido: o cliente dono (e-mail da conta logada)
 *  OU quem apresentar o `accessToken` do pedido. Nunca o número sozinho. */
async function authorizeOrderView(
  ctx: any,
  order: { customerEmail: string; accessToken: string },
  token: string | undefined,
): Promise<boolean> {
  if (typeof token === "string" && token.length > 0 && token === order.accessToken) {
    return true;
  }
  const userId = await getAuthUserId(ctx);
  if (userId === null) return false;
  const user = await ctx.db.get(userId);
  return Boolean(user?.email && user.email === order.customerEmail);
}

export const getByNumber = query({
  args: { number: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { number, token }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_number", (q) => q.eq("number", number))
      .first();
    if (!order) return null;
    // Sem autorização, não revela nem a existência do pedido.
    if (!(await authorizeOrderView(ctx, order, token))) return null;
    // Resposta saneada: nunca devolve accessToken, IP nem campos internos.
    return {
      _id: order._id,
      number: order.number,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      minecraftNick: order.minecraftNick,
      discord: order.discord,
      items: order.items,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      couponCode: order.couponCode,
      gatewayPaymentId: order.gatewayPaymentId,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      pixQrCode: order.pixQrCode,
      pixQrCodeBase64: order.pixQrCodeBase64,
      pixTicketUrl: order.pixTicketUrl,
      deliveryStatus: order.deliveryStatus,
      statusHistory: order.statusHistory,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt,
    };
  },
});

// ─── Área do cliente (Minha conta) ───

/** Histórico de pedidos do usuário logado (vinculado ao e-mail da conta). */
export const myOrders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("customerEmail", user.email!))
      .collect();
    return orders.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Entregas (o que o cliente recebeu) de um pedido dele. Só expõe itens
 *  marcados como "mostrar ao cliente" e apenas quando entregues. */
export const myOrderDeliveries = query({
  args: { number: v.string() },
  handler: async (ctx, { number }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const order = await ctx.db
      .query("orders")
      .withIndex("by_number", (q) => q.eq("number", number))
      .first();
    if (!order || order.customerEmail !== user.email) return null;
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const visible = [];
    for (const d of deliveries) {
      const product = await ctx.db.get(d.productId);
      if (!(product?.delivery?.showToCustomer ?? true)) continue;
      visible.push({
        productName: d.productName,
        quantity: d.quantity,
        type: d.type,
        status: d.status,
        deliveredAt: d.deliveredAt,
        payload: d.status === "delivered" ? d.payload : undefined,
      });
    }
    return visible;
  },
});

/** Entregas visíveis na página pública do pedido (sem login).
 *  Exige o `accessToken` do pedido (ou o cliente dono logado); só expõe itens
 *  com "mostrar ao cliente" ativado e o payload apenas quando entregue. */
export const guestDeliveries = query({
  args: { number: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { number, token }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_number", (q) => q.eq("number", number))
      .first();
    if (!order) return null;
    if (!(await authorizeOrderView(ctx, order, token))) return null;
    if (order.paymentStatus !== "paid") return [];
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const visible = [];
    for (const d of deliveries) {
      const product = await ctx.db.get(d.productId);
      if (!(product?.delivery?.showToCustomer ?? true)) continue;
      visible.push({
        productName: d.productName,
        quantity: d.quantity,
        type: d.type,
        status: d.status,
        deliveredAt: d.deliveredAt,
        payload: d.status === "delivered" ? d.payload : undefined,
      });
    }
    return visible;
  },
});

// ─── Admin ───

export const adminList = query({
  args: {
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { status, search, from, to }) => {
    await requireAdmin(ctx, "orders.view");
    let orders;
    if (status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_paymentStatus", (q) => q.eq("paymentStatus", status as any))
        .collect();
    } else {
      orders = await ctx.db.query("orders").collect();
    }
    let list = orders;
    if (from) list = list.filter((o) => o.createdAt >= from);
    if (to) list = list.filter((o) => o.createdAt <= to);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.number.toLowerCase().includes(s) ||
          o.customerEmail.toLowerCase().includes(s) ||
          o.customerName.toLowerCase().includes(s) ||
          o.gatewayPaymentId?.toLowerCase().includes(s),
      );
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminGet = query({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "orders.view");
    const order = await ctx.db.get(id);
    if (!order) return null;
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", id))
      .collect();
    return { order, deliveries };
  },
});

/** Atualização manual de status pelo admin (ex.: pagamento manual, reembolso). */
export const adminUpdateStatus = mutation({
  args: {
    id: v.id("orders"),
    paymentStatus: paymentStatusValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, paymentStatus, note }) => {
    const admin = await requireAdmin(ctx, "orders.manage");
    const order = await ctx.db.get(id);
    if (!order) throw new Error("Pedido não encontrado");
    const now = Date.now();

    // Transição para "paid": idempotente, dispara entrega e webhooks como no gateway
    if (paymentStatus === "paid" && order.paymentStatus !== "paid") {
      await ctx.db.patch(id, {
        paymentStatus: "paid",
        paidAt: now,
        updatedAt: now,
        statusHistory: [
          ...order.statusHistory,
          { status: "paid", at: now, note: note ?? `Pagamento confirmado por ${admin.name}` },
        ],
      });
      await ctx.scheduler.runAfter(0, internal.deliveriesQueue.processOrder, { orderId: id });
      await ctx.scheduler.runAfter(0, internal.deliveryCommands.internalCreateForOrder, {
        orderId: id,
      });
      await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
        event: "order.paid",
        payload: {
          orderNumber: order.number,
          total: order.totalCents / 100,
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          items: order.items.map((i: any) => ({ name: i.name, variant: i.variantName, quantity: i.quantity })),
        },
      });
      await logAudit(ctx, admin, "order.status_update", "order", id, { paymentStatus });
      return;
    }

    await ctx.db.patch(id, {
      paymentStatus,
      updatedAt: now,
    });
    await ctx.db.patch(id, {
      statusHistory: [
        ...order.statusHistory,
        { status: paymentStatus, at: now, note: note ?? `Atualizado manualmente por ${admin.name}` },
      ],
    });
    if (["refunded", "cancelled", "expired", "failed"].includes(paymentStatus)) {
      await ctx.scheduler.runAfter(0, internal.deliveryCommands.internalCancelForOrder, {
        orderId: id,
        reason: `Pedido ${paymentStatus} (${admin.name})`,
      });
      await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
        event: "order.cancelled",
        payload: {
          orderNumber: order.number,
          status: paymentStatus,
          total: order.totalCents / 100,
          customerEmail: order.customerEmail,
        },
      });
    }
    await logAudit(ctx, admin, "order.status_update", "order", id, { paymentStatus });
  },
});

export const adminCancel = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "orders.manage");
    const order = await ctx.db.get(id);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.paymentStatus === "paid") throw new Error("Pedido pago: use reembolso no gateway");
    const now = Date.now();
    // devolve estoque
    for (const item of order.items) {
      if (item.variantId) {
        const variant = await ctx.db.get(item.variantId);
        if (variant && !variant.unlimitedStock)
          await ctx.db.patch(variant._id, { stock: variant.stock + item.quantity });
      } else {
        const product = await ctx.db.get(item.productId);
        if (product && !product.unlimitedStock)
          await ctx.db.patch(product._id, { stock: product.stock + item.quantity });
      }
    }
    // remove entregas pendentes
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", id))
      .collect();
    for (const d of deliveries) {
      if (d.status !== "delivered") await ctx.db.delete(d._id);
    }
    await ctx.scheduler.runAfter(0, internal.deliveryCommands.internalCancelForOrder, {
      orderId: id,
      reason: `Cancelado por ${admin.name}`,
    });
    await ctx.db.patch(id, {
      paymentStatus: "cancelled",
      deliveryStatus: "pending",
      updatedAt: now,
      statusHistory: [...order.statusHistory, { status: "cancelled", at: now, note: `Cancelado por ${admin.name}` }],
    });
    await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
      event: "order.cancelled",
      payload: {
        orderNumber: order.number,
        status: "cancelled",
        total: order.totalCents / 100,
        customerEmail: order.customerEmail,
      },
    });
    await logAudit(ctx, admin, "order.cancel", "order", id);
  },
});
