import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────
// Log completo de uma entrega automática.
//
// Toda mudança relevante vira uma linha em `deliveryEvents`: criação,
// reenvio pelo painel, claim do addon, confirmação, falha, cancelamento.
// Reenviar NUNCA apaga o histórico — o operador vê quantas vezes foi
// reenviada, quem clicou, o que o addon respondeu e quando.
// ─────────────────────────────────────────────────────────────

export const DELIVERY_EVENT = {
  created: "CREATED",
  redelivered: "REDELIVERED",
  retried: "RETRIED",
  claimed: "CLAIMED",
  confirmed: "CONFIRMED",
  failed: "FAILED",
  canceled: "CANCELED",
  reversalQueued: "REVERSAL_QUEUED",
  claimExpired: "CLAIM_EXPIRED",
  awaitingPlayer: "AWAITING_PLAYER",
} as const;

export const deliveryEventActorValidator = v.union(
  v.literal("SYSTEM"),
  v.literal("ADMIN"),
  v.literal("ADDON"),
);

type LogDeliveryEventInput = {
  deliveryId: any;
  publicId: string;
  orderId: any;
  orderNumber: string;
  type: string;
  status?: string;
  message?: string;
  actor: "SYSTEM" | "ADMIN" | "ADDON";
  actorName?: string;
  serverId?: string;
  addonId?: string;
  apiKeyId?: any;
  details?: any;
};

export async function logDeliveryEvent(ctx: any, input: LogDeliveryEventInput): Promise<void> {
  await ctx.db.insert("deliveryEvents", {
    deliveryId: input.deliveryId,
    publicId: input.publicId,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    type: input.type,
    status: input.status,
    message: input.message,
    actor: input.actor,
    actorName: input.actorName,
    serverId: input.serverId,
    addonId: input.addonId,
    apiKeyId: input.apiKeyId,
    details: input.details,
    createdAt: Date.now(),
  });
}

/** Bloco de reenvio que vai no claim do addon (null quando nunca foi reenviada). */
export function resendInfo(doc: any) {
  if (!doc?.resendCount) return null;
  return {
    count: doc.resendCount as number,
    by: (doc.resentBy as string | undefined) ?? null,
    at: doc.resentAt ? new Date(doc.resentAt as number).toISOString() : null,
  };
}

/** Linha pronta para o addon imprimir no console do servidor quando pega a
 *  entrega (inclusive quando ela foi reenviada pelo painel). */
export function deliveryConsoleLine(doc: any, attemptNumber?: number): string {
  const parts = [
    `[apollocraft] pedido ${doc.orderNumber}`,
    `${doc.action} ${doc.productName} -> ${doc.clientIdentifier}`,
    `${doc.serverId}/${doc.addonId}`,
    `entrega ${doc.publicId}`,
    `tentativa ${attemptNumber ?? doc.attempts}/${doc.maxAttempts}`,
  ];
  if (doc.resendCount) {
    parts.push(`REENVIADA ${doc.resendCount}x pelo painel${doc.resentBy ? ` (${doc.resentBy})` : ""}`);
  }
  return parts.join(" | ");
}
