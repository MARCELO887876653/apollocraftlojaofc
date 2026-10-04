import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { generateDeliveryId } from "./lib/hash";
import { deliveryV1ToRecipe, normalizeActionForQuantity } from "./lib/deliveryRecipe";

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

        const serverId = action.serverId?.trim() || "GLOBAL";
        const addonId = action.addonId?.trim() || "custom";
        const executeAt = now + Math.max(0, action.delaySeconds ?? 0) * 1000;
        // Normaliza a ação pela quantidade comprada (MULTIPLY/REPEAT/IGNORE)
        const qty = Math.max(1, Math.trunc(item.quantity ?? 1));
        const { payload: normalizedPayload, repeat } = normalizeActionForQuantity(action, qty);
        const variables = [
          { name: "nickname", value: clientIdentifier },
          { name: "produto", value: item.name ?? product.name },
          { name: "produto_id", value: String(product._id) },
          { name: "quantidade", value: String(qty) },
          { name: "pedido", value: order.number },
        ];
        if (repeat > 1) variables.push({ name: "repeat", value: String(repeat) });

        await ctx.db.insert("deliveryCommands", {
          publicId: generateDeliveryId(),
          idempotencyKey,
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
          stepIndex: j,
          deliveryGroupId: `${orderId}:${i}`,
          deliveryMode: action.mode ?? "SERVER",
          referenceId: action.referenceId ?? undefined,
          referenceRevision: action.referenceRevision ?? undefined,
          command: action.command?.trim() || undefined,
          payload: normalizedPayload ?? undefined,
          recipeSnapshot,
          variables,
          offlineExecute: action.offlineExecute ?? true,
          executeAt,
          status: "PENDING",
          attempts: 0,
          maxAttempts: 5,
          schemaVersion: DELIVERY_SCHEMA_VERSION,
          reverseAction: action.reverseAction?.trim() || undefined,
          reversePayload: action.reversePayload ?? undefined,
          reverseDelaySeconds: action.reverseDelaySeconds ?? undefined,
          createdAt: now,
          updatedAt: now,
        });
        created++;

        // Agendamento de reversão (ex.: VIP 30 dias → REMOVE_RANK depois)
        if (action.reverseAction) {
          const reverseKey = `${idempotencyKey}:reverse`;
          const reverseExisting = await ctx.db
            .query("deliveryCommands")
            .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", reverseKey))
            .first();
          if (!reverseExisting) {
            await ctx.db.insert("deliveryCommands", {
              publicId: generateDeliveryId(),
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
            created++;
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
        });
        canceled++;
      } else if (c.status === "DONE" && c.reverseAction) {
        // reversão segura apenas quando configurada no produto
        const reverseKey = `${c.idempotencyKey}:refund`;
        const existing = await ctx.db
          .query("deliveryCommands")
          .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", reverseKey))
          .first();
        if (!existing) {
          await ctx.db.insert("deliveryCommands", {
            publicId: generateDeliveryId(),
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

export const internalListQueued = internalQuery({
  args: {
    serverId: v.string(),
    addonId: v.optional(v.string()),
    limit: v.number(),
    now: v.number(),
  },
  handler: async (ctx, { serverId, addonId, limit, now }) => {
    const servers = serverId === "GLOBAL" ? ["GLOBAL"] : [serverId, "GLOBAL"];
    const collected: any[] = [];
    for (const sid of servers) {
      const rows = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) => q.eq("serverId", sid).eq("status", "PENDING"))
        .collect();
      for (const r of rows) {
        if (r.executeAt > now) continue;
        if (addonId && r.addonId !== addonId) continue;
        collected.push(r);
      }
    }
    return collected
      .sort((a, b) => a.executeAt - b.executeAt || a.createdAt - b.createdAt)
      .slice(0, limit)
      .map(toApiShape);
  },
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

export const adminList = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx, "deliveries.view");
    let list = await ctx.db.query("deliveryCommands").collect();
    if (status) list = list.filter((c) => c.status === status);
    return list.sort((a, b) => b.createdAt - a.createdAt).map(toAdminShape);
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
    return { command: toAdminShape(command), attempts };
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
    await logAudit(ctx, admin, "delivery_v1.retry", "deliveryCommands", id, { publicId: c.publicId });
  },
});

/** Reenvio forçado de uma entrega DONE (risco de duplicar — exige confirmação). */
export const adminRedeliver = mutation({
  args: { id: v.id("deliveryCommands"), confirm: v.boolean() },
  handler: async (ctx, { id, confirm }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    if (!confirm) throw new Error("Confirmação obrigatória para reenviar uma entrega concluída.");
    const c = await ctx.db.get(id);
    if (!c) throw new Error("Entrega não encontrada");
    await ctx.db.patch(id, {
      status: "PENDING",
      executeAt: Date.now(),
      completedAt: undefined,
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      claimToken: undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, admin, "delivery_v1.redeliver_done", "deliveryCommands", id, {
      publicId: c.publicId,
    });
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
    await logAudit(ctx, admin, "delivery_v1.cancel", "deliveryCommands", id, { publicId: c.publicId });
  },
});
