import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, logAudit } from "./lib/admin";
import { getSetting } from "./lib/data";

// ─────────────────────────────────────────────────────────────
// Integrações — gateway de pagamento e credenciais externas
// ─────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "integrations.manage");
    const mp = (await getSetting(ctx, "gateway_mercadopago")) as any;
    const minecraft = (await getSetting(ctx, "integration_minecraft")) as any;
    return {
      mercadopago: {
        configured: Boolean(mp?.accessToken),
        publicKey: mp?.publicKey ?? "",
        hasAccessToken: Boolean(mp?.accessToken),
        hasWebhookSecret: Boolean(mp?.webhookSecret),
      },
      minecraft: {
        dispatchUrl: minecraft?.dispatchUrl ?? "",
        serverName: minecraft?.serverName ?? "",
      },
    };
  },
});

const mpInput = v.object({
  accessToken: v.optional(v.string()),
  publicKey: v.optional(v.string()),
  webhookSecret: v.optional(v.string()),
});

export const saveMercadoPago = mutation({
  args: mpInput,
  handler: async (ctx, input) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    const current = ((await getSetting(ctx, "gateway_mercadopago")) as any) ?? {};
    const next: any = { ...current };
    // só sobrescreve quando enviado (campos vazios mantêm o valor atual)
    for (const [k, val] of Object.entries(input)) {
      if (typeof val === "string" && val.trim() === "") continue;
      if (val !== undefined) next[k] = val;
    }
    await ctx.db.insert("settings", {
      key: "gateway_mercadopago",
      value: next,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, admin, "integrations.mercadopago", "settings", "gateway_mercadopago", {
      hasAccessToken: Boolean(next.accessToken),
    });
  },
});

export const saveMinecraft = mutation({
  args: {
    dispatchUrl: v.string(),
    serverName: v.optional(v.string()),
  },
  handler: async (ctx, { dispatchUrl, serverName }) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    await ctx.db.insert("settings", {
      key: "integration_minecraft",
      value: { dispatchUrl, serverName: serverName ?? "" },
      updatedAt: Date.now(),
    });
    await logAudit(ctx, admin, "integrations.minecraft", "settings", "integration_minecraft");
  },
});

export const clearMercadoPago = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx, "integrations.manage");
    await ctx.db.insert("settings", {
      key: "gateway_mercadopago",
      value: {},
      updatedAt: Date.now(),
    });
    await logAudit(ctx, admin, "integrations.mercadopago.clear", "settings", "gateway_mercadopago");
  },
});
