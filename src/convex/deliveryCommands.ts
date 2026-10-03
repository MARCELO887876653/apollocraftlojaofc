import {
  internalMutation,
  query,
  mutation,
} from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { deliveryCommandStatusValidator, apiScopeValidator } from "./lib/apiSchema";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────
// Fila de entrega da API v1 (delivery_commands)
//
//  PENDING  → aguardando execução
//  PROCESSING → reservada (claim) — lease de 5 min
//  DONE     → executada com sucesso
//  FAILED   → tentativa falhou (tentativas máximas esgotadas)
//  CANCELED → cancelada (reembolso/cancelamento do pedido)
// ─────────────────────────────────────────────────────────────

const CLAIM_TTL_MS = 5 * 60 * 1000; // lease para o addon

/**
 * Escuta as entregas para um pedido, criando-as na fila v1.
 * Idempotente: cada (orderId, itemIndex, actionIndex) gera no máximo uma
 * entrega.
 * Chamada somente após pedido realmente pago (gateway/admin).
 */
export const createCommandsForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order: any = await ctx.db.get(orderId);
    if (!(order?.paymentStatus === "paid")) return { created: 0, skipped: 0 };
    if (!order?.items?.length) return { created: 0, skipped: 0 };

    const customer: any = order.customerId ? await ctx.db.get(order.customerId) : null;
    const oldClientIdentifier = order.minecraftNick || customer?.minecraftNick || order.discord || customer?.name || order.customerName || order.customerEmail;
    const oldVariables = [
      { name: "nickname", value: order.minecraftNick ?? oldClientIdentifier },
      { name: "email", value: order.customerEmail ?? "" },
      { name: "discord", value: order.discord ?? "" },
    ].filter((v: any) => v.value);

    let created = 0;
    for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
      const item = order.items[itemIndex];
      const product: any = await ctx.db.get(item.productId);
      if (!product?.deliveryV1?.enabled) continue;

      for (let actionIndex = 0; actionIndex < product.deliveryV1.actions.length; actionIndex++) {
        const a = product.deliveryV1.actions[actionIndex];
        const idempotencyKey = `${orderId}:${itemIndex}:${actionIndex}`;
        const already = await ctx.db
          .query("deliveryCommands")
          .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
          .first();
        if (already) continue;

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
          clientIdentifier: oldClientIdentifier,
          action: a.action,
          command: a.command,
          payload: a.payload,
          variables: a.variables ?? (a.command ? [{ name: "command", value: a.command }] : oldVariables),
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
    return { created, skipped: 0 };
  },
});

/** Cancela (reembolso/cancelamento do pedido) antes da entrega. */
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
          reason: "Pedido cancelado ou reembolsado",
          updatedAt: Date.now(),
        });
        canceled++;
      }
    }
    return { canceled };
  },
});

/** Reversão configurada no produto (REMOVE_RANK etc.) em reembolso de DONE. */
export const createReverseCommandsForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order: any = await ctx.db.get(orderId);
    if (!order) return { created: 0 };
    const product: any = await ctx.db.get(order.items?.[0]?.productId);
    const rev = product?.deliveryV1?.reverseAction;
    if (!rev?.action) return { created: 0 };
    const idempotencyKey = `${orderId}:reverse:${Date.now()}`;
    const now = Date.now();
    const cmd = await ctx.db.insert("deliveryCommands", {
      orderId: order._id,
      orderNumber: order.number,
      orderItemIndex: 0,
      productId: product?._id,
      productName: product?.name,
      quantity: 1,
      serverId: rev.serverId || "GLOBAL",
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
    return { created: 1, deliveryId: cmd };
  },
});

/** Auditório: lista pendentes elegíveis (usado por claim + debug). */
export const internalListQueued = internalMutation({
  args: {
    now: v.number(),
    serverId: v.string(),
    addonId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, { now, serverId, addonId, limit }) => {
    const pending = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_status_executeAt", (q: any) => q.eq("status", "PENDING"))
      .order("asc")
      .take(500);
    return pending
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

export const internalListAttempts = internalQuery({
  args: { deliveryId: v.id("deliveryCommands") },
  handler: async (ctx, { deliveryId }) => {
    return await ctx.db
      .query("deliveryAttempts")
      .withIndex("by_delivery", (q: any) => q.eq("deliveryId", deliveryId))
      .collect();
  },
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
      .filter((c: any) => includeScheduled || c.executeAt <= now && c.executeAt > 0);
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
        [c.orderNumber, c.clientIdentifier, c.productName, c.action]
          .map((x: string | undefined) => x?.toLowerCase() ?? "")
          .some((s2: string) => s2.includes(s)),
      );
    }
    const counts: Record<string, number> = { PENDING: 0, PROCESSING: 0, DONE: 0, FAILED: 0, CANCELED: 0 };
    for (const c of list) counts[c.status as keyof typeof counts] = (counts[c.status as keyof typeof counts] ?? 0) + 1;
    return { items: list, counts };
  },
});

export const adminGet = query({
  args: { id: v.id("deliveryCommands") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx, "deliveries.view");
    const cmd: any = await ctx.db.get(id);
    if (!cmd) return null;
    return {
      cmd,
      attempts: await ctx.db
        .query("deliveryAttempts")
        .withIndex("by_delivery", (q: any) => q.eq("deliveryId", id))
        .collect(),
    };
  },
});

export const adminRetry = mutation({
  args: { id: v.id("deliveryCommands"), force: v.optional(v.boolean()) },
  handler: async (ctx, { id, force }) => {
    const admin = await requireAdmin(ctx, "deliveries.manage");
    const cmd: any = await ctx.db.get(id);
    if (!cmd) throw new Error("Entrega não encontrada");
    if (cmd.status === "DONE" && !force) {
      throw new Error("Entrega concluída — reenvio exige confirmação explícita (risco de duplicar)");
    }
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "PENDING",
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      executeAt: now + 60_000,
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
      throw new Error("Entrega DONE não pode ser cancelada");
    }
    await ctx.db.patch(id, {
      status: "CANCELED",
      reason: "Cancelada no painel",
      updatedAt: Date.now(),
    });
    await logAudit(ctx, admin, "delivery.cancel", "deliveryCommands", id);
  },
});
