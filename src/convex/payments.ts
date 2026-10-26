"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────
// Gateway de pagamento — Mercado Pago (PIX)
// Regra de ouro: o status do pagamento NUNCA vem do navegador.
// Sempre confirmado via API oficial do gateway (webhook ou polling).
// ─────────────────────────────────────────────────────────────

const MP_API = "https://api.mercadopago.com";

interface GatewayConfig {
  accessToken?: string;
  publicKey?: string;
  webhookSecret?: string;
}

/** As referências internas são resolvidas em runtime para evitar dependência
 *  circular de tipos entre este módulo (Node) e paymentsData (runtime padrão). */
/* eslint-disable @typescript-eslint/no-explicit-any */
function dataApi(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./_generated/api").api.paymentsData;
}

async function getGatewayConfig(ctx: any): Promise<GatewayConfig> {
  const config = (await ctx.runQuery(dataApi().internalGetGatewayConfig, {})) as
    | GatewayConfig
    | null;
  return config ?? {};
}

function resolveToken(config: GatewayConfig): string | null {
  return config.accessToken || process.env.MERCADO_PAGO_ACCESS_TOKEN || null;
}

// ─── Criar pagamento PIX ───

export const createPixPayment = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx: any, { orderId }: { orderId: any }) => {
    const order: any = await ctx.runQuery(dataApi().internalGetOrder, { id: orderId });
    if (!order) throw new Error("Pedido não encontrado");
    if (order.paymentStatus === "paid") {
      return { alreadyPaid: true as const };
    }

    const config = await getGatewayConfig(ctx);
    const token = resolveToken(config);
    if (!token) {
      throw new Error(
        "Gateway de pagamento não configurado. Configure o Mercado Pago no painel admin (Integrações → Mercado Pago) ou defina MERCADO_PAGO_ACCESS_TOKEN.",
      );
    }

    const storeName: string = await ctx.runQuery(dataApi().internalGetStoreName, {});
    const idempotencyKey = `order-${order._id}-${order.createdAt}`;

    const res = await fetch(`${MP_API}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: order.totalCents / 100,
        description: `Pedido ${order.number} — ${storeName}`,
        payment_method_id: "pix",
        external_reference: order.number,
        payer: {
          email: order.customerEmail,
          first_name: order.customerName,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.message ?? data?.error ?? `Erro do gateway (${res.status})`;
      throw new Error(`Mercado Pago: ${msg}`);
    }

    const pix = data?.point_of_interaction?.transaction_data ?? {};
    await ctx.runMutation(dataApi().applyPaymentCreation, {
      orderId,
      gatewayPaymentId: String(data.id),
      pixQrCode: pix.qr_code ?? undefined,
      pixQrCodeBase64: pix.qr_code_base64 ?? undefined,
      pixTicketUrl: pix.ticket_url ?? undefined,
    });

    return {
      alreadyPaid: false as const,
      qrCode: pix.qr_code ?? null,
      qrCodeBase64: pix.qr_code_base64 ?? null,
      ticketUrl: pix.ticket_url ?? null,
    };
  },
});

// ─── Consultar status no gateway (polling do cliente) ───

/**
 * Consulta o pagamento no Mercado Pago.
 *
 * Antes esta action desistia cedo (`paymentStatus !== "pending"`) e devolvia o
 * status do banco: no painel, "Verificar no gateway" num pedido já pago não
 * consultava nada e o botão parecia travado/sem efeito. Agora ela SEMPRE fala
 * com o gateway quando existe cobrança, e diz explicitamente o que aconteceu
 * (sem cobrança, gateway não configurado, resposta de erro, valor diferente).
 */
export const refreshPaymentStatus = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx: any, { orderId }: { orderId: any }) => {
    // Pedido + configuração do gateway numa consulta só: a tela de status do
    // pedido chama esta action várias vezes enquanto o PIX está pendente, e
    // antes cada rodada gastava duas queries internas (agora gasta uma).
    const { order, config } = (await ctx.runQuery(
      dataApi().internalGetPaymentContext,
      { id: orderId },
    )) as { order: any; config: GatewayConfig | null };
    if (!order) throw new Error("Pedido não encontrado");

    if (!order.gatewayPaymentId) {
      return {
        status: order.paymentStatus ?? "unknown",
        checked: false as const,
        gatewayStatus: null,
        amountMatches: null,
      };
    }

    const token = resolveToken(config ?? {});
    if (!token) {
      throw new Error(
        "Mercado Pago não está configurado. Informe o Access Token em Integrações → Mercado Pago para conferir o pagamento no gateway.",
      );
    }

    const res = await syncGatewayPayment(ctx, order.gatewayPaymentId, order._id, token);
    if (!res.configured) {
      throw new Error("Mercado Pago não está configurado nesta loja.");
    }
    if (res.httpStatus) {
      throw new Error(
        `O Mercado Pago respondeu ${res.httpStatus} para esta cobrança. Confira o Access Token e o ID do pagamento.`,
      );
    }

    const amountMatches =
      res.amountApproved === null ? null : res.amountApproved === order.totalCents;

    return {
      status: res.status,
      previousStatus: order.paymentStatus,
      checked: true as const,
      gatewayStatus: res.mpStatus ?? null,
      amountMatches,
    };
  },
});

async function syncGatewayPayment(
  ctx: any,
  gatewayPaymentId: string,
  orderId?: any,
  tokenOverride?: string,
) {
  const token = tokenOverride ?? resolveToken(await getGatewayConfig(ctx));
  if (!token) return { status: "pending", configured: false, httpStatus: 0, mpStatus: null, amountApproved: null };

  const res = await fetch(`${MP_API}/v1/payments/${gatewayPaymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Um erro do gateway não pode ser lido como "ainda pendente": quem chamou
  // precisa saber que a consulta falhou.
  if (!res.ok) {
    return { status: "pending", configured: true, httpStatus: res.status, mpStatus: null, amountApproved: null };
  }
  const data = await res.json();
  const mpStatus = mapMpStatus(data.status);
  const amountApproved =
    typeof data.transaction_amount === "number" ? Math.round(data.transaction_amount * 100) : null;
  if (orderId) {
    await ctx.runMutation(dataApi().applyGatewayStatus, {
      gatewayPaymentId,
      mpStatus,
      amountApproved: amountApproved ?? undefined,
    });
  }
  return {
    status: mpStatus,
    configured: true,
    httpStatus: 0,
    mpStatus: data.status ?? null,
    amountApproved,
  };
}

function mapMpStatus(status: string | undefined): string {
  switch (status) {
    case "approved": return "paid";
    case "cancelled": return "cancelled";
    case "rejected": return "failed";
    case "refunded":
    case "charged_back": return "refunded";
    default: return "pending";
  }
}

// ─── Reconciliação periódica (convex/crons.ts) ───
//
// O webhook é o caminho normal, mas depende de a URL estar cadastrada no
// Mercado Pago e de a notificação chegar. Quando ela falha, o PIX entra na
// conta e o pedido fica "Aguardando pagamento" para sempre. Este job confirma
// no gateway os pedidos pendentes recentes; o que estiver aprovado é marcado
// como pago (e a entrega é enfileirada, como no webhook).

export const reconcilePending = internalAction({
  args: {},
  handler: async (ctx: any) => {
    const pending = (await ctx.runQuery(dataApi().internalListPendingPayments, {
      since: Date.now() - 3 * 24 * 60 * 60 * 1000,
      limit: 20,
    })) as Array<{ id: string; gatewayPaymentId: string }>;
    let synced = 0;
    for (const p of pending) {
      try {
        const res = await syncGatewayPayment(ctx, p.gatewayPaymentId, p.id);
        if (res.status !== "pending") synced++;
      } catch {
        // um pedido com erro não pode impedir a checagem dos outros
      }
    }
    return { checked: pending.length, synced };
  },
});

// ─── Webhook do Mercado Pago (via http.ts) ───

export const handleWebhook = action({
  args: {
    body: v.string(),
    signatureHeader: v.optional(v.string()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const { body, signatureHeader, requestId } = args;
    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      return { ok: false as const, code: 400 };
    }

    const dataId = payload?.data?.id ?? payload?.resource;
    const type = payload?.type ?? payload?.topic;
    if (type !== "payment" || !dataId) return { ok: true as const, code: 200 };

    // valida assinatura HMAC do MP quando o secret está configurado
    const config = await getGatewayConfig(ctx);
    if (config.webhookSecret && signatureHeader) {
      const parts = Object.fromEntries(
        signatureHeader.split(",").map((p: string) => p.trim().split("=")),
      );
      const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${parts.ts};`;
      const hmac = crypto
        .createHmac("sha256", config.webhookSecret)
        .update(manifest)
        .digest("hex");
      if (hmac !== parts.v1) {
        return { ok: false as const, code: 401 };
      }
    }

    // NUNCA confiamos no payload: buscamos o pagamento direto na API do MP
    const token = resolveToken(config);
    if (!token) return { ok: true as const, code: 200 };
    const res = await fetch(`${MP_API}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: true as const, code: 200 }; // 200 evita loop de retry do MP
    const data = await res.json();
    await ctx.runMutation(dataApi().applyGatewayStatus, {
      gatewayPaymentId: String(data.id),
      mpStatus: mapMpStatus(data.status),
    });
    return { ok: true as const, code: 200 };
  },
});
