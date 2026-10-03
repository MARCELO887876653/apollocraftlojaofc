import {
  internalQuery,
  internalMutation,
  query,
  mutation,
} from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────
// Fila de entrega da API v1 (deliveryCommands)
// - Criação idempotente no pagamento aprovado (idempotencyKey UNIQUE)
// - Cancelamento em reembolso/cancelamento do pedido
// - Lease/claim p/ evitar duas instâncias processando a mesma entrega
// ─────────────────────────────────────────────────────────────

const CLAIM_TTL_MS = 5 * 60 * 1000; // lease de 5 minutos

/** Lookup por chave de idempotência (usado por auth e testes). */
export const internalGetByKey = internalQuery({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, { idempotencyKey }) => {
    return await ctx.db
      .query("deliveryCommands")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
  },
});

/**
 * Cria as entregas automáticas de um pedido PAGO no sistema v1.
 * Idempotente: cada (orderId, itemIndex, actionIndex) gera no máximo uma
 * entrega — um segundo pagamento/call não duplica.
 * Chamada somente após pedido realmente pago (gateway/admin).
 */
const isEligible = (paymentStatus?: string) => paymentStatus === "paid";

async function createForOrder(ctx: any, orderId: any) {
  const order: any = await ctx.db.get(orderId);
  if (!order || !isEligible(order.paymentStatus)) return { created: 0 };
  if (!order.items?.length) return { created: 0 };

  // cliente já existe (fluxo de checkout cria o customer)
  const customer: any = order.customerId ? await ctx.db.get(order.customerId) : null;
  const clientIdentifier =
    order.minecraftNick || customer?.minecraftNick || order.discord ||
    customer?.name || order.customerName || order.customerEmail;
  const variables = [
    { name: "nickname", value: order.minecraftNick ?? clientIdentifier },
    { name: "email", value: order.customerEmail ?? "" },
    { name: "discord", value: order.discord ?? "" },
  ].filter((v: any) => v.value);

  let created = 0;
  for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
    const item = order.items[itemIndex];
    const product: any = await ctx.db.get(item.productId);
    if (!product) continue;
    const actions: any[] = product.deliveryV1?.actions ?? [];
    if (!product.deliveryV1?.enabled || actions.length === 0) continue;

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
      const a = actions[actionIndex];
      const idempotencyKey = `${orderId}:${itemIndex}:${actionIndex}`;
      const existing = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
        .first();
      if (existing) continue; // já criada — nunca duplica

      const now = Date.now();
      await ctx.db.insert("deliveryCommands", {
        orderId: order._id,
        orderNumber: order.number,
        orderItemIndex: itemIndex,
        productId: product._id,
        productName: product.name,
        quantity: item.quantity,
        serverId: a.serverId || "GLOBAL",
        addonId: a.addonId || "custom",
        clientIdentifier,
        action: a.action,
        command: a.command,
        payload: a.payload,
        variables,
        offlineExecute: a.offlineExecute ?? false,
        executeAt: now + (a.delaySeconds ?? 0) * 1000,
        status: "PENDING",
        attempts: 0,
        maxAttempts: 10,
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
  }
  return { created };
}

/** Filas antigas de produtos sem deliveryV1 continuam no sistema anterior. */
export const createCommandsForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const res: any = await createForOrder(ctx, orderId);
    return res;
  },
});

/**
 * Reembolso/cancelamento: cancela entregas PENDING/PROCESSING do pedido.
 * DONE permanece — reversão automática só quando o produto define reverseAction.
 */
export const cancelCommandsForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const cmds = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
      .collect();
    let canceled = 0;
    for (const c of cmds) {
      if (c.status === "PENDING" || c.status === "PROCESSING") {
        await ctx.db.patch(c._id, {
          status: "CANCELED",
          reason: "Pedido cancelado/reembolsado",
          updatedAt: Date.now(),
        });
        canceled++;
      }
    }
    return { canceled };
  },
});

/** Reversão configurada no produto (REMOVE_RANK etc.) em reembolso de entrega DONE. */
export const createReverseCommandsForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order: any = await ctx.db.get(orderId);
    if (!order) return { created: 0 };
    let created = 0;
    for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
      const item = order.items[itemIndex];
      const product: any = await ctx.db.get(item.productId);
      const rev = product?.deliveryV1?.reverseAction;
      if (!rev?.action) continue;
      const idempotencyKey = `${orderId}:rev:${itemIndex}`;
      const existing = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
        .first();
      if (existing) continue;
      const now = Date.now();
      await ctx.db.insert("deliveryCommands", {
        orderId: order._id,
        orderNumber: order.number,
        orderItemIndex: itemIndex,
        productId: product._id,
        productName: product.name,
        quantity: item.quantity,
        serverId: rev.serverId || product.deliveryV1?.actions?.[0]?.serverId || "GLOBAL",
        addonId: rev.addonId || "custom",
        clientIdentifier: order.minecraftNick || order.customerName || order.customerEmail,
        action: rev.action,
        payload: rev.payload,
        variables: undefined,
        offlineExecute: true,
        executeAt: now,
        status: "PENDING",
        attempts: 0,
        maxAttempts: 10,
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
    return { created };
  },
});

// ─── Leitura das filas (por chave autenticada) ───

export const internalListQueued = internalQuery({
  args: {
    now: v.number(),
    serverId: v.string(),
    addonId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, { now, serverId, addonId, limit }) => {
    const global = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_status_executeAt", (q: any) => q.eq("status", "PENDING"))
      .order("asc")
      .take(400);
    return global
      .filter((c: any) => c.executeAt <= now)
      .filter((c: any) => c.serverId === "GLOBAL" || c.serverId === serverId)
      .filter((c: any) => !addonId || c.addonId === addonId)
      .slice(0, limit);
  },
});

export const internalGetCommand = internalQuery({
  args: { id: v.id("deliveryCommands") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const internalUserQueue = internalQuery({
  args: {
    now: v.number(),
    clientIdentifier: v.string(),
    serverId: v.string(),
    includeScheduled: v.boolean(),
  },
  handler: async (ctx, { now, clientIdentifier, serverId, includeScheduled }) => {
    const all = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_client", (q: any) => q.eq("clientIdentifier", clientIdentifier))
      .collect();
    return all
      .filter((c: any) => c.status === "PENDING")
      .filter((c: any) => c.serverId === "GLOBAL" || c.serverId === serverId)
      .filter((c: any) => !includeScheduled || c.executeAt > now)
      .filter((c: any) => includeScheduled || c.executeAt <= now);
  },
});

export const internalListAttempts = internalQuery({
  args: { deliveryId: v.id("deliveryCommands") },
  handler: async (ctx, { deliveryId }) => {
    return await ctx.db
      .query("deliveryAttempts")
      .withIndex("by_delivery", (q: any) => q.eq("deliveryId", deliveryId))
      .collect();
  },
});

// ─── Painel admin ───

export const adminList = query({
  args: {
    status: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { status, search }) => {
    await requireAdmin(ctx, "deliveries.view");
    let list: any[];
    if (status) {
      list = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_status_executeAt", (q: any) => q.eq("status", status as any))
        .take(500);
    } else {
      list = await ctx.db.query("deliveryCommands").take(500);
    }
    list = list.sort((a: any, b: any) => b.createdAt - a.createdAt);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c: any) =>
        c.orderNumber?.toLowerCase().includes(s) ||
        c.clientIdentifier?.toLowerCase().includes(s) ||
        c.productName?.toLowerCase().includes(s) ||
        c.action?.toLowerCase().includes(s));
    }
    const counts = { PENDING: 0, PROCESSING: 0, DONE: 0, FAILED: 0, CANCELED: 0 };
    for (const c of list) counts[c.status as keyof typeof counts]++;
    return { items: list, counts };
  },
});

export const adminGet = query({
  args: { id: v.id("deliveryCommands") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "deliveries.view");
    const cmd = await ctx.db.get(id);
    if (!cmd) return null;
    const attempts = await ctx.db
      .query("deliveryAttempts")
      .withIndex("by_delivery", (q: any) => q.eq("deliveryId", id))
      .collect();
    return { cmd, attempts };
  },
});

/** Reenvio manual: FAILED → PENDING (preserva tentativas). DONE exige force. */
export const adminRetry = mutation({
  args: { id: v.id("deliveryCommands"), force: v.optional(v.boolean()) },
  handler: async (ctx, { id, force }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    const cmd: any = await ctx.db.get(id);
    if (!cmd) throw new Error("Entrega não encontrada");
    if (cmd.status === "DONE" && !force)
      throw new Error("Entrega já concluída — reenvio exige confirmação explícita (risco de duplicar)");
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "PENDING",
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      executeAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("deliveryAttempts", {
      deliveryId: id,
      serverId: cmd.serverId,
      addonId: cmd.addonId,
      status: "ADMIN_RETRY",
      response: `Reenvio manual por ${admin.name}`,
      startedAt: now,
      finishedAt: now,
    });
    await logAudit(ctx, admin, "delivery.retry", "deliveryCommands", id);
  },
});

export const adminCancel = mutation({
  args: { id: v.id("deliveryCommands") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    const cmd: any = await ctx.db.get(id);
    if (!cmd) throw new Error("Entrega não encontrada");
    if (cmd.status === "DONE" && cmd.status !== "CANCELED") {
      // DONE não pode ser cancelado sem reversão configurada — mantém integridade
      throw new Error("Entrega DONE não pode ser cancelada");
    }
    await ctx.db.patch(id, { status: "CANCELED", reason: "Cancelada no painel", updatedAt: Date.now() });
    await logAudit(ctx, admin, "delivery.cancel", "deliveryCommands", id);
  },
});
