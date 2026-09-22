"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import crypto from "node:crypto";

/** Dispara um webhook de teste (verificação de entrega no painel). */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const test = action({
  args: { id: v.id("webhooksOut") },
  handler: async (ctx: any, { id }: { id: any }) => {
    const { api } = require("./_generated/api") as any;
    const { requireAdmin } = await import("./lib/admin");
    await requireAdmin(ctx as any, "integrations.manage");
    const hooks: any[] = await ctx.runQuery(api.webhooksOutData.internalListAdmin, {});
    const hook = hooks.find((h: any) => h._id === id);
    if (!hook) throw new Error("Webhook não encontrado");
    const body = JSON.stringify({
      event: "test",
      data: { message: "Webhook de teste da sua loja 🎉" },
      timestamp: Date.now(),
    });
    const signature = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nexa-Event": "test",
        "X-Nexa-Signature": `sha256=${signature}`,
      },
      body,
    });
    await ctx.runMutation(api.webhooksOutData.log, {
      webhookId: id,
      event: "test",
      url: hook.url,
      statusCode: res.status,
      attempt: 1,
    });
    return { ok: res.ok, status: res.status };
  },
});
