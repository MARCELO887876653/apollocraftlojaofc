import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────
// API v1 — validadores e tabelas
// Tudo aqui é ADITIVO: nenhuma tabela existente é alterada.
// O módulo `schema.ts` importa `apiV1Tables` e faz spread no defineSchema.
// ─────────────────────────────────────────────────────────────

/** Permissões (scopes) que uma API Key pode ter. */
export const API_SCOPES = {
  deliveriesRead: "deliveries:read",
  deliveriesClaim: "deliveries:claim",
  deliveriesUpdate: "deliveries:update",
  usersQueue: "users:queue",
  usersSchedules: "users:schedules",
  serverHeartbeat: "server:heartbeat",
  // Catálogo (administração pela API v1 — usado por addons administrativos)
  categoriesRead: "categories:read",
  categoriesCreate: "categories:create",
  categoriesUpdate: "categories:update",
  categoriesDelete: "categories:delete",
  productsRead: "products:read",
  productsCreate: "products:create",
  productsUpdate: "products:update",
  productsDelete: "products:delete",
  productsPublish: "products:publish",
  deliveryRecipesRead: "delivery-recipes:read",
  deliveryRecipesWrite: "delivery-recipes:write",
} as const;

export type ApiScope = (typeof API_SCOPES)[keyof typeof API_SCOPES];

export const ALL_API_SCOPES: string[] = Object.values(API_SCOPES);

export const apiScopeValidator = v.union(
  v.literal("deliveries:read"),
  v.literal("deliveries:claim"),
  v.literal("deliveries:update"),
  v.literal("users:queue"),
  v.literal("users:schedules"),
  v.literal("server:heartbeat"),
  v.literal("categories:read"),
  v.literal("categories:create"),
  v.literal("categories:update"),
  v.literal("categories:delete"),
  v.literal("products:read"),
  v.literal("products:create"),
  v.literal("products:update"),
  v.literal("products:delete"),
  v.literal("products:publish"),
  v.literal("delivery-recipes:read"),
  v.literal("delivery-recipes:write"),
);

/** Status possíveis de uma entrega/comando. */
export const deliveryCommandStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("PROCESSING"),
  v.literal("DONE"),
  v.literal("FAILED"),
  v.literal("CANCELED"),
);

export type DeliveryCommandStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "CANCELED";

/** Modos de entrega de uma ação. `LOCAL_REFERENCE` mantém o item/kit no addon. */
export const deliveryModeValidator = v.union(
  v.literal("SERVER"),
  v.literal("LOCAL_REFERENCE"),
);

/** Como a quantidade comprada multiplica a ação. */
export const quantityModeValidator = v.union(
  v.literal("MULTIPLY"),
  v.literal("REPEAT"),
  v.literal("IGNORE"),
);

/** Prévia visual de um kit/item local (NUNCA usada para reconstruir a entrega). */
export const contentsPreviewV1Validator = v.array(
  v.object({
    type_id: v.string(),
    name: v.optional(v.string()),
    amount: v.optional(v.number()),
  }),
);

/** Uma ação de entrega configurada no produto (livre: action + payload JSON). */
export const deliveryActionV1Validator = v.object({
  // id estável da ação (permite snapshot, retry, auditoria e idempotência por step)
  actionId: v.optional(v.string()),
  action: v.string(),
  command: v.optional(v.string()),
  payload: v.optional(v.any()),
  // LOCAL_REFERENCE: o addon reconstrói a entrega a partir de referenceId
  mode: v.optional(deliveryModeValidator),
  referenceId: v.optional(v.string()),
  referenceRevision: v.optional(v.number()),
  contentsPreview: v.optional(contentsPreviewV1Validator),
  quantityMode: v.optional(quantityModeValidator),
  serverId: v.optional(v.string()),
  addonId: v.optional(v.string()),
  offlineExecute: v.boolean(),
  delaySeconds: v.optional(v.number()),
  reverseAction: v.optional(v.string()),
  reversePayload: v.optional(v.any()),
  reverseDelaySeconds: v.optional(v.number()),
});

/** Configuração de entrega automática (v1) no produto. */
export const deliveryV1Validator = v.object({
  enabled: v.boolean(),
  // versão do formato da receita de entrega (permite evoluir sem quebrar)
  version: v.optional(v.number()),
  actions: v.array(deliveryActionV1Validator),
});

export const apiV1Tables = {
  // ─── Chaves de API (token só existe em hash) ───
  apiKeysV1: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    prefix: v.string(),
    keyHash: v.string(),
    lastFour: v.string(),
    scopes: v.array(v.string()),
    serverId: v.string(), // "GLOBAL" ou id do servidor (ex.: survival-01)
    addonId: v.optional(v.string()), // limita a um addon específico
    active: v.boolean(),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_prefix", ["prefix"])
    .index("by_hash", ["keyHash"])
    .index("by_createdAt", ["createdAt"]),

  // ─── Fila de entregas automáticas ───
  deliveryCommands: defineTable({
    publicId: v.string(), // id global exibido na API (del_xxx)
    idempotencyKey: v.string(), // única: orderId:itemIndex:actionIndex(:reverse)
    orderId: v.id("orders"),
    orderNumber: v.string(),
    orderItemIndex: v.number(),
    productId: v.id("products"),
    productName: v.string(),
    serverId: v.string(), // GLOBAL | survival-01 ...
    addonId: v.string(), // economy | ranks | custom ...
    clientIdentifier: v.string(), // nickname / XUID / id interno
    action: v.string(),
    command: v.optional(v.string()),
    payload: v.optional(v.any()),
    variables: v.array(v.object({ name: v.string(), value: v.string() })),
    offlineExecute: v.boolean(),
    executeAt: v.number(),
    status: deliveryCommandStatusValidator,
    response: v.optional(v.string()),
    reason: v.optional(v.string()),
    attempts: v.number(),
    maxAttempts: v.number(),
    lastAttemptAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    // ── retry profissional (aditivo; entregas antigas ficam legíveis) ──
    errorCode: v.optional(v.string()),
    lastError: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    nextAttemptAt: v.optional(v.number()),
    requiresManualIntervention: v.optional(v.boolean()),
    // ── step / composição (cada ação é um step idempotente) ──
    actionId: v.optional(v.string()),
    stepIndex: v.optional(v.number()),
    deliveryGroupId: v.optional(v.string()),
    // ── LOCAL_REFERENCE (entrega resolvida pelo addon) ──
    deliveryMode: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    referenceRevision: v.optional(v.number()),
    // versão do schema do documento (compatibilidade futura)
    schemaVersion: v.optional(v.number()),
    // reversão (VIP → REMOVE_RANK no reembolso)
    reverseAction: v.optional(v.string()),
    reversePayload: v.optional(v.any()),
    reverseDelaySeconds: v.optional(v.number()),
    // claim/lease (evita dois processos pegando a mesma entrega)
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    claimExpiresAt: v.optional(v.number()),
    claimToken: v.optional(v.string()),
    // snapshot da receita de entrega no momento da compra (compras antigas não mudam)
    recipeSnapshot: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_publicId", ["publicId"])
    .index("by_status_executeAt", ["status", "executeAt"])
    .index("by_server_status", ["serverId", "status"])
    .index("by_client", ["clientIdentifier"])
    .index("by_order", ["orderId"])
    .index("by_group", ["deliveryGroupId"])
    .index("by_createdAt", ["createdAt"]),

  // ─── Histórico de tentativas de entrega ───
  deliveryAttempts: defineTable({
    deliveryId: v.id("deliveryCommands"),
    apiKeyId: v.optional(v.id("apiKeysV1")),
    serverId: v.optional(v.string()),
    status: v.string(),
    response: v.optional(v.string()),
    reason: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_delivery", ["deliveryId"])
    .index("by_createdAt", ["createdAt"]),

  // ─── Servidores/addons que fazem heartbeat ───
  addonServers: defineTable({
    serverId: v.string(),
    addonId: v.optional(v.string()),
    name: v.optional(v.string()),
    version: v.optional(v.string()),
    minecraftVersion: v.optional(v.string()),
    lastSeenAt: v.number(),
    lastIp: v.optional(v.string()),
    status: v.string(), // online | offline
    // diagnóstico (aditivo)
    apiClientVersion: v.optional(v.string()),
    capabilities: v.optional(v.any()),
    lastErrorCode: v.optional(v.string()),
    lastErrorAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_server", ["serverId"])
    .index("by_server_addon", ["serverId", "addonId"])
    .index("by_lastSeen", ["lastSeenAt"]),

  // ─── Logs de chamadas da API (sem dados sensíveis) ───
  apiLogs: defineTable({
    apiKeyId: v.optional(v.id("apiKeysV1")),
    serverId: v.optional(v.string()),
    addonId: v.optional(v.string()),
    deliveryId: v.optional(v.string()),
    endpoint: v.string(),
    method: v.string(),
    statusCode: v.number(),
    durationMs: v.number(),
    ip: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_key", ["apiKeyId"]),

  // ─── Idempotência persistente (Idempotency-Key) ───
  // Guarda a assinatura da requisição e a resposta para REPLAY.
  // Mesma key + mesmo corpo → devolve a mesma resposta sem reexecutar.
  // Mesma key + corpo diferente → 409 IDEMPOTENCY_KEY_REUSED.
  idempotencyKeysV1: defineTable({
    apiKeyId: v.id("apiKeysV1"),
    key: v.string(),
    method: v.string(),
    endpoint: v.string(),
    requestHash: v.string(),
    status: v.number(),
    response: v.any(),
    resourceId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_key", ["apiKeyId", "key"])
    .index("by_createdAt", ["createdAt"]),
};
