import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────
// API v1 — integração de entrega automática (addons Minecraft)
// Tabelas novas: nada existente é alterado ou removido.
// ─────────────────────────────────────────────────────────────

export const API_SCOPES = [
  "deliveries:read",     // consultar fila de entregas (queued_commands, user_queue)
  "deliveries:update",   // confirmar resultado (PATCH /command/{id})
  "users:queue",         // consultar fila por jogador
  "users:schedules",     // consultar agendamentos por jogador
  "server:heartbeat",    // enviar heartbeat
] as const;

export const apiScopeValidator = v.union(...API_SCOPES.map((s) => v.literal(s)));

export const deliveryCommandStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("PROCESSING"),
  v.literal("DONE"),
  v.literal("FAILED"),
  v.literal("CANCELED"),
);

// Ação de entrega de um produto (qualquer addon pode registrar suas ações)
export const deliveryActionValidator = v.object({
  addonId: v.string(),            // economy | ranks | kits | custom…
  action: v.string(),             // ADD_MONEY, ADD_RANK, RUN_COMMAND…
  command: v.optional(v.string()),// string opcional p/ addons que interpretam comandos
  payload: v.optional(v.any()),   // JSON livre interpretado pelo addon
  serverId: v.optional(v.string()),// undefined/"" = GLOBAL
  offlineExecute: v.boolean(),    // pode executar com jogador offline?
  delaySeconds: v.optional(v.number()), // agendar: 0 = imediato
  reverseAction: v.optional(v.object({ // ação de reversão (reembolso/cancelamento)
    addonId: v.string(),
    action: v.string(),
    payload: v.optional(v.any()),
  })),
});

// Chaves de API (hash SHA-256; token completo NUNCA é armazenado)
export const apiKeysV1 = defineTable({
  name: v.string(),
  description: v.optional(v.string()),
  serverId: v.string(),            // survival-01… ou "GLOBAL"
  addonId: v.optional(v.string()), // opcional: restringe a um addon
  prefix: v.string(),              // ex.: sk_live_1a2b (para lookup rápido)
  keyHash: v.string(),             // SHA-256 hex do token completo
  lastFour: v.string(),            // últimos 4 chars exibidos no painel
  scopes: v.array(apiScopeValidator),
  active: v.boolean(),
  lastUsedAt: v.optional(v.number()),
  lastUsedIp: v.optional(v.string()),
  revokedAt: v.optional(v.number()),
  regeneratedAt: v.optional(v.number()),
  createdAt: v.number(),
  createdBy: v.optional(v.string()),
})
  .index("by_prefix", ["prefix"])
  .index("by_hash", ["keyHash"]);

// Fila de entregas/comandos automáticos
export const deliveryCommands = defineTable({
  orderId: v.id("orders"),
  orderNumber: v.string(),
  orderItemIndex: v.number(),      // índice do item no pedido
  productId: v.id("products"),
  productName: v.string(),
  quantity: v.number(),
  serverId: v.string(),            // alvo; "GLOBAL" = qualquer servidor autorizado
  addonId: v.string(),
  clientIdentifier: v.string(),    // nickname/XUID/ID do jogador
  action: v.string(),
  command: v.optional(v.string()),
  payload: v.optional(v.any()),
  variables: v.optional(v.array(v.object({ name: v.string(), value: v.string() }))),
  offlineExecute: v.boolean(),
  executeAt: v.number(),           // <= now ⇒ elegível
  status: deliveryCommandStatusValidator,
  response: v.optional(v.string()),
  reason: v.optional(v.string()),
  attempts: v.number(),
  maxAttempts: v.number(),
  claimedBy: v.optional(v.string()),   // id do claim (addon/server instância)
  claimedAt: v.optional(v.number()),
  claimExpiresAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  lastAttemptAt: v.optional(v.number()),
  idempotencyKey: v.string(),      // orderId:itemIndex:actionIndex — UNIQUE
  apiKeyId: v.optional(v.id("apiKeysV1")), // chave do último uso
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_idempotency", ["idempotencyKey"])
  .index("by_status_executeAt", ["status", "executeAt"])
  .index("by_client", ["clientIdentifier"])
  .index("by_server_status", ["serverId", "status"])
  .index("by_order", ["orderId"]);

// Histórico de tentativas de entrega
export const deliveryAttempts = defineTable({
  deliveryId: v.id("deliveryCommands"),
  apiKeyId: v.optional(v.id("apiKeysV1")),
  serverId: v.optional(v.string()),
  addonId: v.optional(v.string()),
  status: v.string(),              // DONE | FAILED | PENDING | CLAIM | RELEASE
  response: v.optional(v.string()),
  reason: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
}).index("by_delivery", ["deliveryId"]);

// Servidores/addons que se conectam (heartbeat)
export const addonServers = defineTable({
  serverId: v.string(),
  name: v.optional(v.string()),
  addonId: v.optional(v.string()),
  version: v.optional(v.string()),
  minecraftVersion: v.optional(v.string()),
  lastIp: v.optional(v.string()),
  lastSeenAt: v.number(),
  createdAt: v.number(),
}).index("by_server", ["serverId"]);

// Logs de uso da API (sem dados sensíveis; nunca a chave completa)
export const apiLogs = defineTable({
  apiKeyId: v.optional(v.id("apiKeysV1")),
  serverId: v.optional(v.string()),
  addonId: v.optional(v.string()),
  deliveryId: v.optional(v.id("deliveryCommands")),
  endpoint: v.string(),
  method: v.string(),
  statusCode: v.number(),
  durationMs: v.number(),
  error: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_createdAt", ["createdAt"]).index("by_key", ["apiKeyId"]);
