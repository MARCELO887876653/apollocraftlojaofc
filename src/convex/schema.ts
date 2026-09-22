import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = import("convex/values").Infer<typeof roleValidator>;

export const paymentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("cancelled"),
  v.literal("expired"),
  v.literal("refunded"),
  v.literal("failed"),
);

export const deliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("delivered"),
  v.literal("failed"),
);

export const deliveryTypeValidator = v.union(
  v.literal("none"),
  v.literal("command"),
  v.literal("api"),
  v.literal("webhook"),
  v.literal("code"),
  v.literal("message"),
  v.literal("manual"),
);

const deliveryConfig = v.object({
  type: deliveryTypeValidator,
  commands: v.optional(v.array(v.string())),
  apiUrl: v.optional(v.string()),
  apiMethod: v.optional(v.union(v.literal("GET"), v.literal("POST"))),
  apiHeaders: v.optional(v.array(v.object({ k: v.string(), v: v.string() }))),
  apiBody: v.optional(v.string()),
  message: v.optional(v.string()),
  codes: v.optional(v.array(v.string())),
  showToCustomer: v.boolean(),
});

const seo = {
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
};

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    // ─── Configurações gerais (KV: store config, tema, home, menu, footer...) ───
    settings: defineTable({
      key: v.string(),
      value: v.any(),
      updatedAt: v.number(),
    }).index("by_key", ["key"]),

    // ─── Equipe admin (RBAC) ───
    adminUsers: defineTable({
      email: v.string(),
      name: v.string(),
      userId: v.optional(v.id("users")),
      role: v.string(), // owner | admin | manager | support | custom
      permissions: v.array(v.string()),
      active: v.boolean(),
      createdAt: v.number(),
      lastLoginAt: v.optional(v.number()),
    })
      .index("by_email", ["email"])
      .index("by_userId", ["userId"]),

    // ─── Catálogo ───
    categories: defineTable({
      name: v.string(),
      slug: v.string(),
      description: v.optional(v.string()),
      icon: v.optional(v.string()),
      image: v.optional(v.string()),
      color: v.optional(v.string()),
      parentId: v.optional(v.id("categories")),
      order: v.number(),
      active: v.boolean(),
      ...seo,
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_slug", ["slug"])
      .index("by_parent_order", ["parentId", "order"]),

    products: defineTable({
      name: v.string(),
      slug: v.string(),
      shortDescription: v.optional(v.string()),
      description: v.optional(v.string()),
      image: v.optional(v.string()),
      images: v.array(v.string()),
      categoryId: v.optional(v.id("categories")),
      tags: v.array(v.string()),
      priceCents: v.number(),
      compareAtPriceCents: v.optional(v.number()),
      stock: v.number(),
      unlimitedStock: v.boolean(),
      active: v.boolean(),
      featured: v.boolean(),
      popular: v.boolean(),
      hidden: v.boolean(),
      minQty: v.number(),
      maxQty: v.number(),
      order: v.number(),
      benefits: v.array(v.string()),
      delivery: deliveryConfig,
      salesCount: v.number(),
      ...seo,
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_slug", ["slug"])
      .index("by_category", ["categoryId"])
      .index("by_active_order", ["active", "order"]),

    productVariants: defineTable({
      productId: v.id("products"),
      name: v.string(),
      priceCents: v.number(),
      compareAtPriceCents: v.optional(v.number()),
      stock: v.number(),
      unlimitedStock: v.boolean(),
      order: v.number(),
      active: v.boolean(),
      sku: v.optional(v.string()),
    }).index("by_product", ["productId"]),

    // ─── Clientes ───
    customers: defineTable({
      email: v.string(),
      name: v.optional(v.string()),
      discord: v.optional(v.string()),
      minecraftNick: v.optional(v.string()),
      phone: v.optional(v.string()),
      ordersCount: v.number(),
      totalSpentCents: v.number(),
      firstOrderAt: v.optional(v.number()),
      lastOrderAt: v.optional(v.number()),
      userId: v.optional(v.id("users")),
      createdAt: v.number(),
    })
      .index("by_email", ["email"])
      .index("by_userId", ["userId"])
      .index("by_spent", ["totalSpentCents"]),

    // ─── Pedidos ───
    orders: defineTable({
      number: v.string(),
      customerId: v.optional(v.id("customers")),
      customerName: v.string(),
      customerEmail: v.string(),
      discord: v.optional(v.string()),
      minecraftNick: v.optional(v.string()),
      uuidField: v.optional(v.string()),
      phone: v.optional(v.string()),
      ip: v.optional(v.string()),
      items: v.array(
        v.object({
          productId: v.id("products"),
          variantId: v.optional(v.id("productVariants")),
          name: v.string(),
          variantName: v.optional(v.string()),
          image: v.optional(v.string()),
          unitPriceCents: v.number(),
          quantity: v.number(),
          totalCents: v.number(),
        }),
      ),
      subtotalCents: v.number(),
      discountCents: v.number(),
      totalCents: v.number(),
      couponCode: v.optional(v.string()),
      gateway: v.optional(v.string()),
      gatewayPaymentId: v.optional(v.string()),
      paymentStatus: paymentStatusValidator,
      paymentMethod: v.optional(v.string()),
      pixQrCode: v.optional(v.string()),
      pixQrCodeBase64: v.optional(v.string()),
      pixTicketUrl: v.optional(v.string()),
      deliveryStatus: deliveryStatusValidator,
      statusHistory: v.array(
        v.object({
          status: v.string(),
          at: v.number(),
          note: v.optional(v.string()),
        }),
      ),
      accessToken: v.string(), // acesso do convidado ao status do pedido
      createdAt: v.number(),
      updatedAt: v.number(),
      paidAt: v.optional(v.number()),
    })
      .index("by_number", ["number"])
      .index("by_email", ["customerEmail"])
      .index("by_createdAt", ["createdAt"])
      .index("by_paymentStatus", ["paymentStatus"])
      .index("by_gatewayPaymentId", ["gatewayPaymentId"]),

    // ─── Fila de entrega automática ───
    deliveries: defineTable({
      orderId: v.id("orders"),
      orderNumber: v.string(),
      productId: v.id("products"),
      productName: v.string(),
      type: v.string(),
      target: v.optional(v.string()), // nick do jogador / destinatário
      quantity: v.number(),
      payload: v.optional(v.any()),
      status: deliveryStatusValidator,
      attempts: v.number(),
      maxAttempts: v.number(),
      lastError: v.optional(v.string()),
      nextRetryAt: v.optional(v.number()),
      deliveredAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_order", ["orderId"])
      .index("by_status_retry", ["status", "nextRetryAt"]),

    // ─── Cupons ───
    coupons: defineTable({
      code: v.string(),
      type: v.union(v.literal("percent"), v.literal("fixed")),
      value: v.number(), // percent: 0-100 | fixed: centavos
      minSubtotalCents: v.optional(v.number()),
      maxDiscountCents: v.optional(v.number()),
      maxUses: v.optional(v.number()),
      maxUsesPerCustomer: v.optional(v.number()),
      startsAt: v.optional(v.number()),
      endsAt: v.optional(v.number()),
      productIds: v.optional(v.array(v.id("products"))),
      categoryIds: v.optional(v.array(v.id("categories"))),
      excludedProductIds: v.optional(v.array(v.id("products"))),
      active: v.boolean(),
      usesCount: v.number(),
      totalDiscountCents: v.number(),
      createdAt: v.number(),
    })
      .index("by_code", ["code"])
      .index("by_active", ["active"]),

    couponUsages: defineTable({
      couponId: v.id("coupons"),
      orderId: v.id("orders"),
      email: v.string(),
      discountCents: v.number(),
      createdAt: v.number(),
    })
      .index("by_coupon", ["couponId"])
      .index("by_coupon_email", ["couponId", "email"]),

    // ─── Conteúdo ───
    pages: defineTable({
      title: v.string(),
      slug: v.string(),
      content: v.string(),
      ...seo,
      active: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_slug", ["slug"]),

    posts: defineTable({
      title: v.string(),
      slug: v.string(),
      cover: v.optional(v.string()),
      excerpt: v.optional(v.string()),
      content: v.string(),
      author: v.optional(v.string()),
      status: v.union(v.literal("draft"), v.literal("published")),
      publishedAt: v.optional(v.number()),
      ...seo,
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_slug", ["slug"]),

    faqs: defineTable({
      question: v.string(),
      answer: v.string(),
      order: v.number(),
      active: v.boolean(),
    }).index("by_order", ["order"]),

    banners: defineTable({
      title: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      imageDesktop: v.optional(v.string()),
      imageMobile: v.optional(v.string()),
      buttonText: v.optional(v.string()),
      buttonUrl: v.optional(v.string()),
      position: v.string(), // hero | top | middle | footer
      startAt: v.optional(v.number()),
      endAt: v.optional(v.number()),
      active: v.boolean(),
      createdAt: v.number(),
    }).index("by_position", ["position"]),

    // ─── Integrações ───
    webhooksOut: defineTable({
      url: v.string(),
      secret: v.string(),
      events: v.array(v.string()),
      active: v.boolean(),
      failureCount: v.number(),
      createdAt: v.number(),
    }),

    webhookLogs: defineTable({
      webhookId: v.optional(v.id("webhooksOut")),
      event: v.string(),
      url: v.string(),
      statusCode: v.optional(v.number()),
      error: v.optional(v.string()),
      attempt: v.number(),
      createdAt: v.number(),
    }).index("by_createdAt", ["createdAt"]),

    // ─── Auditoria ───
    auditLogs: defineTable({
      userId: v.optional(v.id("users")),
      userName: v.string(),
      action: v.string(),
      entity: v.optional(v.string()),
      entityId: v.optional(v.string()),
      details: v.optional(v.any()),
      ip: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_createdAt", ["createdAt"]),

    // ─── Rate limiting simples em rotas sensíveis ───
    rateLimits: defineTable({
      key: v.string(),
      windowStart: v.number(),
      count: v.number(),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
