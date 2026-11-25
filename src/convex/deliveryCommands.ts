import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { computeQueueCountsReal, moveQueueCount, readQueueCounts } from "./lib/queueStats";
import { generateDeliveryId } from "./lib/hash";
import {
  deliveryV1ToRecipe,
  normalizeActionForQuantity,
  resolveActionParts,
} from "./lib/deliveryRecipe";
import {
  computeOrderDeliveryState,
  syncOrderDeliveryStatus as syncOrderStatus,
} from "./lib/orderDeliveryStatus";
import { DELIVERY_EVENT, logDeliveryEvent, resendInfo, deliveryConsoleLine } from "./lib/deliveryLog";

// Versão do schema do documento de entrega (permite evoluir sem quebrar
// entregas antigas, que não possuem este campo).
const DELIVERY_SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────
// Fila de entregas automáticas (delivery_commands)
//
// pending → (claim) PROCESSING → DONE | PENDING(retry) | FAILED | CANCELED
//
// Criação 100% idempotente: a chave `idempotencyKey`
// (orderId:itemIndex:actionIndex[:reverse]) impede duplicação mesmo se o
// gateway enviar a confirmação de pagamento duas vezes.
// ─────────────────────────────────────────────────────────────

const BACKOFFS_MS = [60_000, 300_000, 900_000, 3_600_000, 7_200_000];

function isVisibleToServer(commandServerId: string, keyServerId: string): boolean {
  if (keyServerId === "GLOBAL" || !keyServerId) return true;
  return commandServerId === keyServerId || commandServerId === "GLOBAL";
}

function toApiShape(doc: any) {
  return {
    id: doc.publicId,
    server_id: doc.serverId,
    addon_id: doc.addonId,
    action: doc.action,
    action_id: doc.actionId ?? null,
    step_index: doc.stepIndex ?? null,
    delivery_group_id: doc.deliveryGroupId ?? null,
    mode: doc.deliveryMode ?? "SERVER",
    reference_id: doc.referenceId ?? null,
    reference_revision: doc.referenceRevision ?? null,
    // parte física (shulker) do kit: o addon entrega apenas esta parte e
    // confirma este comando individualmente.
    unit_index: doc.unitIndex ?? null,
    part_index: doc.partIndex ?? null,
    part_total: doc.partTotal ?? null,
    part_id: doc.partId ?? null,
    part_label: doc.partLabel ?? null,
    command: doc.command ?? null,
    payload: doc.payload ?? {},
    offline_execute: doc.offlineExecute,
    execute_at: new Date(doc.executeAt).toISOString(),
    status: doc.status,
    attempts: doc.attempts,
    max_attempts: doc.maxAttempts,
    error_code: doc.errorCode ?? null,
    retryable: doc.retryable ?? null,
    next_attempt_at: doc.nextAttemptAt ? new Date(doc.nextAttemptAt).toISOString() : null,
    requires_manual_intervention: doc.requiresManualIntervention ?? false,
    // Reenvio pelo painel (null quando nunca foi reenviada) + linha pronta
    // para o addon imprimir no console do servidor.
    resent: resendInfo(doc),
    console_log: deliveryConsoleLine(doc),
    order: {
      id: doc.orderNumber,
      client_identifier: doc.clientIdentifier,
      variables: doc.variables,
    },
  };
}

function toAdminShape(doc: any) {
  return {
    _id: doc._id as string,
    id: doc.publicId,
    orderId: doc.orderId as string,
    orderNumber: doc.orderNumber,
    productName: doc.productName,
    clientIdentifier: doc.clientIdentifier,
    serverId: doc.serverId,
    addonId: doc.addonId,
    action: doc.action,
    actionId: doc.actionId ?? "",
    stepIndex: doc.stepIndex ?? null,
    deliveryGroupId: doc.deliveryGroupId ?? "",
    deliveryMode: doc.deliveryMode ?? "SERVER",
    referenceId: doc.referenceId ?? "",
    referenceRevision: doc.referenceRevision ?? null,
    unitIndex: doc.unitIndex ?? null,
    partIndex: doc.partIndex ?? null,
    partTotal: doc.partTotal ?? null,
    partId: doc.partId ?? "",
    partLabel: doc.partLabel ?? "",
    command: doc.command ?? "",
    payload: doc.payload ?? null,
    offlineExecute: doc.offlineExecute,
    status: doc.status,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    errorCode: doc.errorCode ?? "",
    lastError: doc.lastError ?? "",
    retryable: doc.retryable ?? null,
    nextAttemptAt: doc.nextAttemptAt ?? null,
    requiresManualIntervention: doc.requiresManualIntervention ?? false,
    claimToken: doc.claimToken ?? "",
    claimExpiresAt: doc.claimExpiresAt ?? null,
    response: doc.response ?? "",
    reason: doc.reason ?? "",
    executeAt: doc.executeAt,
    createdAt: doc.createdAt,
    completedAt: doc.completedAt,
    lastAttemptAt: doc.lastAttemptAt,
    resentBy: doc.resentBy ?? "",
    resentAt: doc.resentAt ?? null,
    resendCount: doc.resendCount ?? 0,
  };
}

function toEventShape(doc: any) {
  return {
    _id: doc._id as string,
    deliveryId: doc.deliveryId as string,
    publicId: doc.publicId,
    orderNumber: doc.orderNumber,
    type: doc.type,
    status: doc.status ?? "",
    message: doc.message ?? "",
    actor: doc.actor,
    actorName: doc.actorName ?? "",
    serverId: doc.serverId ?? "",
    addonId: doc.addonId ?? "",
    apiKeyId: doc.apiKeyId ? String(doc.apiKeyId) : "",
    details: doc.details ?? null,
    createdAt: doc.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────
// Criação automática no pagamento aprovado
// ─────────────────────────────────────────────────────────────

export const internalCreateForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order: any = await ctx.db.get(orderId);
    if (!order) return { created: 0 };
    const clientIdentifier =
      order.minecraftNick ?? order.uuidField ?? order.discord ?? order.customerEmail;
    const now = Date.now();
    let created = 0;

    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      const product: any = await ctx.db.get(item.productId);
      const cfg = product?.deliveryV1;
      if (!product || !cfg?.enabled || !Array.isArray(cfg.actions) || cfg.actions.length === 0) {
        continue;
      }
      // snapshot da receita no momento da compra (compras antigas não mudam)
      const recipeSnapshot = deliveryV1ToRecipe(cfg);
      for (let j = 0; j < cfg.actions.length; j++) {
        const action = cfg.actions[j];
        if (!action?.action) continue;
        const idempotencyKey = `${orderId}:${i}:${j}`;

        const existing = await ctx.db
          .query("deliveryCommands")
          .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
          .first();
        if (existing) continue; // nunca duplica

        // Configuração inválida: LOCAL_REFERENCE sem referência local NUNCA vira
        // uma entrega vazia. Criamos um comando de erro visível (não retentável,
        // exigindo intervenção manual) para o operador corrigir o produto; o
        // addon não o pega (não é PENDING) nem pode marcá-lo como DONE.
        if (
          action.mode === "LOCAL_REFERENCE" &&
          !(typeof action.referenceId === "string" && action.referenceId.trim())
        ) {
          const errorPublicId = generateDeliveryId();
          const errorId = await ctx.db.insert("deliveryCommands", {
            publicId: errorPublicId,
            idempotencyKey,
            orderId,
            orderNumber: order.number,
            orderItemIndex: i,
            productId: product._id,
            productName: product.name,
            serverId: action.serverId?.trim() || "GLOBAL",
            addonId: action.addonId?.trim() || "custom",
            clientIdentifier,
            action: action.action,
            actionId: action.actionId ?? `a${j}`,
            stepIndex: j,
            deliveryGroupId: `${orderId}:${i}`,
            deliveryMode: "LOCAL_REFERENCE",
            variables: [],
            offlineExecute: action.offlineExecute ?? true,
            executeAt: now,
            status: "FAILED",
            attempts: 0,
            maxAttempts: 5,
            errorCode: "CONFIGURATION_ERROR",
            lastError: `Produto "${product.name}": ação LOCAL_REFERENCE sem reference_id. Corrija a receita do produto.`,
            retryable: false,
            requiresManualIntervention: true,
            schemaVersion: DELIVERY_SCHEMA_VERSION,
            createdAt: now,
            updatedAt: now,
          });
          await logDeliveryEvent(ctx, {
            deliveryId: errorId,
            publicId: errorPublicId,
            orderId,
            orderNumber: order.number,
            type: DELIVERY_EVENT.created,
            status: "FAILED",
            message: `Receita inválida: ${action.action} em LOCAL_REFERENCE sem reference_id (produto "${product.name}")`,
            actor: "SYSTEM",
            serverId: action.serverId?.trim() || "GLOBAL",
            addonId: action.addonId?.trim() || "custom",
            details: { errorCode: "CONFIGURATION_ERROR", referenceId: null },
          });
          await moveQueueCount(ctx, undefined, "FAILED");
          created++;
          continue;
        }

        const serverId = action.serverId?.trim() || "GLOBAL";
        const addonId = action.addonId?.trim() || "custom";
        const executeAt = now + Math.max(0, action.delaySeconds ?? 0) * 1000;
        // Normaliza a ação pela quantidade comprada (MULTIPLY/REPEAT/IGNORE)
        const qty = Math.max(1, Math.trunc(item.quantity ?? 1));
        const { payload: normalizedPayload, repeat: units } = normalizeActionForQuantity(action, qty);
        const variables = [
          { name: "nickname", value: clientIdentifier },
          { name: "produto", value: item.name ?? product.name },
          { name: "produto_id", value: String(product._id) },
          { name: "quantidade", value: String(qty) },
          { name: "pedido", value: order.number },
        ];

        // Composição física da ação: para kits, uma entrada por shulker.
        // Sem `parts` (produtos antigos) é uma parte única — igual a antes.
        const parts = resolveActionParts(action);
        const usesParts =
          parts.length > 1 || (Array.isArray(action.parts) && action.parts.length > 0);

        // Chave idempotente estável:
        //   unidade 1/parte 1 → orderId:item:action (chave antiga)
        //   unidade 2/parte 1 → …:u2       (chave antiga)
        //   unidade 1/parte 2 → …:p2
        //   unidade 2/parte 3 → …:u2:p3
        const keyForPart = (unit: number, part: number) => {
          let key = idempotencyKey;
          if (unit > 0) key += `:u${unit + 1}`;
          if (part > 0) key += `:p${part + 1}`;
          return key;
        };

        // Um comando por unidade comprada × shulker. O addon entrega UMA parte
        // por comando e confirma cada uma separadamente; o pedido só fecha
        // quando todas as partes de todas as unidades estiverem DONE.
        // Antes: um comando por unidade fazia quem comprava um kit de 3
        // shulkers receber só a primeira (as demais nunca eram enfileiradas).
        for (let unit = 0; unit < units; unit++) {
          const unitBaseKey =
            unit === 0 ? idempotencyKey : `${idempotencyKey}:u${unit + 1}`;

          for (const part of parts) {
            const unitKey = keyForPart(unit, part.index);
            const already = await ctx.db
              .query("deliveryCommands")
              .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", unitKey))
              .first();
            if (already) continue;

            const partPayload = usesParts
              ? {
                  ...(normalizedPayload && typeof normalizedPayload === "object"
                    ? normalizedPayload
                    : {}),
                  kit_part: {
                    index: part.index,
                    total: part.total,
                    id: part.id,
                    label: part.label,
                    contents: part.contentsPreview ?? [],
                  },
                }
              : normalizedPayload;
            const partVariables = usesParts
              ? [
                  ...variables,
                  { name: "parte", value: `${part.index + 1}/${part.total}` },
                  { name: "parte_id", value: part.id },
                  { name: "parte_nome", value: part.label },
                ]
              : variables;

            const commandPublicId = generateDeliveryId();
            const commandId = await ctx.db.insert("deliveryCommands", {
              publicId: commandPublicId,
              idempotencyKey: unitKey,
              orderId,
              orderNumber: order.number,
              orderItemIndex: i,
              productId: product._id,
              productName: product.name,
              serverId,
              addonId,
              clientIdentifier,
              action: action.action,
              actionId: action.actionId ?? `a${j}`,
              // Com várias partes, o step é a própria shulker (compatível com
              // addons que sempre trataram `step_index` como índice da shulker).
              stepIndex: usesParts && parts.length > 1 ? part.index : j,
              deliveryGroupId: `${orderId}:${i}`,
              deliveryMode: action.mode ?? "SERVER",
              referenceId: part.referenceId ?? action.referenceId ?? undefined,
              referenceRevision: part.referenceRevision ?? action.referenceRevision ?? undefined,
              command: action.command?.trim() || undefined,
              payload: partPayload ?? undefined,
              recipeSnapshot,
              variables: partVariables,
              offlineExecute: action.offlineExecute ?? true,
              executeAt: executeAt + part.index * 1000,
              status: "PENDING",
              attempts: 0,
              maxAttempts: 5,
              schemaVersion: DELIVERY_SCHEMA_VERSION,
              ...(usesParts
                ? {
                    unitIndex: unit,
                    partIndex: part.index,
                    partTotal: part.total,
                    partId: part.id,
                    partLabel: part.label,
                  }
                : {}),
              reverseAction: action.reverseAction?.trim() || undefined,
              reversePayload: action.reversePayload ?? undefined,
              reverseDelaySeconds: action.reverseDelaySeconds ?? undefined,
              createdAt: now,
              updatedAt: now,
            });
            await logDeliveryEvent(ctx, {
              deliveryId: commandId,
              publicId: commandPublicId,
              orderId,
              orderNumber: order.number,
              type: DELIVERY_EVENT.created,
              status: "PENDING",
              message: `Fila criada: ${action.action}${
                action.mode === "LOCAL_REFERENCE" && (part.referenceId ?? action.referenceId)
                  ? ` (local: ${part.referenceId ?? action.referenceId})`
                  : ""
              } · unidade ${unit + 1}/${units}${
                usesParts ? ` · shulker ${part.index + 1}/${part.total} (${part.label})` : ""
              }`,
              actor: "SYSTEM",
              serverId,
              addonId,
              details: {
                mode: action.mode ?? "SERVER",
                referenceId: part.referenceId ?? action.referenceId ?? null,
                command: action.command?.trim() || null,
                quantity: qty,
                unit: unit + 1,
                units,
                partIndex: usesParts ? part.index : null,
                partTotal: usesParts ? part.total : null,
                partLabel: usesParts ? part.label : null,
                offlineExecute: action.offlineExecute ?? true,
                actionId: action.actionId ?? `a${j}`,
                stepIndex: j,
              },
            });
            await moveQueueCount(ctx, undefined, "PENDING");
            created++;
          }

          // Agendamento de reversão (ex.: VIP 30 dias → REMOVE_RANK depois) —
          // uma vez por unidade, independente do número de shulkers.
          if (action.reverseAction) {
            const reverseKey = `${unitBaseKey}:reverse`;
            const reverseExisting = await ctx.db
              .query("deliveryCommands")
              .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", reverseKey))
              .first();
            if (!reverseExisting) {
              const reversePublicId = generateDeliveryId();
              const reverseId = await ctx.db.insert("deliveryCommands", {
                publicId: reversePublicId,
                idempotencyKey: reverseKey,
                orderId,
                orderNumber: order.number,
                orderItemIndex: i,
                productId: product._id,
                productName: product.name,
                serverId,
                addonId,
                clientIdentifier,
                action: action.reverseAction,
                payload: action.reversePayload ?? undefined,
                recipeSnapshot,
                variables,
                offlineExecute: action.offlineExecute ?? true,
                executeAt: executeAt + Math.max(0, action.reverseDelaySeconds ?? 0) * 1000,
                status: "PENDING",
                attempts: 0,
                maxAttempts: 5,
                schemaVersion: DELIVERY_SCHEMA_VERSION,
                createdAt: now,
                updatedAt: now,
              });
              await logDeliveryEvent(ctx, {
                deliveryId: reverseId,
                publicId: reversePublicId,
                orderId,
                orderNumber: order.number,
                type: DELIVERY_EVENT.reversalQueued,
                status: "PENDING",
                message: `Reversão agendada: ${action.reverseAction} em ${Math.max(0, action.reverseDelaySeconds ?? 0)}s`,
                actor: "SYSTEM",
                serverId,
                addonId,
                details: { reverseDelaySeconds: action.reverseDelaySeconds ?? 0 },
              });
              await moveQueueCount(ctx, undefined, "PENDING");
              created++;
            }
          }
        }
      }
    }
    return { created };
  },
});

/** Cancela entregas pendentes do pedido (cancelamento/reembolso). */
export const internalCancelForOrder = internalMutation({
  args: { orderId: v.id("orders"), reason: v.optional(v.string()) },
  handler: async (ctx, { orderId, reason }) => {
    const now = Date.now();
    const commands: any[] = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    let canceled = 0;
    let reversed = 0;
    for (const c of commands) {
      if (c.status === "PENDING" || c.status === "PROCESSING") {
        await ctx.db.patch(c._id, {
          status: "CANCELED",
          response: "Cancelado",
          reason: reason ?? "Pedido cancelado ou reembolsado",
          claimedBy: undefined,
          claimedAt: undefined,
          claimExpiresAt: undefined,
          claimToken: undefined,
          completedAt: now,
          updatedAt: now,
        });          await logDeliveryEvent(ctx, {
            deliveryId: c._id,
            publicId: c.publicId,
            orderId: c.orderId,
            orderNumber: c.orderNumber,
            type: DELIVERY_EVENT.canceled,
            status: "CANCELED",
            message: reason ?? "Pedido cancelado ou reembolsado",
            actor: "SYSTEM",
            serverId: c.serverId,
            addonId: c.addonId,
          });
          await moveQueueCount(ctx, c.status, "CANCELED");
          canceled++;
      } else if (c.status === "DONE" && c.reverseAction) {
        // reversão segura apenas quando configurada no produto
        const reverseKey = `${c.idempotencyKey}:refund`;
        const existing = await ctx.db
          .query("deliveryCommands")
          .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", reverseKey))
          .first();
        if (!existing) {
          const reversePublicId = generateDeliveryId();
          const reverseId = await ctx.db.insert("deliveryCommands", {
            publicId: reversePublicId,
            idempotencyKey: reverseKey,
            orderId: c.orderId,
            orderNumber: c.orderNumber,
            orderItemIndex: c.orderItemIndex,
            productId: c.productId,
            productName: c.productName,
            serverId: c.serverId,
            addonId: c.addonId,
            clientIdentifier: c.clientIdentifier,
            action: c.reverseAction,
            payload: c.reversePayload ?? undefined,
            variables: c.variables,
            offlineExecute: c.offlineExecute,
            executeAt: now,
            status: "PENDING",
            attempts: 0,
            maxAttempts: 5,
            createdAt: now,
            updatedAt: now,
          });
          await logDeliveryEvent(ctx, {
            deliveryId: reverseId,
            publicId: reversePublicId,
            orderId: c.orderId,
            orderNumber: c.orderNumber,
            type: DELIVERY_EVENT.reversalQueued,
            status: "PENDING",
            message: `Reversão do reembolso: ${c.reverseAction}`,
            actor: "SYSTEM",
            serverId: c.serverId,
            addonId: c.addonId,
          });
          await moveQueueCount(ctx, undefined, "PENDING");
          reversed++;
        }
      }
    }
    return { canceled, reversed };
  },
});

// ─────────────────────────────────────────────────────────────
// Leituras internas (usadas pela API v1)
// ─────────────────────────────────────────────────────────────

type ListQueuedArgs = {
  serverId: string;
  addonId?: string;
  limit: number;
  now: number;
};

/** Núcleo da listagem da fila (reutilizado pela rota fundida). */
export async function listQueuedCore(
  ctx: QueryCtx,
  { serverId, addonId, limit, now }: ListQueuedArgs,
) {
    const servers = serverId === "GLOBAL" ? ["GLOBAL"] : [serverId, "GLOBAL"];
    const collected: any[] = [];
    // Índice composto + janela de leitura: não lê as agendadas para o futuro
    // nem o histórico do servidor para montar a prévia da fila.
    const window = Math.max(20, Math.min(limit, 100) * 3);
    for (const sid of servers) {
      const rows = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status_executeAt", (q) =>
          q.eq("serverId", sid).eq("status", "PENDING").lte("executeAt", now),
        )
        .take(window);
      for (const r of rows) {
        if (addonId && r.addonId !== addonId) continue;
        collected.push(r);
      }
    }
  return collected
    .sort((a, b) => a.executeAt - b.executeAt || a.createdAt - b.createdAt)
    .slice(0, limit)
    .map(toApiShape);
}

export const internalListQueued = internalQuery({
  args: {
    serverId: v.string(),
    addonId: v.optional(v.string()),
    limit: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => listQueuedCore(ctx, args),
});

export const internalUserQueue = internalQuery({
  args: { clientIdentifier: v.string(), serverId: v.string(), now: v.number() },
  handler: async (ctx, { clientIdentifier, serverId, now }) => {
    const rows = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_client", (q) => q.eq("clientIdentifier", clientIdentifier))
      .collect();
    return rows
      .filter(
        (r) =>
          r.status === "PENDING" &&
          r.executeAt <= now &&
          isVisibleToServer(r.serverId, serverId),
      )
      .sort((a, b) => a.executeAt - b.executeAt)
      .map(toApiShape);
  },
});

export const internalUserSchedules = internalQuery({
  args: { clientIdentifier: v.string(), serverId: v.string(), now: v.number() },
  handler: async (ctx, { clientIdentifier, serverId, now }) => {
    const rows = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_client", (q) => q.eq("clientIdentifier", clientIdentifier))
      .collect();
    return rows
      .filter(
        (r) =>
          r.status === "PENDING" &&
          r.executeAt > now &&
          isVisibleToServer(r.serverId, serverId),
      )
      .sort((a, b) => a.executeAt - b.executeAt)
      .map(toApiShape);
  },
});

export const internalGetCommand = internalQuery({
  args: { publicId: v.string() },
  handler: async (ctx, { publicId }) => {
    return await ctx.db
      .query("deliveryCommands")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
      .first();
  },
});

export { BACKOFFS_MS, isVisibleToServer };

// ─────────────────────────────────────────────────────────────
// Painel administrativo
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Listagem do painel — paginada por cursor
//
// Antes: `collect()` da tabela inteira (histórico completo de entregas) para
// exibir uma página. Agora: uma página por vez, com cursor opaco do Convex,
// ordenada por `createdAt` desc (ou status + createdAt desc quando há filtro).
// Os badges das abas vêm do documento de contadores (lib/queueStats.ts), não
// de uma varredura. Filtros e ordenação continuam iguais.
// ─────────────────────────────────────────────────────────────

const ADMIN_PAGE_SIZE = 50;
const ADMIN_FILTER_SCAN_FACTOR = 5;
const SCHEDULED_COUNT_CAP = 1000;

function clampLimit(limit?: number) {
  return Math.min(Math.max(Math.floor(limit ?? ADMIN_PAGE_SIZE), 1), 100);
}

export const adminList = query({
  args: {
    status: v.optional(v.string()),
    // "only" = agendadas para o futuro; "due" = prontas para o addon.
    scheduled: v.optional(v.union(v.literal("only"), v.literal("due"))),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, scheduled, cursor, limit }) => {
    await requireAdmin(ctx, "deliveries.view");
    const now = Date.now();
    const numItems = clampLimit(limit);

    const buildQuery = () =>
      status
        ? ctx.db
            .query("deliveryCommands")
            .withIndex("by_status_createdAt", (q) => q.eq("status", status as any))
            .order("desc")
        : ctx.db.query("deliveryCommands").withIndex("by_createdAt").order("desc");

    // UMA paginação por execução (limite do Convex). O filtro de agendamento é
    // por tempo (`executeAt`), então com ele ativo a janela lida é maior — o
    // cursor continua avançando a partir dela, sem varrer o histórico.
    const scanItems = scheduled ? Math.min(numItems * ADMIN_FILTER_SCAN_FACTOR, 200) : numItems;
    const result = await buildQuery().paginate({ cursor: cursor ?? null, numItems: scanItems });
    const page = result.page.filter((row: any) => {
      if (scheduled === "only") return row.status === "PENDING" && row.executeAt > now;
      if (scheduled === "due") return row.status === "PENDING" && row.executeAt <= now;
      return true;
    });

    const counts = (await readQueueCounts(ctx)) ?? (await computeQueueCountsReal(ctx));

    // Agendadas = PENDING com executeAt no futuro (subconjunto pequeno por
    // natureza: só atrasos configurados no produto). Teto para não varrer; se
    // não existe PENDING nenhum, nem consulta.
    const scheduledRows =
      counts.pending === 0
        ? []
        : await ctx.db
            .query("deliveryCommands")
            .withIndex("by_status_executeAt", (q) =>
              q.eq("status", "PENDING").gt("executeAt", now),
            )
            .take(SCHEDULED_COUNT_CAP + 1);
    const scheduledCount = Math.min(scheduledRows.length, SCHEDULED_COUNT_CAP);

    return {
      page: page.map(toAdminShape),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      counts: {
        ALL: counts.pending + counts.processing + counts.done + counts.failed + counts.canceled,
        PENDING: Math.max(0, counts.pending - scheduledCount),
        SCHEDULED: scheduledCount,
        PROCESSING: counts.processing,
        DONE: counts.done,
        FAILED: counts.failed,
        CANCELED: counts.canceled,
      } satisfies Record<string, number>,
      countsTruncated: scheduledRows.length > SCHEDULED_COUNT_CAP,
    };
  },
});

/** Entregas automáticas de um pedido — mostradas no detalhe do pedido para o
 *  admin ver o que já saiu (ou travou) sem abrir a página de entregas. */
export const adminListByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await requireAdmin(ctx, "deliveries.view");
    const list = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    return list.sort((a, b) => a.createdAt - b.createdAt).map(toAdminShape);
  },
});

export const adminGet = query({
  args: { id: v.id("deliveryCommands") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "deliveries.view");
    const command = await ctx.db.get(id);
    if (!command) return null;
    const attempts = await ctx.db
      .query("deliveryAttempts")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", id))
      .collect();
    attempts.sort((a, b) => b.startedAt - a.startedAt);
    const events = await ctx.db
      .query("deliveryEvents")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", id))
      .collect();
    events.sort((a, b) => a.createdAt - b.createdAt);
    return { command: toAdminShape(command), attempts, events: events.map(toEventShape) };
  },
});

/** Log completo das entregas de um pedido (mais antigo primeiro). É o que o
 *  painel mostra em "Ver log completo" no detalhe do pedido. */
export const adminLogByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await requireAdmin(ctx, "deliveries.view");
    const events = await ctx.db
      .query("deliveryEvents")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    events.sort((a, b) => a.createdAt - b.createdAt);
    return events.map(toEventShape);
  },
});

export const adminRetry = mutation({
  args: { id: v.id("deliveryCommands") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    const c = await ctx.db.get(id);
    if (!c) throw new Error("Entrega não encontrada");
    if (c.status === "DONE") {
      throw new Error("Entrega concluída. Use 'reenviar mesmo assim' com confirmação.");
    }
    await ctx.db.patch(id, {
      status: "PENDING",
      response: undefined,
      reason: undefined,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      claimToken: undefined,
      updatedAt: Date.now(),
    });
    await logDeliveryEvent(ctx, {
      deliveryId: id,
      publicId: c.publicId,
      orderId: c.orderId,
      orderNumber: c.orderNumber,
      type: DELIVERY_EVENT.retried,
      status: "PENDING",
      message: `Devolvida para a fila pelo painel (era ${c.status})`,
      actor: "ADMIN",
      actorName: admin.name,
      serverId: c.serverId,
      addonId: c.addonId,
      details: { fromStatus: c.status, attempts: c.attempts },
    });
    await moveQueueCount(ctx, c.status, "PENDING");
    await logAudit(ctx, admin, "delivery_v1.retry", "deliveryCommands", id, { publicId: c.publicId });
  },
});

/**
 * Devolve a entrega para a fila do addon, em QUALQUER status (inclusive
 * DONE/CANCELED/FAILED). É o botão "Reenviar (dar de novo)" do pedido.
 *
 * Antes ele só trocava o status para PENDING: `attempts`, `lastError` e
 * `requiresManualIntervention` ficavam como estavam, então uma entrega que já
 * tinha esgotado as tentativas voltava "pendente" mas travada na prática.
 * Agora a entrega volta como nova: 0 tentativas, sem erro anterior.
 */
export const adminRedeliver = mutation({
  args: {
    id: v.id("deliveryCommands"),
    confirm: v.boolean(),
    // Reenvio que espera o jogador entrar: marca offlineExecute=false, então o
    // addon devolve PLAYER_OFFLINE e a entrega fica na fila (sem gastar tentativa).
    waitForOnline: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, confirm, waitForOnline }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    if (!confirm) throw new Error("Confirmação obrigatória para reenviar uma entrega.");
    const c = await ctx.db.get(id);
    if (!c) throw new Error("Entrega não encontrada");
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "PENDING",
      executeAt: now,
      completedAt: undefined,
      response: undefined,
      reason: undefined,
      lastError: undefined,
      errorCode: undefined,
      retryable: undefined,
      requiresManualIntervention: false,
      nextAttemptAt: undefined,
      attempts: 0,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      claimToken: undefined,
      // marcas do reenvio: vão no claim do addon (bloco `resent`) e no log
      resentBy: admin.name ?? "painel",
      resentAt: now,
      resendCount: (c.resendCount ?? 0) + 1,
      offlineExecute: waitForOnline ? false : c.offlineExecute,
      updatedAt: now,
    });
    await logDeliveryEvent(ctx, {
      deliveryId: id,
      publicId: c.publicId,
      orderId: c.orderId,
      orderNumber: c.orderNumber,
      type: DELIVERY_EVENT.redelivered,
      status: "PENDING",
      message: waitForOnline
        ? `Reenviada pelo painel — vai esperar o jogador entrar (era ${c.status})`
        : `Reenviada pelo painel (era ${c.status})`,
      actor: "ADMIN",
      actorName: admin.name,
      serverId: c.serverId,
      addonId: c.addonId,
      details: {
        fromStatus: c.status,
        previousAttempts: c.attempts,
        previousError: c.lastError ?? c.errorCode ?? null,
        previousResponse: c.response ?? null,
        resendCount: (c.resendCount ?? 0) + 1,
        waitForOnline: Boolean(waitForOnline),
      },
    });
    await moveQueueCount(ctx, c.status, "PENDING");
    await logAudit(ctx, admin, "delivery_v1.redeliver_done", "deliveryCommands", id, {
      publicId: c.publicId,
      fromStatus: c.status,
      resendCount: (c.resendCount ?? 0) + 1,
      waitForOnline: Boolean(waitForOnline),
    });
    return { ok: true as const };
  },
});

export const adminCancel = mutation({
  args: { id: v.id("deliveryCommands") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    const c = await ctx.db.get(id);
    if (!c) throw new Error("Entrega não encontrada");
    await ctx.db.patch(id, {
      status: "CANCELED",
      response: "Cancelado",
      reason: "Cancelado manualmente no painel",
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      claimToken: undefined,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logDeliveryEvent(ctx, {
      deliveryId: id,
      publicId: c.publicId,
      orderId: c.orderId,
      orderNumber: c.orderNumber,
      type: DELIVERY_EVENT.canceled,
      status: "CANCELED",
      message: `Cancelada pelo painel (era ${c.status})`,
      actor: "ADMIN",
      actorName: admin.name,
      serverId: c.serverId,
      addonId: c.addonId,
      details: { fromStatus: c.status },
    });
    await moveQueueCount(ctx, c.status, "CANCELED");
    await logAudit(ctx, admin, "delivery_v1.cancel", "deliveryCommands", id, { publicId: c.publicId });
  },
});

// ─────────────────────────────────────────────────────────────
// Auditoria de entregas e recuperação de partes faltantes
// ─────────────────────────────────────────────────────────────

/**
 * Varre os pedidos pagos mais recentes e lista os que têm entrega
 * inconsistente: parcial, falha definitiva, ou fila toda DONE com o pedido
 * ainda "pendente" (bug que deixava pedidos entregues abertos).
 *
 * `kitWithoutParts` marca kits publicados sem a composição de shulkers — é
 * exatamente o caso em que o addon entregava só a primeira shulker e o site
 * não tinha como saber quantas faltavam.
 */
async function auditDeliveriesCore(ctx: any, limit?: number) {
  const max = Math.min(Math.max(1, Math.floor(limit ?? 300)), 1000);
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_paymentStatus_createdAt", (q: any) => q.eq("paymentStatus", "paid"))
    .order("desc")
    .take(max);

  const issues: any[] = [];
  for (const order of orders) {
    const commands: any[] = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();
    const legacy: any[] = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();
    const allForward = commands.filter((c) => !/:(reverse|refund)$/.test(c.idempotencyKey));
    // Reenvio/correção de nick cancela a tentativa antiga e cria outra para a
    // MESMA unidade. Cancelado não conta como pendência quando existe uma
    // tentativa nova naquele item/ação/unidade.
    const unitOf = (c: any) =>
      c.unitIndex ??
      Number((String(c.idempotencyKey).match(/:u(\d+)/) ?? [])[1] ?? 1) - 1;
    const groupKeyOf = (c: any) =>
      `${c.orderItemIndex ?? 0}:${c.actionId ?? c.action}:${unitOf(c)}:${c.partIndex ?? 0}`;
    const forwardedUnits = new Set(
      allForward.filter((c) => c.status !== "CANCELED").map(groupKeyOf),
    );
    const forward = allForward.filter(
      (c) => c.status !== "CANCELED" || !forwardedUnits.has(groupKeyOf(c)),
    );
    if (forward.length === 0 && legacy.length === 0) continue;

    const done = forward.filter((c) => c.status === "DONE").length;
    const failed = forward.filter((c) => c.status === "FAILED").length;
    const pending = forward.filter((c) => c.status === "PENDING").length;
    const canceled = allForward.filter((c) => c.status === "CANCELED").length;
    const state = computeOrderDeliveryState(commands, legacy);
    const allDone = forward.every((c) => c.status === "DONE");
    const kitWithoutParts = forward.some(
      (c) => c.action === "GIVE_KIT" && c.partTotal == null,
    );

    let issue: string | null = null;
    if (state === "delivered" && order.deliveryStatus !== "delivered") {
      issue = "delivered_but_order_pending";
    } else if (
      done > 0 &&
      forward.some((c) => c.status === "PENDING" || c.status === "PROCESSING" || c.status === "FAILED")
    ) {
      issue = "partial";
    } else if (state === "failed") {
      issue = "failed";
    }
    if (!issue) continue;

    issues.push({
      orderId: order._id,
      number: order.number,
      minecraftNick: order.minecraftNick ?? "",
      customerEmail: order.customerEmail,
      deliveryStatus: order.deliveryStatus,
      paidAt: order.paidAt ?? order.createdAt,
      totalCents: order.totalCents,
      expected: forward.length,
      done,
      pending,
      failed,
      canceled,
      computed: state,
      issue,
      kitWithoutParts,
      parts: forward.map((c) => ({
        productName: c.productName,
        action: c.action,
        partIndex: c.partIndex ?? null,
        partTotal: c.partTotal ?? null,
        partLabel: c.partLabel ?? "",
        status: c.status,
      })),
    });
  }
  return issues;
}

/** Recalcula o status de entrega de UM pedido (operações/recuperação). */
export const internalSyncOrderDeliveryStatus = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => ({
    status: await syncOrderStatus(ctx, orderId),
  }),
});

export const internalAuditDeliveries = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => auditDeliveriesCore(ctx, limit),
});

export const adminAuditDeliveries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx, "deliveries.view");
    return await auditDeliveriesCore(ctx, limit);
  },
});

/**
 * Recria SOMENTE as partes (shulkers) que declaradamente faltam no pedido.
 *
 * Só age em ações com `parts` configuradas no produto: sem a composição de
 * shulkers não é possível saber o que falta, e inventar comandos poderia dar
 * itens duplicados. A chave idempotente de cada parte impede recriação.
 *
 * Uso: publicar o kit com `parts` (uma por shulker) e rodar isto no pedido.
 */
export const adminRecoverMissingParts = mutation({
  args: { orderId: v.id("orders"), confirm: v.boolean() },
  handler: async (ctx, { orderId, confirm }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    if (!confirm) {
      throw new Error("Confirmação obrigatória para recuperar partes faltantes.");
    }
    const order: any = await ctx.db.get(orderId);
    if (!order) throw new Error("Pedido não encontrado");

    const existing: any[] = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    const existingKeys = new Set(existing.map((c) => c.idempotencyKey));
    const now = Date.now();
    let created = 0;
    const createdParts: any[] = [];

    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      const product: any = await ctx.db.get(item.productId);
      const cfg = product?.deliveryV1;
      if (!cfg?.enabled || !Array.isArray(cfg.actions)) continue;
      const recipeSnapshot = deliveryV1ToRecipe(cfg);
      const qty = Math.max(1, Math.trunc(item.quantity ?? 1));

      for (let j = 0; j < cfg.actions.length; j++) {
        const action = cfg.actions[j];
        if (!action?.action) continue;
        const parts = resolveActionParts(action);
        if (parts.length <= 1) continue; // sem composição de shulkers

        const base = `${orderId}:${i}:${j}`;
        for (let unit = 0; unit < qty; unit++) {
          for (const part of parts) {
            let key = base;
            if (unit > 0) key += `:u${unit + 1}`;
            if (part.index > 0) key += `:p${part.index + 1}`;
            if (existingKeys.has(key)) continue;

            const publicId = generateDeliveryId();
            const commandId = await ctx.db.insert("deliveryCommands", {
              publicId,
              idempotencyKey: key,
              orderId,
              orderNumber: order.number,
              orderItemIndex: i,
              productId: product._id,
              productName: product.name,
              serverId: action.serverId?.trim() || "GLOBAL",
              addonId: action.addonId?.trim() || "custom",
              clientIdentifier:
                order.minecraftNick ?? order.uuidField ?? order.discord ?? order.customerEmail,
              action: action.action,
              actionId: action.actionId ?? `a${j}`,
              stepIndex: part.index,
              deliveryGroupId: `${orderId}:${i}`,
              deliveryMode: action.mode ?? "SERVER",
              referenceId: part.referenceId ?? action.referenceId ?? undefined,
              referenceRevision: part.referenceRevision ?? action.referenceRevision ?? undefined,
              command: action.command?.trim() || undefined,
              payload: {
                ...(action.payload && typeof action.payload === "object" ? action.payload : {}),
                kit_part: {
                  index: part.index,
                  total: part.total,
                  id: part.id,
                  label: part.label,
                  contents: part.contentsPreview ?? [],
                },
              },
              recipeSnapshot,
              variables: [
                { name: "nickname", value: order.minecraftNick ?? "" },
                { name: "produto", value: item.name ?? product.name },
                { name: "produto_id", value: String(product._id) },
                { name: "quantidade", value: String(qty) },
                { name: "pedido", value: order.number },
                { name: "parte", value: `${part.index + 1}/${part.total}` },
                { name: "parte_id", value: part.id },
                { name: "parte_nome", value: part.label },
              ],
              offlineExecute: action.offlineExecute ?? true,
              executeAt: now,
              status: "PENDING",
              attempts: 0,
              maxAttempts: 5,
              schemaVersion: DELIVERY_SCHEMA_VERSION,
              unitIndex: unit,
              partIndex: part.index,
              partTotal: part.total,
              partId: part.id,
              partLabel: part.label,
              resentBy: admin.name ?? "painel",
              resentAt: now,
              createdAt: now,
              updatedAt: now,
            });
            await logDeliveryEvent(ctx, {
              deliveryId: commandId,
              publicId,
              orderId,
              orderNumber: order.number,
              type: DELIVERY_EVENT.created,
              status: "PENDING",
              message: `Parte faltante enfileirada: ${action.action} · unidade ${unit + 1}/${qty} · shulker ${part.index + 1}/${part.total} (${part.label})`,
              actor: "ADMIN",
              actorName: admin.name,
              serverId: action.serverId?.trim() || "GLOBAL",
              addonId: action.addonId?.trim() || "custom",
              details: { partIndex: part.index, partTotal: part.total, partLabel: part.label, unit: unit + 1 },
            });
            await moveQueueCount(ctx, undefined, "PENDING");
            existingKeys.add(key);
            created++;
            createdParts.push({
              productName: product.name,
              unit: unit + 1,
              part: part.index + 1,
              total: part.total,
              label: part.label,
            });
          }
        }
      }
    }

    if (created > 0) {
      await ctx.db.patch(orderId, {
        deliveryStatus: "pending",
        updatedAt: now,
        statusHistory: [
          ...order.statusHistory,
          {
            status: "pending",
            at: now,
            note: `Recuperação de partes faltantes por ${admin.name}: ${created} comando(s) enfileirado(s)`,
          },
        ],
      });
    }
    await logAudit(ctx, admin, "order.recover_missing_parts", "order", orderId, {
      created,
      parts: createdParts,
    });
    return { created, parts: createdParts };
  },
});
