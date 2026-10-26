import { query, mutation, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { requireAdmin, logAudit } from "./lib/admin";
import {
  checkRateLimit, generateOrderNumber, generateToken, getSetting, readOrderPix,
} from "./lib/data";
import { deliveryStatusValidator, paymentStatusValidator } from "./schema";
import { applyPaidOrderToCustomer } from "./lib/customerTotals";

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

    // Modo manutenção: loja fechada para compras (nunca aceita pedido novo).
    if (store?.maintenance?.enabled) {
      throw new ConvexError(
        "A loja está em manutenção e não está aceitando pedidos agora. Voltamos em breve!",
      );
    }

    // rate limit por pedido de checkout
    const rlKey = `checkout:${customer.email ?? "anon"}`;
    const allowed = await checkRateLimit(ctx, rlKey, 15, 60 * 60 * 1000);
    if (!allowed) throw new ConvexError("Muitas tentativas. Tente novamente em alguns minutos.");

    if (!items.length) throw new ConvexError("Carrinho vazio");

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
        throw new ConvexError(`${label[f.key] ?? f.label} é obrigatório`);
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
        throw new ConvexError("E-mail inválido");
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
      if (item.quantity < 1) throw new ConvexError("Quantidade inválida");
      const product = await ctx.db.get(item.productId);
      if (!product || !product.active || product.hidden)
        throw new ConvexError("Produto indisponível");
      if (item.quantity < product.minQty)
        throw new ConvexError(`Quantidade mínima de "${product.name}" é ${product.minQty}`);
      if (item.quantity > product.maxQty)
        throw new ConvexError(`Quantidade máxima de "${product.name}" é ${product.maxQty}`);

      let unitPrice = product.priceCents;
      let variantDoc = null;
      if (item.variantId) {
        variantDoc = await ctx.db.get(item.variantId);
        if (!variantDoc || variantDoc.productId !== product._id || !variantDoc.active)
          throw new ConvexError("Variante indisponível");
        unitPrice = variantDoc.priceCents;
      }

      // estoque
      const stockHolder = variantDoc ?? product;
      if (!stockHolder.unlimitedStock && stockHolder.stock < item.quantity)
        throw new ConvexError(`Estoque insuficiente de "${product.name}"`);

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
      if (doc.stock < r.qty) throw new ConvexError(`Estoque insuficiente de "${doc.name}"`);
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
      if (!coupon || !coupon.active) throw new ConvexError("Cupom inválido");
      const now = Date.now();
      if (coupon.startsAt && now < coupon.startsAt) throw new ConvexError("Cupom ainda não começou");
      if (coupon.endsAt && now > coupon.endsAt) throw new ConvexError("Cupom expirado");
      if (coupon.maxUses && coupon.usesCount >= coupon.maxUses) throw new ConvexError("Cupom esgotado");
      if (coupon.maxUsesPerCustomer) {
        const usages = await ctx.db
          .query("couponUsages")
          .withIndex("by_coupon_email", (q) => q.eq("couponId", coupon._id).eq("email", customer.email!))
          .collect();
        if (usages.length >= coupon.maxUsesPerCustomer)
          throw new ConvexError("Você já usou este cupom o máximo de vezes");
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
      if (eligible === 0) throw new ConvexError("Cupom não aplicável aos itens do carrinho");
      if (coupon.minSubtotalCents && eligible < coupon.minSubtotalCents)
        throw new ConvexError(`Cupom exige pedido mínimo de ${(coupon.minSubtotalCents / 100).toFixed(2)}`);
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
    // O acumulado de compras (ordersCount/totalSpentCents) NÃO entra aqui:
    // todo pedido nasce "pending" e pedido não pago não é compra. Quem soma é a
    // confirmação do pagamento (gateway, painel ou entrega manual) — ver
    // lib/customerTotals.ts.
    if (existing) {
      customerId = existing._id;
      await ctx.db.patch(existing._id, {
        name: customer.name ?? existing.name,
        discord: customer.discord ?? existing.discord,
        minecraftNick: customer.minecraftNick ?? existing.minecraftNick,
        phone: customer.phone ?? existing.phone,
        lastOrderAt: now,
      });
    } else {
      customerId = await ctx.db.insert("customers", {
        email: customer.email!,
        name: customer.name,
        discord: customer.discord,
        minecraftNick: customer.minecraftNick,
        phone: customer.phone,
        ordersCount: 0,
        totalSpentCents: 0,
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
    // O QR Code vem de `orderPix` (fora do documento do pedido) — uma leitura
    // extra SÓ nesta tela, em troca de todas as listagens/estatísticas não
    // carregarem mais a imagem base64.
    const pix = await readOrderPix(ctx, order);
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
      pixQrCode: pix.pixQrCode,
      pixQrCodeBase64: pix.pixQrCodeBase64,
      pixTicketUrl: pix.pixTicketUrl,
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
    // A lista devolve só o que a tabela do painel usa. Sem isso cada pedido
    // trafega o documento inteiro — incluindo o QR Code PIX em base64 — e a
    // página de pedidos fica pesada conforme a loja cresce.
    return list
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((o) => ({
        _id: o._id,
        number: o.number,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        totalCents: o.totalCents,
        paymentStatus: o.paymentStatus,
        deliveryStatus: o.deliveryStatus,
        createdAt: o.createdAt,
      }));
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
    if (!order) throw new ConvexError("Pedido não encontrado");
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
      // agora sim é compra: entra no acumulado do cliente (Top 3, painel)
      await applyPaidOrderToCustomer(ctx, order, 1);
      await logAudit(ctx, admin, "order.status_update", "order", id, { paymentStatus });
      return;
    }

    await ctx.db.patch(id, {
      paymentStatus,
      updatedAt: now,
      statusHistory: [
        ...order.statusHistory,
        { status: paymentStatus, at: now, note: note ?? `Atualizado manualmente por ${admin.name}` },
      ],
    });
    if (["refunded", "cancelled", "expired", "failed"].includes(paymentStatus)) {
      // Estorno: o dinheiro saiu do caixa e sai do acumulado do cliente também.
      if (order.paymentStatus === "paid") {
        await applyPaidOrderToCustomer(ctx, order, -1);
      }
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

/** Entrega manual pelo painel — o caminho para quando o PIX caiu mas o webhook
 *  não confirmou (ou o jogador recebeu o produto por fora).
 *
 *  - confirma o pagamento quando o admin pede (pedido pendente);
 *  - conclui as entregas do pedido com a observação escrita pelo admin;
 *  - cancela os comandos automáticos ainda na fila, senão o addon entregaria
 *    o mesmo produto de novo quando o jogador entrasse no servidor. */
export const adminDeliverManually = mutation({
  args: {
    id: v.id("orders"),
    note: v.optional(v.string()),
    confirmPayment: v.boolean(),
  },
  handler: async (ctx, { id, note, confirmPayment }) => {
    const admin = await requireAdmin(ctx, "orders.manage");
    const order = await ctx.db.get(id);
    if (!order) throw new ConvexError("Pedido não encontrado");
    const now = Date.now();
    const trimmed = note?.trim();
    const manualNote = trimmed
      ? `Entrega manual por ${admin.name}: ${trimmed}`
      : `Entrega manual por ${admin.name}`;

    const wasPending = order.paymentStatus !== "paid";
    if (wasPending) {
      if (!confirmPayment) {
        throw new ConvexError(
          "Este pedido ainda está aguardando pagamento. Marque o pagamento como recebido para entregar.",
        );
      }
      await ctx.db.patch(id, {
        paymentStatus: "paid",
        paidAt: order.paidAt ?? now,
        updatedAt: now,
        statusHistory: [
          ...order.statusHistory,
          {
            status: "paid",
            at: now,
            note: `Pagamento confirmado por ${admin.name} (entrega manual)`,
          },
        ],
      });
      await ctx.scheduler.runAfter(0, internal.webhooksOut.sendEvent, {
        event: "order.paid",
        payload: {
          orderNumber: order.number,
          total: order.totalCents / 100,
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          items: order.items.map((i: any) => ({
            name: i.name,
            variant: i.variantName,
            quantity: i.quantity,
          })),
        },
      });
      // PIX caiu e o admin confirmou na mão: é compra de verdade.
      await applyPaidOrderToCustomer(ctx, order, 1);
    }

    // Comandos automáticos ainda não executados: cancelar para não duplicar.
    const commands = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_order", (q) => q.eq("orderId", id))
      .collect();
    let canceledCommands = 0;
    for (const c of commands) {
      if (c.status !== "PENDING" && c.status !== "PROCESSING") continue;
      await ctx.db.patch(c._id, {
        status: "CANCELED",
        response: "Entregue manualmente pelo painel",
        reason: manualNote,
        claimedBy: undefined,
        claimedAt: undefined,
        claimExpiresAt: undefined,
        claimToken: undefined,
        completedAt: now,
        updatedAt: now,
      });
      canceledCommands++;
    }

    // Entregas do pedido: concluídas com o registro do admin.
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", id))
      .collect();
    let delivered = 0;
    for (const d of deliveries) {
      if (d.status === "delivered") continue;
      await ctx.db.patch(d._id, {
        status: "delivered",
        deliveredAt: now,
        lastError: undefined,
        payload: trimmed ?? "Entregue manualmente pelo painel",
        updatedAt: now,
      });
      delivered++;
    }

    if (order.deliveryStatus !== "delivered") {
      await ctx.db.patch(id, {
        deliveryStatus: "delivered",
        updatedAt: now,
        statusHistory: [
          ...(wasPending
            ? [
                ...order.statusHistory,
                {
                  status: "paid",
                  at: now,
                  note: `Pagamento confirmado por ${admin.name} (entrega manual)`,
                },
              ]
            : order.statusHistory),
          { status: "delivered", at: now, note: manualNote },
        ],
      });
    }

    await logAudit(ctx, admin, "order.manual_delivery", "order", id, {
      delivered,
      canceledCommands,
      paid: wasPending,
    });
    return { delivered, canceledCommands, paid: wasPending };
  },
});

export const adminCancel = mutation({
  args: { id: v.id("orders") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "orders.manage");
    const order = await ctx.db.get(id);
    if (!order) throw new ConvexError("Pedido não encontrado");
    if (order.paymentStatus === "paid") throw new ConvexError("Pedido pago: use reembolso no gateway");
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
