import { query, internalQuery, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin";
import { generateClaimToken } from "./lib/hash";
import { API_SCOPES } from "./lib/apiSchema";
import { syncChangesCore } from "./apiV1Sync";
import { listQueuedCore } from "./deliveryCommands";
import {
  DELIVERY_EVENT,
  logDeliveryEvent,
  resendInfo,
  deliveryConsoleLine,
} from "./lib/deliveryLog";

// ─────────────────────────────────────────────────────────────
// Dados da API v1: rate limit, claim/lease, confirmação, heartbeat, logs.
// Todo o estado é persistido no banco (nada em memória/arrays).
// ─────────────────────────────────────────────────────────────

const CLAIM_LEASE_MS = 5 * 60 * 1000; // 5 minutos
const HEARTBEAT_ONLINE_MS = 90 * 1000; // considerado online nos últimos 90s

// Intervalo entre as amostras de log de SUCESSO em `apiLogs` (por chave e
// bucket). O addon faz poll a cada ~2 minutos; gravar uma linha por minuto
// gerava ~1.280 escritas/dia de linhas "200 OK" que ninguém lê (medido no
// deployment: 3.000 linhas em 56 horas, todas de sucesso). Erros continuam
// sendo registrados individualmente.
const LOG_SAMPLE_MS = 10 * 60 * 1000;

// Códigos de erro semânticos aceitos na confirmação (PATCH command).
export const ERROR_CODES = {
  PLAYER_OFFLINE: "PLAYER_OFFLINE",
  HANDLER_NOT_FOUND: "HANDLER_NOT_FOUND",
  REFERENCE_NOT_FOUND: "REFERENCE_NOT_FOUND",
  REFERENCE_REVISION_NOT_FOUND: "REFERENCE_REVISION_NOT_FOUND",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  TEMPORARY_STORAGE_ERROR: "TEMPORARY_STORAGE_ERROR",
  CLAIM_EXPIRED: "CLAIM_EXPIRED",
  CLAIM_INVALID: "CLAIM_INVALID",
  MAX_ATTEMPTS_REACHED: "MAX_ATTEMPTS_REACHED",
} as const;

// Erros que NUNCA devem ser reagendados automaticamente (falha definitiva).
const NON_RETRYABLE_CODES = new Set<string>([
  ERROR_CODES.HANDLER_NOT_FOUND,
  ERROR_CODES.REFERENCE_NOT_FOUND,
  ERROR_CODES.REFERENCE_REVISION_NOT_FOUND,
  ERROR_CODES.INVALID_PAYLOAD,
  ERROR_CODES.MAX_ATTEMPTS_REACHED,
]);

const BACKOFFS_MS = [60_000, 300_000, 900_000, 3_600_000, 7_200_000];

function backoffFor(attempts: number): number {
  return BACKOFFS_MS[Math.max(0, Math.min(attempts - 1, BACKOFFS_MS.length - 1))];
}

export { CLAIM_LEASE_MS, HEARTBEAT_ONLINE_MS, NON_RETRYABLE_CODES, backoffFor };

// ─── Rate limit por API Key + bucket (GET vs escrita) ───

export const internalCheckRateLimit = internalMutation({
  args: {
    apiKeyId: v.id("apiKeysV1"),
    bucket: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, { apiKeyId, bucket, limit, windowMs }) => {
    const now = Date.now();
    const key = `apiv1:${apiKeyId}:${bucket}`;
    const doc = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (!doc || now - doc.windowStart >= windowMs) {
      if (doc) await ctx.db.patch(doc._id, { windowStart: now, count: 1 });
      else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
      return { allowed: true, remaining: limit - 1, limit, retryAfterSec: 0 };
    }
    if (doc.count >= limit) {
      const resetAt = doc.windowStart + windowMs;
      return {
        allowed: false,
        remaining: 0,
        limit,
        retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }
    await ctx.db.patch(doc._id, { count: doc.count + 1 });
    return {
      allowed: true,
      remaining: Math.max(0, limit - (doc.count + 1)),
      limit,
      retryAfterSec: 0,
    };
  },
});

// ─── Autorização em UMA chamada ───
//
// Antes cada requisição da API custava 4 idas ao banco separadas (buscar a
// chave, rate limit, touch da chave e log). O addon consulta a fila a cada
// poucos segundos, então eram ~7 execuções por poll. Aqui tudo acontece numa
// mutation só; o log de sucesso é amostrado (1 por janela de 1 minuto) para
// não encher a tabela `apiLogs` com polls vazios.

type AuthorizeArgs = {
  hash: string;
  bucket: string;
  limit: number;
  windowMs: number;
  method: string;
  path: string;
  ip?: string;
};

/**
 * Núcleo da autorização. É compartilhado pela mutation `internalAuthorize` e
 * pelas rotas "fundidas" (`internalAuthorizedCall`), para que uma requisição
 * quente do addon custe UMA função em vez de duas sem enfraquecer nada:
 * a chave, o rate limit, o `lastUsedAt` e a amostra de log continuam iguais.
 */
async function authorizeRequest(ctx: MutationCtx, args: AuthorizeArgs) {
    const now = Date.now();
    const key = await ctx.db
      .query("apiKeysV1")
      .withIndex("by_hash", (q) => q.eq("keyHash", args.hash))
      .first();
    if (!key) return { ok: false as const, code: "INVALID_API_KEY" as const };
    if (!key.active || key.revokedAt) {
      return { ok: false as const, code: "API_KEY_REVOKED" as const };
    }

    // Rate limit por chave + bucket (mesma regra de antes).
    const rlKey = `apiv1:${key._id}:${args.bucket}`;
    const doc = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", rlKey))
      .first();

    let rate: {
      allowed: boolean;
      remaining: number;
      limit: number;
      retryAfterSec: number;
    };
    // Id do documento de rate limit desta chave+bucket (novo ou existente) para
    // carimbar a amostra de log no MESMO documento, sem escrita extra.
    let rateDocId = doc?._id;
    if (!doc || now - doc.windowStart >= args.windowMs) {
      if (doc) await ctx.db.patch(doc._id, { windowStart: now, count: 1 });
      else
        rateDocId = await ctx.db.insert("rateLimits", {
          key: rlKey,
          windowStart: now,
          count: 1,
        });
      rate = { allowed: true, remaining: args.limit - 1, limit: args.limit, retryAfterSec: 0 };
    } else if (doc.count >= args.limit) {
      rate = {
        allowed: false,
        remaining: 0,
        limit: args.limit,
        retryAfterSec: Math.max(1, Math.ceil((doc.windowStart + args.windowMs - now) / 1000)),
      };
    } else {
      await ctx.db.patch(doc._id, { count: doc.count + 1 });
      rate = {
        allowed: true,
        remaining: Math.max(0, args.limit - (doc.count + 1)),
        limit: args.limit,
        retryAfterSec: 0,
      };
    }

    // lastUsedAt no máximo 1x por minuto (evita escrita a cada poll).
    if (!key.lastUsedAt || now - key.lastUsedAt > 60_000) {
      await ctx.db.patch(key._id, { lastUsedAt: now });
    }

    // Log amostrado: 1 a cada LOG_SAMPLE_MS por chave+bucket, em vez de 1 por
    // janela de rate limit (~1/min). Ver LOG_SAMPLE_MS acima.
    const sample = !doc?.lastSampleAt || now - doc.lastSampleAt >= LOG_SAMPLE_MS;
    if (rate.allowed && sample) {
      await ctx.db.insert("apiLogs", {
        apiKeyId: key._id,
        serverId: key.serverId,
        addonId: key.addonId,
        endpoint: args.path,
        method: args.method,
        statusCode: 200,
        durationMs: 0,
        ip: args.ip,
        createdAt: now,
      });
      if (rateDocId) await ctx.db.patch(rateDocId, { lastSampleAt: now });
    }

  return {
    ok: true as const,
    key: {
      id: key._id,
      name: key.name,
      prefix: key.prefix,
      lastFour: key.lastFour,
      scopes: key.scopes,
      serverId: key.serverId,
      addonId: key.addonId,
      createdAt: key.createdAt,
    },
    rate,
  };
}

/** Mutation fina: mantém o contrato antigo para as rotas não fundidas. */
export const internalAuthorize = internalMutation({
  args: {
    hash: v.string(),
    bucket: v.string(),
    limit: v.number(),
    windowMs: v.number(),
    method: v.string(),
    path: v.string(),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => authorizeRequest(ctx, args),
});

// ─── Claim/lease atômico ───

function visibleServers(serverId: string): string[] {
  return serverId === "GLOBAL" ? ["GLOBAL"] : [serverId, "GLOBAL"];
}

type ClaimArgs = {
  apiKeyId: any;
  serverId: string;
  addonId?: string;
  limit: number;
  leaseMs?: number;
};

/** Núcleo do claim/lease (reutilizado pela rota fundida). */
export async function claimForAddon(
  ctx: MutationCtx,
  { apiKeyId, serverId, addonId, limit, leaseMs }: ClaimArgs,
) {
    const now = Date.now();
    const lease = leaseMs ?? CLAIM_LEASE_MS;

    // 1) libera claims expirados (addon caiu depois de pegar a entrega)
    for (const sid of visibleServers(serverId)) {
      const processing = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) => q.eq("serverId", sid).eq("status", "PROCESSING"))
        .collect();
      for (const p of processing) {
        if (p.claimExpiresAt && p.claimExpiresAt < now) {
          await ctx.db.patch(p._id, {
            status: "PENDING",
            claimedBy: undefined,
            claimedAt: undefined,
            claimExpiresAt: undefined,
            claimToken: undefined,
            updatedAt: now,
          });
          // O addon pegou e sumiu (caiu/reiniciou): a entrega volta para a
          // fila e isso fica registrado no log completo.
          await logDeliveryEvent(ctx, {
            deliveryId: p._id,
            publicId: p.publicId,
            orderId: p.orderId,
            orderNumber: p.orderNumber,
            type: DELIVERY_EVENT.claimExpired,
            status: "PENDING",
            message: `Claim expirou (addon não confirmou) — voltou para a fila (tentativa ${p.attempts}/${p.maxAttempts})`,
            actor: "SYSTEM",
            serverId: p.serverId,
            addonId: p.addonId,
            details: { attempts: p.attempts, claimExpiresAt: p.claimExpiresAt },
          });
        }
      }
    }

    // 2) seleciona entregas disponíveis (PENDING e FAILED retryable vencidas)
    const candidates: any[] = [];
    for (const sid of visibleServers(serverId)) {
      const pending = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) => q.eq("serverId", sid).eq("status", "PENDING"))
        .collect();
      for (const r of pending) {
        if (r.executeAt > now) continue;
        if (addonId && r.addonId !== addonId) continue;
        candidates.push(r);
      }
      // retries agendados: status FAILED + retryable=true + nextAttemptAt vencido
      const failed = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_server_status", (q) => q.eq("serverId", sid).eq("status", "FAILED"))
        .collect();
      for (const r of failed) {
        if (r.retryable !== true) continue;
        if (r.requiresManualIntervention) continue;
        if ((r.nextAttemptAt ?? r.executeAt) > now) continue;
        if (addonId && r.addonId !== addonId) continue;
        candidates.push(r);
      }
    }
    candidates.sort((a, b) => a.executeAt - b.executeAt || a.createdAt - b.createdAt);
    const chosen = candidates.slice(0, Math.max(1, Math.min(limit, 100)));

    // 3) reserva atomicamente (a mutation é serializável: ninguém pega o mesmo doc)
    const claimed: any[] = [];
    for (const c of chosen) {
      const claimToken = generateClaimToken();
      await ctx.db.patch(c._id, {
        status: "PROCESSING",
        claimedBy: apiKeyId,
        claimedAt: now,
        claimExpiresAt: now + lease,
        claimToken,
        attempts: c.attempts + 1,
        lastAttemptAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("deliveryAttempts", {
        deliveryId: c._id,
        apiKeyId,
        serverId,
        status: "PROCESSING",
        startedAt: now,
        createdAt: now,
      });
      // Log completo: quem pegou, quando, com que tentativa e se era reenvio.
      await logDeliveryEvent(ctx, {
        deliveryId: c._id,
        publicId: c.publicId,
        orderId: c.orderId,
        orderNumber: c.orderNumber,
        type: DELIVERY_EVENT.claimed,
        status: "PROCESSING",
        message: `Pega pelo addon · tentativa ${c.attempts + 1}/${c.maxAttempts}${
          c.resendCount ? ` · REENVIO #${c.resendCount}${c.resentBy ? ` (${c.resentBy})` : ""}` : ""
        }`,
        actor: "ADDON",
        actorName: addonId ?? serverId,
        serverId,
        addonId: addonId ?? c.addonId,
        apiKeyId,
        details: {
          attempt: c.attempts + 1,
          maxAttempts: c.maxAttempts,
          leaseMs: lease,
          claimToken,
          resendCount: c.resendCount ?? 0,
          resentBy: c.resentBy ?? null,
        },
      });
      claimed.push({
        id: c.publicId,
        server_id: c.serverId,
        addon_id: c.addonId,
        action: c.action,
        action_id: c.actionId ?? null,
        step_index: c.stepIndex ?? null,
        delivery_group_id: c.deliveryGroupId ?? null,
        mode: c.deliveryMode ?? "SERVER",
        reference_id: c.referenceId ?? null,
        reference_revision: c.referenceRevision ?? null,
        command: c.command ?? null,
        payload: c.payload ?? {},
        offline_execute: c.offlineExecute,
        execute_at: new Date(c.executeAt).toISOString(),
        status: "PROCESSING",
        attempts: c.attempts + 1,
        max_attempts: c.maxAttempts,
        claim_token: claimToken,
        claimed_at: new Date(now).toISOString(),
        claimed_by: apiKeyId,
        claim_expires_at: new Date(now + lease).toISOString(),
        // Reenvio pelo painel (null quando nunca foi reenviada) e a linha
        // pronta para imprimir no console do servidor.
        resent: resendInfo(c),
        console_log: deliveryConsoleLine(c, c.attempts + 1),
        order: {
          id: c.orderNumber,
          client_identifier: c.clientIdentifier,
          variables: c.variables,
        },
      });
    }
  return claimed;
}

export const internalClaim = internalMutation({
  args: {
    apiKeyId: v.id("apiKeysV1"),
    serverId: v.string(),
    addonId: v.optional(v.string()),
    limit: v.number(),
    leaseMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => claimForAddon(ctx, args),
});

// ─── Rota fundida: autenticação + trabalho numa ÚNICA chamada ───
//
// Por que: o Convex cobra por chamada de função, e a action HTTP da API v1
// fazia `runMutation(internalAuthorize)` e depois `runQuery`/`runMutation` do
// trabalho — 2 funções por requisição (3 contando a action). As quatro rotas
// abaixo são praticamente todas as ~4.500 chamadas diárias do addon.
//
// Autorizar e executar na MESMA mutation corta 1 chamada por requisição sem
// afrouxar nada: hash da chave, chave ativa/revogada, prefixo do token, rate
// limit por bucket, `lastUsedAt` e scope continuam sendo checados, na mesma
// ordem e com as mesmas mensagens de erro da rota antiga.

export const internalAuthorizedCall = internalMutation({
  args: {
    hash: v.string(),
    expectedPrefix: v.string(),
    tokenIsLive: v.boolean(),
    bucket: v.string(),
    rateLimit: v.number(),
    windowMs: v.number(),
    method: v.string(),
    path: v.string(),
    ip: v.optional(v.string()),
    kind: v.union(
      v.literal("sync"),
      v.literal("queued"),
      v.literal("claim"),
      v.literal("heartbeat"),
    ),
    cursor: v.optional(v.string()),
    pageLimit: v.optional(v.number()),
    addonFilter: v.optional(v.string()),
    requestedServerId: v.optional(v.string()),
    version: v.optional(v.string()),
    minecraftVersion: v.optional(v.string()),
    apiClientVersion: v.optional(v.string()),
    capabilities: v.optional(v.any()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await authorizeRequest(ctx, {
      hash: args.hash,
      bucket: args.bucket,
      limit: args.rateLimit,
      windowMs: args.windowMs,
      method: args.method,
      path: args.path,
      ip: args.ip,
    });
    if (!auth.ok) {
      return {
        ok: false as const,
        status: 401,
        code: auth.code,
        message:
          auth.code === "API_KEY_REVOKED"
            ? "Esta chave de API foi revogada ou desativada."
            : "Chave de API inválida.",
      };
    }
    const key = auth.key;
    if (!args.tokenIsLive || key.prefix !== args.expectedPrefix) {
      return {
        ok: false as const,
        status: 401,
        code: "INVALID_API_KEY" as const,
        message: "Chave de API inválida.",
      };
    }

    // Mesma ordem da rota antiga: rate limit ANTES do scope.
    const logFailure = async (statusCode: number, error: string) => {
      await ctx.db.insert("apiLogs", {
        apiKeyId: key.id,
        serverId: key.serverId,
        addonId: key.addonId,
        endpoint: args.path,
        method: args.method,
        statusCode,
        durationMs: 0,
        ip: args.ip,
        error,
        createdAt: Date.now(),
      });
    };
    if (!auth.rate.allowed) {
      await logFailure(429, "rate limit");
      return {
        ok: false as const,
        status: 429,
        code: "RATE_LIMIT_REACHED" as const,
        message: "Limite de requisições excedido.",
        rate: auth.rate,
      };
    }

    const scopes: string[] = key.scopes ?? [];
    const serverId = key.serverId || "GLOBAL";
    const addonId = key.addonId || undefined;
    const deny = async (message: string) => {
      await logFailure(403, "scope");
      return {
        ok: false as const,
        status: 403,
        code: "FORBIDDEN_SCOPE" as const,
        message,
        rate: auth.rate,
      };
    };

    if (args.kind === "sync") {
      const need = [API_SCOPES.productsRead, API_SCOPES.categoriesRead];
      if (!need.some((s) => scopes.includes(s))) {
        return await deny(`A chave precisa de uma das permissões: ${need.join(", ")}.`);
      }
      const data = await syncChangesCore(ctx, {
        serverId,
        addonId,
        cursor: args.cursor,
        limit: args.pageLimit ?? 100,
      });
      return { ok: true as const, rate: auth.rate, data };
    }

    if (args.kind === "queued") {
      if (!scopes.includes(API_SCOPES.deliveriesRead)) {
        return await deny(`A chave não possui a permissão '${API_SCOPES.deliveriesRead}'.`);
      }
      const data = await listQueuedCore(ctx, {
        serverId,
        addonId: addonId ?? args.addonFilter,
        limit: args.pageLimit ?? 50,
        now: Date.now(),
      });
      return { ok: true as const, rate: auth.rate, data };
    }

    if (args.kind === "claim") {
      const need = [API_SCOPES.deliveriesClaim, API_SCOPES.deliveriesUpdate];
      if (!need.some((s) => scopes.includes(s))) {
        return await deny(`A chave precisa de uma das permissões: ${need.join(", ")}.`);
      }
      const claimed = await claimForAddon(ctx, {
        apiKeyId: key.id,
        serverId,
        addonId: addonId ?? args.addonFilter,
        limit: args.pageLimit ?? 20,
      });
      return {
        ok: true as const,
        rate: auth.rate,
        data: { data: claimed, count: claimed.length },
      };
    }

    if (!scopes.includes(API_SCOPES.serverHeartbeat)) {
      return await deny(`A chave não possui a permissão '${API_SCOPES.serverHeartbeat}'.`);
    }
    const hbServerId = args.requestedServerId ? String(args.requestedServerId) : serverId;
    const result = await heartbeatCore(ctx, {
      serverId: hbServerId,
      addonId,
      version: args.version,
      minecraftVersion: args.minecraftVersion,
      apiClientVersion: args.apiClientVersion,
      capabilities: args.capabilities,
      errorCode: args.errorCode,
      ip: args.ip,
    });
    return {
      ok: true as const,
      rate: auth.rate,
      data: { ...result, server_id: hbServerId, online: true },
    };
  },
});

// ─── Confirmação (PATCH command) ───

function commandVisible(commandServerId: string, keyServerId: string): boolean {
  if (keyServerId === "GLOBAL" || !keyServerId) return true;
  return commandServerId === keyServerId || commandServerId === "GLOBAL";
}

export const internalConfirm = internalMutation({
  args: {
    publicId: v.string(),
    status: v.union(
      v.literal("DONE"),
      v.literal("FAILED"),
      v.literal("PENDING"),
      v.literal("CANCELED"),
    ),
    response: v.optional(v.string()),
    reason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    claimToken: v.optional(v.string()),
    apiKeyId: v.id("apiKeysV1"),
    serverId: v.string(),
    addonId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { publicId, status, response, reason, errorCode, retryable, claimToken, apiKeyId, serverId, addonId },
  ) => {
    const c: any = await ctx.db
      .query("deliveryCommands")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
      .first();
    if (!c) return { ok: false as const, code: "NOT_FOUND" as const };

    // ── autorização por objeto: uma chave não confirma entrega de outro servidor/addon ──
    if (!commandVisible(c.serverId, serverId)) {
      return { ok: false as const, code: "FORBIDDEN" as const };
    }
    if (addonId && c.addonId !== addonId) {
      return { ok: false as const, code: "FORBIDDEN" as const };
    }

    const now = Date.now();

    // ── claim_token: só exigido quando a entrega foi de fato reservada (PROCESSING) ──
    if (c.status === "PROCESSING") {
      if (!claimToken || c.claimToken !== claimToken) {
        return { ok: false as const, code: "CLAIM_INVALID" as const };
      }
      if (c.claimExpiresAt !== undefined && c.claimExpiresAt < now) {
        return { ok: false as const, code: "CLAIM_EXPIRED" as const };
      }
    }

    const clearClaim = {
      claimedBy: undefined,
      claimedAt: undefined,
      claimExpiresAt: undefined,
      claimToken: undefined,
    };

    if (status === "DONE") {
      if (c.status === "DONE") {
        await logDeliveryEvent(ctx, {
          deliveryId: c._id,
          publicId: c.publicId,
          orderId: c.orderId,
          orderNumber: c.orderNumber,
          type: DELIVERY_EVENT.confirmed,
          status: "DONE",
          message: `Confirmação repetida pelo addon (ignorada: já estava concluída)${
            response ? ` — ${response}` : ""
          }`,
          actor: "ADDON",
          actorName: addonId ?? serverId,
          serverId,
          addonId: addonId ?? c.addonId,
          apiKeyId,
          details: { idempotent: true },
        });
        return { ok: true as const, status: "DONE" as const, idempotent: true };
      }
      // O addon pode confirmar sem mandar `response`. Antes a loja gravava
      // "Entregue com sucesso" nesse caso (e o painel parecia ter prova de
      // sucesso). Agora fica explícito que ele não detalhou nada.
      const finalResponse = response?.trim() || "Sem resposta do addon (concluiu sem detalhar)";
      await ctx.db.patch(c._id, {
        status: "DONE",
        response: finalResponse,
        completedAt: now,
        errorCode: undefined,
        lastError: undefined,
        retryable: false,
        nextAttemptAt: undefined,
        requiresManualIntervention: false,
        ...clearClaim,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "DONE", finalResponse, reason);
      await logDeliveryEvent(ctx, {
        deliveryId: c._id,
        publicId: c.publicId,
        orderId: c.orderId,
        orderNumber: c.orderNumber,
        type: DELIVERY_EVENT.confirmed,
        status: "DONE",
        message: `Concluída pelo addon: ${finalResponse}${
          c.resendCount ? ` · após ${c.resendCount} reenvio(s) pelo painel` : ""
        }`,
        actor: "ADDON",
        actorName: addonId ?? serverId,
        serverId,
        addonId: addonId ?? c.addonId,
        apiKeyId,
        details: {
          response: finalResponse,
          addonSentResponse: Boolean(response?.trim()),
          attempts: c.attempts,
          maxAttempts: c.maxAttempts,
          resendCount: c.resendCount ?? 0,
        },
      });
      return { ok: true as const, status: "DONE" as const };
    }

    if (status === "CANCELED") {
      await ctx.db.patch(c._id, {
        status: "CANCELED",
        response: response ?? undefined,
        reason: reason ?? "Cancelado pelo addon",
        completedAt: now,
        ...clearClaim,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "CANCELED", response, reason);
      await logDeliveryEvent(ctx, {
        deliveryId: c._id,
        publicId: c.publicId,
        orderId: c.orderId,
        orderNumber: c.orderNumber,
        type: DELIVERY_EVENT.canceled,
        status: "CANCELED",
        message: `Cancelada pelo addon${response ? `: ${response}` : ""}`,
        actor: "ADDON",
        actorName: addonId ?? serverId,
        serverId,
        addonId: addonId ?? c.addonId,
        apiKeyId,
      });
      return { ok: true as const, status: "CANCELED" as const };
    }

    if (status === "PENDING") {
      // devolve para a fila sem consumir tentativa (ex.: jogador offline)
      const isOffline = errorCode === ERROR_CODES.PLAYER_OFFLINE || /PLAYER_OFFLINE/i.test(response ?? "");
      await ctx.db.patch(c._id, {
        status: "PENDING",
        response: response ?? ERROR_CODES.PLAYER_OFFLINE,
        reason: reason ?? undefined,
        errorCode: errorCode ?? (isOffline ? ERROR_CODES.PLAYER_OFFLINE : undefined),
        // offline não consome max_attempts: restaura a tentativa consumida no claim
        attempts: isOffline ? Math.max(0, c.attempts - 1) : c.attempts,
        executeAt: now,
        retryable: undefined,
        nextAttemptAt: undefined,
        requiresManualIntervention: false,
        ...clearClaim,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "PENDING", response, reason);
      await logDeliveryEvent(ctx, {
        deliveryId: c._id,
        publicId: c.publicId,
        orderId: c.orderId,
        orderNumber: c.orderNumber,
        type: isOffline ? DELIVERY_EVENT.awaitingPlayer : DELIVERY_EVENT.claimed,
        status: "PENDING",
        message: isOffline
          ? "Jogador offline — a entrega fica na fila esperando ele entrar (não consome tentativa)"
          : `Devolvida para a fila pelo addon${response ? `: ${response}` : ""}`,
        actor: "ADDON",
        actorName: addonId ?? serverId,
        serverId,
        addonId: addonId ?? c.addonId,
        apiKeyId,
        details: {
          playerOffline: isOffline,
          attempts: isOffline ? Math.max(0, c.attempts - 1) : c.attempts,
          errorCode: errorCode ?? (isOffline ? ERROR_CODES.PLAYER_OFFLINE : null),
        },
      });
      return { ok: true as const, status: "PENDING" as const, playerOffline: isOffline };
    }

    // ── FAILED ──
    const attempts = c.attempts;
    const code = errorCode ?? undefined;
    const forcedFinal = retryable === false || (code ? NON_RETRYABLE_CODES.has(code) : false);
    const exhausted = attempts >= c.maxAttempts;

    if (forcedFinal || exhausted) {
      const finalCode = exhausted ? ERROR_CODES.MAX_ATTEMPTS_REACHED : code;
      await ctx.db.patch(c._id, {
        status: "FAILED",
        response: response ?? "Falha na entrega",
        reason: reason ?? undefined,
        errorCode: finalCode,
        lastError: response ?? reason ?? undefined,
        retryable: false,
        nextAttemptAt: undefined,
        requiresManualIntervention: true,
        lastAttemptAt: now,
        completedAt: now,
        ...clearClaim,
        updatedAt: now,
      });
      await finishOpenAttempt(ctx, c._id, "FAILED", response, reason);
      await logDeliveryEvent(ctx, {
        deliveryId: c._id,
        publicId: c.publicId,
        orderId: c.orderId,
        orderNumber: c.orderNumber,
        type: DELIVERY_EVENT.failed,
        status: "FAILED",
        message: `Falha definitiva (${finalCode}): ${
          response ?? reason ?? "sem detalhe do addon"
        } — precisa de ação no painel`,
        actor: "ADDON",
        actorName: addonId ?? serverId,
        serverId,
        addonId: addonId ?? c.addonId,
        apiKeyId,
        details: {
          errorCode: finalCode,
          attempts,
          maxAttempts: c.maxAttempts,
          requiresManualIntervention: true,
          response: response ?? null,
          reason: reason ?? null,
        },
      });
      return { ok: true as const, status: "FAILED" as const, permanent: true, errorCode: finalCode };
    }

    // falha temporária → FAILED + retryable=true + backoff
    const delay = backoffFor(attempts);
    await ctx.db.patch(c._id, {
      status: "FAILED",
      response: response ?? "Falha temporária — nova tentativa agendada",
      reason: reason ?? undefined,
      errorCode: code ?? ERROR_CODES.TEMPORARY_STORAGE_ERROR,
      lastError: response ?? reason ?? undefined,
      retryable: true,
      nextAttemptAt: now + delay,
      requiresManualIntervention: false,
      lastAttemptAt: now,
      ...clearClaim,
      updatedAt: now,
    });
    await finishOpenAttempt(ctx, c._id, "FAILED", response, reason);
    await logDeliveryEvent(ctx, {
      deliveryId: c._id,
      publicId: c.publicId,
      orderId: c.orderId,
      orderNumber: c.orderNumber,
      type: DELIVERY_EVENT.failed,
      status: "FAILED",
      message: `Falha temporária (${code ?? ERROR_CODES.TEMPORARY_STORAGE_ERROR}): ${
        response ?? reason ?? "sem detalhe do addon"
      } — nova tentativa em ${Math.round(delay / 1000)}s`,
      actor: "ADDON",
      actorName: addonId ?? serverId,
      serverId,
      addonId: addonId ?? c.addonId,
      apiKeyId,
      details: {
        errorCode: code ?? ERROR_CODES.TEMPORARY_STORAGE_ERROR,
        retryInMs: delay,
        attempts,
        maxAttempts: c.maxAttempts,
        retryable: true,
        response: response ?? null,
      },
    });
    return { ok: true as const, status: "FAILED" as const, retryInMs: delay };
  },
});

async function finishOpenAttempt(
  ctx: any,
  deliveryId: any,
  status: string,
  response?: string,
  reason?: string,
) {
  const attempts = await ctx.db
    .query("deliveryAttempts")
    .withIndex("by_delivery", (q: any) => q.eq("deliveryId", deliveryId))
    .collect();
  const open = attempts
    .filter((a: any) => a.finishedAt === undefined)
    .sort((a: any, b: any) => b.startedAt - a.startedAt)[0];
  const now = Date.now();
  if (open) {
    await ctx.db.patch(open._id, {
      status,
      response: response ?? undefined,
      reason: reason ?? undefined,
      finishedAt: now,
    });
  } else {
    await ctx.db.insert("deliveryAttempts", {
      deliveryId,
      status,
      response: response ?? undefined,
      reason: reason ?? undefined,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
    });
  }
}

// ─── Heartbeat de servidores/addons ───

type HeartbeatArgs = {
  serverId: string;
  addonId?: string;
  version?: string;
  minecraftVersion?: string;
  apiClientVersion?: string;
  capabilities?: any;
  errorCode?: string;
  ip?: string;
};

/** Núcleo do heartbeat (reutilizado pela rota fundida). */
async function heartbeatCore(
  ctx: MutationCtx,
  { serverId, addonId, version, minecraftVersion, apiClientVersion, capabilities, errorCode, ip }: HeartbeatArgs,
) {
    const now = Date.now();
    const existing = addonId
      ? await ctx.db
          .query("addonServers")
          .withIndex("by_server_addon", (q) => q.eq("serverId", serverId).eq("addonId", addonId))
          .first()
      : await ctx.db
          .query("addonServers")
          .withIndex("by_server", (q) => q.eq("serverId", serverId))
          .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        addonId: addonId ?? existing.addonId,
        version: version ?? existing.version,
        minecraftVersion: minecraftVersion ?? existing.minecraftVersion,
        apiClientVersion: apiClientVersion ?? existing.apiClientVersion,
        capabilities: capabilities ?? existing.capabilities,
        lastErrorCode: errorCode ?? existing.lastErrorCode,
        lastErrorAt: errorCode ? now : existing.lastErrorAt,
        lastSeenAt: now,
        lastIp: ip ?? existing.lastIp,
        status: "online",
        updatedAt: now,
      });
      return { ok: true as const, serverId, server_time: new Date(now).toISOString() };
    }
    await ctx.db.insert("addonServers", {
      serverId,
      addonId: addonId ?? undefined,
      version: version ?? undefined,
      minecraftVersion: minecraftVersion ?? undefined,
      apiClientVersion: apiClientVersion ?? undefined,
      capabilities: capabilities ?? undefined,
      lastErrorCode: errorCode ?? undefined,
      lastErrorAt: errorCode ? now : undefined,
      lastSeenAt: now,
      lastIp: ip ?? undefined,
      status: "online",
      createdAt: now,
      updatedAt: now,
    });
  return { ok: true as const, serverId, server_time: new Date(now).toISOString() };
}

export const internalHeartbeat = internalMutation({
  args: {
    serverId: v.string(),
    addonId: v.optional(v.string()),
    version: v.optional(v.string()),
    minecraftVersion: v.optional(v.string()),
    apiClientVersion: v.optional(v.string()),
    capabilities: v.optional(v.any()),
    errorCode: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => heartbeatCore(ctx, args),
});

export const internalListServers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const servers = await ctx.db.query("addonServers").collect();
    const now = Date.now();
    return servers
      .map((s) => ({
        serverId: s.serverId,
        addonId: s.addonId ?? "",
        version: s.version ?? "",
        minecraftVersion: s.minecraftVersion ?? "",
        apiClientVersion: s.apiClientVersion ?? "",
        capabilities: s.capabilities ?? null,
        lastErrorCode: s.lastErrorCode ?? "",
        lastErrorAt: s.lastErrorAt ?? null,
        lastSeenAt: s.lastSeenAt,
        lastIp: s.lastIp ?? "",
        online: now - s.lastSeenAt <= HEARTBEAT_ONLINE_MS,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  },
});

// ─── Idempotência persistente (Idempotency-Key) ───

export const internalIdempotencyGet = internalQuery({
  args: { apiKeyId: v.id("apiKeysV1"), key: v.string() },
  handler: async (ctx, { apiKeyId, key }) => {
    const doc = await ctx.db
      .query("idempotencyKeysV1")
      .withIndex("by_key", (q) => q.eq("apiKeyId", apiKeyId).eq("key", key))
      .first();
    if (!doc) return null;
    if (doc.expiresAt && doc.expiresAt < Date.now()) return null;
    return { requestHash: doc.requestHash, status: doc.status, response: doc.response };
  },
});

export const internalIdempotencyStore = internalMutation({
  args: {
    apiKeyId: v.id("apiKeysV1"),
    key: v.string(),
    method: v.string(),
    endpoint: v.string(),
    requestHash: v.string(),
    status: v.number(),
    response: v.any(),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("idempotencyKeysV1")
      .withIndex("by_key", (q) => q.eq("apiKeyId", args.apiKeyId).eq("key", args.key))
      .first();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24h
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, createdAt: now, expiresAt });
      return;
    }
    await ctx.db.insert("idempotencyKeysV1", { ...args, createdAt: now, expiresAt });
  },
});

// ─── Logs de chamadas ───

export const internalLog = internalMutation({
  args: {
    apiKeyId: v.optional(v.id("apiKeysV1")),
    serverId: v.optional(v.string()),
    addonId: v.optional(v.string()),
    deliveryId: v.optional(v.string()),
    endpoint: v.string(),
    method: v.string(),
    statusCode: v.number(),
    durationMs: v.number(),
    ip: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("apiLogs", { ...args, createdAt: Date.now() });
  },
});

export const adminListLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "logs.view");
    // Índice por data: pega os 200 mais recentes sem carregar a tabela inteira.
    return await ctx.db
      .query("apiLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(200);
  },
});

/** Lista os servidores para o painel de entregas. */
export const adminListServers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "deliveries.view");
    const servers = await ctx.db.query("addonServers").collect();
    const now = Date.now();
    return servers
      .map((s) => ({
        _id: s._id as string,
        serverId: s.serverId,
        addonId: s.addonId ?? "",
        version: s.version ?? "",
        minecraftVersion: s.minecraftVersion ?? "",
        apiClientVersion: s.apiClientVersion ?? "",
        capabilities: s.capabilities ?? null,
        lastErrorCode: s.lastErrorCode ?? "",
        lastErrorAt: s.lastErrorAt ?? null,
        lastSeenAt: s.lastSeenAt,
        online: now - s.lastSeenAt <= HEARTBEAT_ONLINE_MS,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  },
});
