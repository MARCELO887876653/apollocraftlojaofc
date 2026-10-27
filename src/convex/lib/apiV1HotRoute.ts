// ─────────────────────────────────────────────────────────────
// Rotas QUENTES da API v1 (todo o tráfego do addon).
//
// Por que este módulo existe: o Convex cobra por CHAMADA DE FUNÇÃO e a rota
// quente custava três: httpAction → action `apiV1.handle` → mutation
// `internalAuthorizedCall`. A action só servia para rotear e traduzir a
// resposta — trabalho que o próprio httpAction consegue fazer.
//
// Aqui o roteamento (método + caminho + query/corpo → argumentos da mutation) e
// a tradução da resposta vivem em funções PURAS, usadas pelos DOIS caminhos:
//   • `src/convex/http.ts` chama a mutation direto (2 chamadas por requisição);
//   • `src/convex/apiV1.ts` mantém o caminho antigo para as rotas não quentes
//     (e como referência dos testes).
//
// Assim não existe regra duplicada: se uma rota quente mudar de parâmetro, muda
// aqui e os dois caminhos continuam idênticos. Nenhuma checagem de segurança é
// afetada — hash da chave, revogação, prefixo do token, rate limit, `lastUsedAt`
// e scope continuam todos dentro da mutation.
// ─────────────────────────────────────────────────────────────

/** Limite de leitura por chave (GET). */
export const GET_RATE_LIMIT = 120;
/** Limite de escrita por chave (POST/PATCH). */
export const WRITE_RATE_LIMIT = 30;
/** Janela do rate limit (1 minuto). */
export const RATE_LIMIT_WINDOW_MS = 60_000;

export type HotRouteKind = "sync" | "queued" | "claim" | "heartbeat";

/** Argumentos que a mutation fundida recebe, já normalizados a partir da rota. */
export type HotRouteArgs = {
  cursor?: string;
  pageLimit?: number;
  addonFilter?: string;
  requestedServerId?: string;
  version?: string;
  minecraftVersion?: string;
  apiClientVersion?: string;
  capabilities?: unknown;
  errorCode?: string;
};

export type HotRouteResolution = {
  kind: HotRouteKind;
  bucket: "read" | "write";
  rateLimit: number;
  windowMs: number;
  args: HotRouteArgs;
};

/**
 * Corpo em objeto. `{}` quando vazio (mesmo comportamento da rota antiga, que
 * aceitava um POST sem corpo) e `null` quando o texto existe mas não é um
 * objeto JSON — nesse caso quem responde é o caminho antigo, com o mesmo 422.
 */
export function parseJsonObject(bodyText?: string): Record<string, any> | null {
  if (!bodyText) return {};
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

/**
 * Resolve a rota quente. Devolve `null` quando não é uma das quatro rotas do
 * addon (ou quando o corpo é inválido) — nesses casos o chamador segue pelo
 * caminho antigo, sem nenhuma mudança de comportamento.
 */
export function resolveHotRoute(input: {
  method: string;
  path: string;
  query?: Record<string, string>;
  bodyText?: string;
}): HotRouteResolution | null {
  const { method, path } = input;
  const q = input.query ?? {};

  const segs = path.split("/").filter(Boolean);
  const isV1 = segs[0] === "api" && segs[1] === "v1";
  if (!isV1) return null;
  const afterV1 = segs.slice(2);
  const isApp = afterV1[0] === "app";
  const rest = isApp ? afterV1.slice(1) : afterV1;
  const route = rest.join("/");

  const isWrite = method !== "GET";
  const base = {
    bucket: (isWrite ? "write" : "read") as "read" | "write",
    rateLimit: isWrite ? WRITE_RATE_LIMIT : GET_RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  };

  // GET /api/v1/sync/changes?cursor=…&limit=… — o corpo não é lido.
  if (route === "sync/changes" && method === "GET") {
    return {
      kind: "sync",
      ...base,
      args: {
        cursor: q.cursor ? String(q.cursor) : undefined,
        pageLimit: Math.min(Number(q.limit) || 100, 200),
      },
    };
  }

  // GET /api/v1/app/queued_commands?limit=…&addon_id=… — corpo não lido.
  if (route === "queued_commands" && method === "GET") {
    return {
      kind: "queued",
      ...base,
      args: {
        pageLimit: Math.min(Number(q.limit) || 50, 200),
        addonFilter: q.addon_id ? q.addon_id : undefined,
      },
    };
  }

  // POST /api/v1/app/queued_commands/claim
  if (route === "queued_commands/claim" && method === "POST") {
    const body = parseJsonObject(input.bodyText);
    if (!body) return null; // corpo inválido → caminho antigo (422)
    return {
      kind: "claim",
      ...base,
      args: {
        pageLimit: Math.min(Number(body.limit) || 20, 100),
        addonFilter: body.addon_id ? String(body.addon_id) : undefined,
      },
    };
  }

  // POST /api/v1/app/heartbeat
  if (route === "heartbeat" && method === "POST") {
    const body = parseJsonObject(input.bodyText);
    if (!body) return null; // corpo inválido → caminho antigo (422)
    return {
      kind: "heartbeat",
      ...base,
      args: {
        requestedServerId: body.server_id ? String(body.server_id) : undefined,
        version:
          body.version || body.addon_version
            ? String(body.version ?? body.addon_version)
            : undefined,
        minecraftVersion: body.minecraft_version ? String(body.minecraft_version) : undefined,
        apiClientVersion: body.api_client_version
          ? String(body.api_client_version)
          : undefined,
        capabilities: body.capabilities,
        errorCode: body.error_code ? String(body.error_code) : undefined,
      },
    };
  }

  return null;
}

/** Taxa de rate limit devolvida pela mutation fundida. */
export type HotRouteRate = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
};

/** Retorno da mutation fundida (mesmo formato que a rota antiga consumia). */
export type HotRouteMutationResult = {
  ok: boolean;
  /** Ausente na resposta de sucesso (que sempre vira HTTP 200). */
  status?: number;
  code?: string;
  message?: string;
  rate?: HotRouteRate;
  data?: unknown;
};

export type HotRouteResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

/**
 * Traduz o retorno da mutation para a resposta HTTP — exatamente a mesma
 * tradução que `apiV1.handle` fazia (`X-RateLimit-*`, `Retry-After` e o corpo
 * `{ errors: [{ message, code }] }`).
 */
export function hotRouteResponse(res: HotRouteMutationResult): HotRouteResponse {
  const headers: Record<string, string> = res.rate
    ? {
        "X-RateLimit-Limit": String(res.rate.limit),
        "X-RateLimit-Remaining": String(res.rate.remaining),
      }
    : {};
  if (res.rate && !res.rate.allowed) headers["Retry-After"] = String(res.rate.retryAfterSec);
  if (!res.ok) {
    return {
      status: res.status ?? 500,
      body: { errors: [{ message: res.message, code: res.code }] },
      headers,
    };
  }
  return { status: 200, body: res.data, headers };
}
