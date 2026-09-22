"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────
// Execução HTTP de entregas (runtime Node) — api, webhook, command
// O resultado é persistido via internalMutations em deliveriesQueue.ts
// ─────────────────────────────────────────────────────────────

export const executeHttp = internalAction({
  args: {
    deliveryId: v.id("deliveries"),
    type: v.string(),
    url: v.optional(v.string()),
    method: v.string(),
    headers: v.optional(v.array(v.object({ k: v.string(), v: v.string() }))),
    body: v.optional(v.string()),
    commands: v.optional(v.array(v.string())),
    orderNumber: v.string(),
    productId: v.string(),
    productName: v.string(),
    target: v.optional(v.string()),
    quantity: v.number(),
    attempts: v.number(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    let success = false;
    let error: string | undefined;
    let payloadResult: any = undefined;

    try {
      if (args.type === "api" && args.url) {
        const res = await fetch(args.url, {
          method: args.method,
          headers: Object.fromEntries((args.headers ?? []).map((h) => [h.k, h.v])),
          body: args.method === "POST" && args.body ? args.body : undefined,
        });
        const text = await res.text();
        success = res.ok;
        if (!res.ok) error = `API retornou HTTP ${res.status}: ${text.slice(0, 200)}`;
        else payloadResult = text.slice(0, 2000);
      } else if (args.type === "webhook" && args.url) {
        const res = await fetch(args.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Delivery-Order": args.orderNumber,
            "X-Delivery-Product": args.productId,
          },
          body: JSON.stringify({
            orderNumber: args.orderNumber,
            productId: args.productId,
            productName: args.productName,
            target: args.target,
            quantity: args.quantity,
            commands: args.commands ?? [],
          }),
        });
        success = res.ok;
        if (!res.ok) error = `Webhook retornou HTTP ${res.status}`;
      } else if (args.type === "command") {
        // Comandos de servidor Minecraft não são executados localmente:
        // são despachados para o endpoint configurado pelo admin.
        if (!args.url) {
          error = "Comando configurado mas nenhum endpoint de despacho (Integrações → Minecraft)";
        } else {
          const res = await fetch(args.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commands: args.commands ?? [] }),
          });
          success = res.ok;
          if (!res.ok) error = `Endpoint de comandos retornou HTTP ${res.status}`;
        }
      } else {
        error = `Tipo de entrega HTTP desconhecido: ${args.type}`;
      }
    } catch (e: any) {
      error = e?.message ?? "Erro de rede";
      success = false;
    }

    if (success) {
      await ctx.runMutation(internal.deliveriesQueue.completeSuccess, {
        deliveryId: args.deliveryId,
        attempts: args.attempts + 1,
        payload: payloadResult,
      });
      await ctx.scheduler.runAfter(0, internal.deliveriesQueue.completeOrderIfDone, {
        orderId: args.orderId,
      });
    } else {
      await ctx.runMutation(internal.deliveriesQueue.scheduleRetry, {
        deliveryId: args.deliveryId,
        attempts: args.attempts + 1,
        error: error ?? "Falha na entrega",
      });
    }
  },
});
