import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
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

    // valida campos de checkout conforme configuração do painel
    const fieldRules: Record<string, boolean> = {};
    for (const f of store?.checkoutFields ?? []) fieldRules[f.key] = f.enabled;
    const label: Record<string, string> = {
      name: "Nome", email: "E-mail", discord: "Discord",
      minecraftNick: "Nickname do Minecraft", phone: "Telefone", uuid: "UUID",
    };
    for (const f of store?.checkoutFields ?? []) {
      if (!f.enabled) {
        if ((customer as any)[f.key]) throw new Error(`Campo ${label[f.key]} não deve ser enviado`);
        continue;
      }
      const value = (customer as any)[f.key];
      if (f.required && (!value || String(value).trim() === ""))
        throw new Error(`${label[f.key] ?? f.label} é obrigatório`);
    }
    if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
      throw new Error("E-mail inválido");

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
      accessToken: generateToken(16),
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

    return { orderId, number, accessToken: undefined, total };
  },
});

// ─── Público ───

export const getByNumber = query({
  args: { number: v.string() },
  handler: async (ctx, { number }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_number", (q) => q.eq("number", number))
      .first();
    if (!order) return null;
    // dados públicos do pedido (cliente dono vê pelo número + pode receber o link)
    return order;
  },
});

export const listMine = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("customerEmail", email))
      .collect();
    return orders.sort((a, b) => b.createdAt - a.createdAt);
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
    const patch: any = {
      paymentStatus,
      updatedAt: now,
    };
    if (paymentStatus === "paid" && order.paymentStatus !== "paid") {
      patch.paidAt = now;
    }
    await ctx.db.patch(id, patch);
    await ctx.db.patch(id, {
      statusHistory: [
        ...order.statusHistory,
        { status: paymentStatus, at: now, note: note ?? `Atualizado manualmente por ${admin.name}` },
      ],
    });
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
    await ctx.db.patch(id, {
      paymentStatus: "cancelled",
      deliveryStatus: "pending",
      updatedAt: now,
      statusHistory: [...order.statusHistory, { status: "cancelled", at: now, note: `Cancelado por ${admin.name}` }],
    });
    await logAudit(ctx, admin, "order.cancel", "order", id);
  },
});
