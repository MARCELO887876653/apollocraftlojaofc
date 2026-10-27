import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { COUNTER_KEYS, readCounter } from "./lib/counters";
import { readQueueCounts } from "./lib/queueStats";

// ─────────────────────────────────────────────────────────────
// Saúde operacional — relatório SOB DEMANDA
//
// Por que existe: depois de uma auditoria é fácil perder de vista o que está
// consumindo cota. Este relatório mostra, em uma chamada, QUEM está chamando a
// API, QUANTAS vezes, com que erro e o que está na fila — o suficiente para
// perceber um addon martelando a rota ou um defeito de configuração repetindo
// erro antes de o Convex desativar o deployment por limite de uso.
//
// Desenho consciente:
//  • NÃO existe cron, NÃO existe polling e NÃO existe assinatura de cliente.
//    O relatório só executa quando alguém pede (CLI ou painel). Custo zero
//    quando ninguém pede.
//  • A leitura é LIMITADA (`sample`, no máximo 3.000 linhas recentes):
//    `apiLogs` só cresce, então varrer a tabela seria trocar um problema de
//    cota por outro.
//  • Nada é bloqueado nem alterado: os "avisos" são texto. Não há corte
//    automático de tráfego aqui (isso exigiria autorização do dono).
//
// Uso pela CLI (somente leitura):
//
//   bun convex run opsHealth:report
//   bun convex run opsHealth:report '{"sample": 2000}'
//
// ─────────────────────────────────────────────────────────────

const DEFAULT_SAMPLE = 1000;
const MIN_SAMPLE = 100;
const MAX_SAMPLE = 3000;

/**
 * Limites que caracterizam "crescimento anormal". São avisos do relatório, não
 * gatilhos: nada é bloqueado nem desativado automaticamente.
 */
const THRESHOLDS = {
  /** Linhas de log por hora (o sucesso é amostrado, então isto mede o log). */
  logRowsPerHour: 120,
  /** Requisições/hora medidas na janela de rate limit da chave. */
  requestsPerHour: 600,
  /** Fração de linhas de erro na amostra. */
  errorRate: 0.05,
  /** Fração da amostra concentrada em UM mesmo erro. */
  repeatedErrorShare: 0.5,
} as const;

/** Esconde o id da chave na chave de rate limit (`apiv1:<id>:read`). */
function maskRateKey(key: string): string {
  return key.replace(/^apiv1:[^:]+:/, "apiv1:<chave>:");
}

export const report = internalQuery({
  args: { sample: v.optional(v.number()) },
  handler: async (ctx, { sample }) => {
    const size = Math.max(MIN_SAMPLE, Math.min(Math.floor(sample ?? DEFAULT_SAMPLE), MAX_SAMPLE));

    // ── Amostra das linhas mais recentes (índice por data, leitura limitada) ──
    const recent = await ctx.db
      .query("apiLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(size);

    const now = Date.now();
    const newest = recent[0]?.createdAt ?? now;
    const oldest = recent[recent.length - 1]?.createdAt ?? now;
    const hours = Math.max(1 / 60, (newest - oldest) / 3_600_000);

    const byEndpoint = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const byHour = new Map<string, number>();
    const errorSignatures = new Map<string, { count: number; last: number; sample: string }>();
    let lastHour = 0;

    for (const row of recent) {
      const route = `${row.method} ${row.endpoint}`;
      byEndpoint.set(route, (byEndpoint.get(route) ?? 0) + 1);
      const status = String(row.statusCode);
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
      byHour.set(
        new Date(row.createdAt).toISOString().slice(0, 13),
        (byHour.get(new Date(row.createdAt).toISOString().slice(0, 13)) ?? 0) + 1,
      );
      if (now - row.createdAt <= 3_600_000) lastHour++;
      if (row.statusCode >= 400) {
        const signature = `${route} ${row.statusCode} ${row.error ?? "(sem mensagem)"}`;
        const entry = errorSignatures.get(signature) ?? {
          count: 0,
          last: 0,
          sample: row.error ?? "",
        };
        entry.count += 1;
        entry.last = Math.max(entry.last, row.createdAt);
        errorSignatures.set(signature, entry);
      }
    }

    const total = recent.length;
    const errors = [...byStatus.entries()]
      .filter(([status]) => Number(status) >= 400)
      .reduce((s, [, count]) => s + count, 0);
    const errorRate = total ? errors / total : 0;
    const topErrors = [...errorSignatures.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([signature, entry]) => ({
        signature,
        count: entry.count,
        share: total ? Number((entry.count / total).toFixed(3)) : 0,
        lastAt: new Date(entry.last).toISOString(),
      }));
    const repeatedErrorShare = topErrors[0]?.share ?? 0;
    const logRowsPerHour = total / hours;

    // ── Janelas de rate limit: a taxa REAL de requisições neste minuto ──
    // Uma leitura por chave+bucket (a tabela é pequena por construção). É a
    // única medida de requisições que não passa pela amostragem do log.
    const rateDocs = await ctx.db.query("rateLimits").collect();
    const apiRateDocs = rateDocs.filter((d) => d.key.startsWith("apiv1:"));
    // A taxa sai da ÚLTIMA JANELA COMPLETA (início→início), nunca de uma janela
    // recém-aberta: com 2 segundos de janela, 1 chamada virava "30/min" e o
    // aviso disparava sem que nada estivesse errado. Sem janela fechada ainda
    // (primeiro minuto após o deploy), `perMinute` fica `null` e não há palpite.
    const liveWindows = apiRateDocs
      .map((d) => {
        const elapsedSec = Math.max(1, (now - d.windowStart) / 1000);
        const closedSec =
          d.prevWindowStart !== undefined ? (d.windowStart - d.prevWindowStart) / 1000 : 0;
        const hasClosed = d.prevCount !== undefined && closedSec >= 15;
        const perMinute = hasClosed
          ? Number((((d.prevCount ?? 0) / closedSec) * 60).toFixed(1))
          : null;
        return {
          key: maskRateKey(d.key),
          requestsInWindow: d.count,
          requestsInPreviousWindow: hasClosed ? (d.prevCount ?? 0) : null,
          windowStartedAt: new Date(d.windowStart).toISOString(),
          elapsedSec: Math.round(elapsedSec),
          measuredOverSec: hasClosed ? Math.round(closedSec) : null,
          perMinute,
          lastSampleAt: d.lastSampleAt ? new Date(d.lastSampleAt).toISOString() : null,
          lastErrorAt: d.lastErrorAt ? new Date(d.lastErrorAt).toISOString() : null,
        };
      })
      .sort((a, b) => (b.perMinute ?? -1) - (a.perMinute ?? -1));
    const measured = liveWindows.filter((w) => w.perMinute !== null);
    const requestsPerHour = measured.length
      ? Math.round(measured.reduce((s, w) => s + (w.perMinute ?? 0), 0) * 60)
      : null;

    // ── Estado dos dados (contadores, fila, addons) ──
    const [ordersTotal, ordersPaid, ordersPending, revenuePaidCents, customersTotal, queue] =
      await Promise.all([
        readCounter(ctx, COUNTER_KEYS.ordersTotal),
        readCounter(ctx, COUNTER_KEYS.ordersPaid),
        readCounter(ctx, COUNTER_KEYS.ordersPending),
        readCounter(ctx, COUNTER_KEYS.revenuePaidCents),
        readCounter(ctx, COUNTER_KEYS.customersTotal),
        readQueueCounts(ctx),
      ]);
    const rollupsReady = (await readCounter(ctx, COUNTER_KEYS.statsRollups)) === 1;
    const servers = await ctx.db.query("addonServers").collect();

    // ── Avisos (texto; nada é bloqueado) ──
    const warnings: { code: string; message: string }[] = [];
    if (requestsPerHour !== null && requestsPerHour > THRESHOLDS.requestsPerHour) {
      warnings.push({
        code: "REQUESTS_HIGH",
        message: `~${requestsPerHour} requisições/hora na última janela completa de rate limit (limite de aviso: ${THRESHOLDS.requestsPerHour}).`,
      });
    }
    if (logRowsPerHour > THRESHOLDS.logRowsPerHour) {
      warnings.push({
        code: "LOGS_GROWING",
        message: `${logRowsPerHour.toFixed(1)} linhas/hora em apiLogs na amostra (limite de aviso: ${THRESHOLDS.logRowsPerHour}).`,
      });
    }
    if (errorRate > THRESHOLDS.errorRate) {
      warnings.push({
        code: "ERROR_RATE_HIGH",
        message: `${(errorRate * 100).toFixed(1)}% da amostra é erro (limite de aviso: ${THRESHOLDS.errorRate * 100}%).`,
      });
    }
    if (repeatedErrorShare > THRESHOLDS.repeatedErrorShare) {
      warnings.push({
        code: "REPEATED_ERROR",
        message: `Um único erro concentra ${(repeatedErrorShare * 100).toFixed(0)}% da amostra — provável addon mal configurado martelando a rota.`,
      });
    }
    if (!rollupsReady) {
      warnings.push({
        code: "ROLLUPS_PENDING",
        message:
          "Backfill dos rollups ainda não foi executado: o painel usa o caminho de varredura (mais caro). Precisa de autorização.",
      });
    }

    return {
      generatedAt: new Date(now).toISOString(),
      sample: { rows: total, cappedAt: MAX_SAMPLE, from: new Date(oldest).toISOString(), to: new Date(newest).toISOString(), hours: Number(hours.toFixed(2)) },
      rates: {
        requestsPerHour,
        logRowsPerHour: Number(logRowsPerHour.toFixed(2)),
        logRowsLastHour: lastHour,
        errorRate: Number(errorRate.toFixed(4)),
        repeatedErrorShare,
      },
      byEndpoint: [...byEndpoint.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([route, count]) => ({ route, count })),
      byStatus: Object.fromEntries([...byStatus.entries()].sort()),
      logsByHour: Object.fromEntries([...byHour.entries()].sort()),
      topErrors,
      liveWindows,
      otherRateLimitKeys: rateDocs.length - apiRateDocs.length,
      data: {
        ordersTotal,
        ordersPaid,
        ordersPending,
        revenuePaidCents,
        customersTotal,
        rollupsReady,
        queue,
        servers: servers.map((s) => ({
          serverId: s.serverId,
          addonId: s.addonId ?? "",
          version: s.version ?? "",
          lastSeenAt: new Date(s.lastSeenAt).toISOString(),
          online: now - s.lastSeenAt <= 90_000,
        })),
      },
      thresholds: THRESHOLDS,
      warnings,
      readOnly: true,
      deletesNothing: true,
    };
  },
});
