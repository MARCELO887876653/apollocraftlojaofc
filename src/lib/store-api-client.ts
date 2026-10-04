// ─────────────────────────────────────────────────────────────
// SDK/helper reutilizável da API v1 (Apollo Craft).
//
// Roda em Node 18+ (fetch global) E no Minecraft Bedrock Dedicated
// Server. No BDS o `fetch` não existe: passe um `transport` baseado em
// @minecraft/server-net (http.request) — veja o exemplo completo em
// /docs/api. O restante do SDK é idêntico.
//
//   import { createStoreApi } from "./store-api-client";
//   const storeApi = createStoreApi({
//     baseUrl: "https://tidy-mandrill-432.convex.site/api/v1",
//     apiKey: "sk_live_...",
//     serverId: "survival-01",
//     addonId: "apollo-store",
//   });
//   await storeApi.connection.test();                    // handshake /app/me
//   const cat = await storeApi.categories.upsert({ external_id: "apollo:kits", name: "Kits" });
//   const prod = await storeApi.products.upsert({ external_id: "apollo:kit:vip", name: "Kit VIP", price: 19.9, ... });
//   await storeApi.products.setDeliveryRecipe(prod.id, { version: 1, actions: [...] });
//   await storeApi.products.publish(prod.id);
// ─────────────────────────────────────────────────────────────

export type DeliveryMode = "SERVER" | "LOCAL_REFERENCE";
export type QuantityMode = "MULTIPLY" | "REPEAT" | "IGNORE";

export type DeliveryAction = {
  /** id estável da ação (para idempotência/logs/retry por step). */
  id?: string;
  type: string;
  mode?: DeliveryMode;
  /** LOCAL_REFERENCE: o item/kit vive no addon. */
  reference_id?: string;
  reference_revision?: number;
  /** Somente exibição — nunca usado para reconstruir a entrega. */
  contents_preview?: { type_id: string; name?: string; amount?: number }[];
  quantity_mode?: QuantityMode;
  payload?: any;
  command?: string;
  offline_execute?: boolean;
  server_id?: string;
  addon_id?: string;
  delay_seconds?: number;
  reverse_action?: string;
  reverse_payload?: any;
  reverse_delay_seconds?: number;
};

export type DeliveryRecipe = {
  version?: number;
  offline_execute?: boolean;
  actions: DeliveryAction[];
};

export type DeliveryStatus = "DONE" | "FAILED" | "PENDING" | "CANCELED";

export type StoreApiConfig = {
  /**
   * Base da API — HTTP actions do Convex: https://tidy-mandrill-432.convex.site/api/v1
   * (é um endereço público, não um segredo). Em ambientes de preview/dev use o
   * deployment correspondente (ex.: https://<dev>.convex.site/api/v1).
   */
  baseUrl: string;
  /** sk_live_... criada no painel → Integrações → API de entregas automáticas. */
  apiKey: string;
  /** Identificadores usados no handshake/heartbeat (opcional). */
  serverId?: string;
  addonId?: string;
  /** Timeout por requisição (ms). Padrão 15000. */
  timeoutMs?: number;
  /** Tentativas extras em erro de rede/5xx/429. Padrão 3. */
  maxRetries?: number;
  /** Transporte custom (Bedrock/server-net). Se ausente usa fetch global. */
  transport?: (req: TransportRequest) => Promise<TransportResponse>;
  /** Cabeçalho de autenticação. "bearer" (padrão) ou "x-api-key" (BDS). */
  authHeader?: "bearer" | "x-api-key";
};

export type TransportRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

export type TransportResponse = { status: number; body: string; headers?: Record<string, string> };

export class StoreApiError extends Error {
  status: number;
  code: string;
  retryAfterSec?: number;
  constructor(status: number, code: string, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "StoreApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

type RequestOptions = {
  method?: string;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Backoff exponencial com jitter. */
function backoffDelay(attempt: number): number {
  const base = Math.min(30_000, 500 * 2 ** attempt);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

async function defaultFetchTransport(req: TransportRequest, timeoutMs: number): Promise<TransportResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, body, headers };
  } finally {
    clearTimeout(timer);
  }
}

export function createStoreApi(config: StoreApiConfig) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? 15_000;
  const maxRetries = config.maxRetries ?? 3;
  const authHeader = config.authHeader ?? "bearer";

  function buildHeaders(hasBody: boolean, idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (authHeader === "x-api-key") headers["X-Api-Key"] = config.apiKey;
    else headers["Authorization"] = `Bearer ${config.apiKey}`;
    if (hasBody) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return headers;
  }

  async function request<T = any>(opts: RequestOptions): Promise<T> {
    const method = (opts.method ?? "GET").toUpperCase();
    const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    let url = `${baseUrl}${opts.path}`;
    if (opts.query) {
      const qs = new URLSearchParams();
      for (const [k, val] of Object.entries(opts.query)) {
        if (val !== undefined && val !== null) qs.set(k, String(val));
      }
      const q = qs.toString();
      if (q) url += `?${q}`;
    }
    const headers = buildHeaders(body !== undefined, opts.idempotencyKey);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: TransportResponse;
      try {
        res = config.transport
          ? await config.transport({ method, url, headers, body })
          : await defaultFetchTransport({ method, url, headers, body }, timeoutMs);
      } catch (e) {
        // erro de rede / API offline → backoff
        lastErr = e;
        if (attempt < maxRetries) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        throw new StoreApiError(0, "NETWORK_ERROR", "Falha de rede ao contatar a API da loja.");
      }

      const text = res.body ?? "";
      let json: any = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const retryAfter = Number(res.headers?.["retry-after"] ?? res.headers?.["Retry-After"]);
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffDelay(attempt));
          lastErr = new StoreApiError(res.status, "RETRY", "retry");
          continue;
        }
      }

      if (res.status >= 400) {
        const err = json?.errors?.[0];
        const retryAfter = Number(res.headers?.["retry-after"] ?? res.headers?.["Retry-After"]);
        throw new StoreApiError(
          res.status,
          err?.code ?? "HTTP_ERROR",
          err?.message ?? `HTTP ${res.status}`,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        );
      }
      if (text && json === null) {
        throw new StoreApiError(res.status, "INVALID_JSON", "Resposta inválida da API (JSON inválido).");
      }
      return json as T;
    }
    throw lastErr instanceof StoreApiError
      ? lastErr
      : new StoreApiError(0, "NETWORK_ERROR", "Falha de rede ao contatar a API da loja.");
  }

  const enc = encodeURIComponent;

  return {
    // ─── Conexão / handshake ───
    connection: {
      /** GET /app/me — use num botão "Testar conexão". */
      test: () => request({ path: "/app/me" }),
      me: () => request({ path: "/app/me" }),
    },

    // ─── Categorias ───
    categories: {
      list: () => request({ path: "/categories" }),
      get: (ref: string) => request({ path: `/categories/${enc(ref)}` }),
      create: (data: any, idempotencyKey?: string) =>
        request({ method: "POST", path: "/categories", body: data, idempotencyKey }),
      upsert: (data: any, idempotencyKey?: string) =>
        request({ method: "POST", path: "/categories/upsert", body: data, idempotencyKey }),
      update: (ref: string, data: any) =>
        request({ method: "PATCH", path: `/categories/${enc(ref)}`, body: data }),
      remove: (ref: string) => request({ method: "DELETE", path: `/categories/${enc(ref)}` }),
    },

    // ─── Produtos ───
    products: {
      list: () => request({ path: "/products" }),
      get: (ref: string) => request({ path: `/products/${enc(ref)}` }),
      create: (data: any, idempotencyKey?: string) =>
        request({ method: "POST", path: "/products", body: data, idempotencyKey }),
      upsert: (data: any, idempotencyKey?: string) =>
        request({ method: "POST", path: "/products/upsert", body: data, idempotencyKey }),
      update: (ref: string, data: any) =>
        request({ method: "PATCH", path: `/products/${enc(ref)}`, body: data }),
      remove: (ref: string) => request({ method: "DELETE", path: `/products/${enc(ref)}` }),
      publish: (ref: string) => request({ method: "POST", path: `/products/${enc(ref)}/publish` }),
      unpublish: (ref: string) =>
        request({ method: "POST", path: `/products/${enc(ref)}/unpublish` }),
      getDeliveryRecipe: (ref: string) =>
        request({ path: `/products/${enc(ref)}/delivery-recipe` }),
      setDeliveryRecipe: (ref: string, recipe: DeliveryRecipe) =>
        request({ method: "PUT", path: `/products/${enc(ref)}/delivery-recipe`, body: recipe }),
    },

    // ─── Sincronização incremental ───
    sync: {
      /** Devolve apenas o que mudou desde o cursor (produtos, categorias e tombstones). */
      changes: (cursor?: string, limit?: number) =>
        request({ path: "/sync/changes", query: { cursor, limit } }),
    },

    // ─── Imagens (storage do Convex) ───
    files: {
      uploadUrl: () => request({ method: "POST", path: "/files/upload-url" }),
      finalize: (storageId: string) =>
        request({ method: "POST", path: "/files/finalize", body: { storage_id: storageId } }),
    },

    // ─── Entregas ───
    deliveries: {
      /** GET legado (compatibilidade) — preferir claim(). */
      getQueue: (params?: { addon_id?: string; limit?: number }) =>
        request({ path: "/app/queued_commands", query: { addon_id: params?.addon_id, limit: params?.limit } }),
      /** POST /app/queued_commands/claim — reserva atômica, recomendado em produção. */
      claim: (body?: { limit?: number; addon_id?: string }) =>
        request({ method: "POST", path: "/app/queued_commands/claim", body: body ?? {} }),
      /**
       * PATCH /app/command/{id} — confirmar entrega.
       * Se a entrega foi obtida por claim(), sempre envie claim_token.
       */
      complete: (
        deliveryId: string,
        opts: { status: DeliveryStatus; claim_token?: string; response?: string; reason?: string; error_code?: string; retryable?: boolean },
      ) => request({ method: "PATCH", path: `/app/command/${enc(deliveryId)}`, body: opts }),
      /** Atalho: entrega concluída. */
      done: (deliveryId: string, claimToken?: string, response?: string) =>
        request({ method: "PATCH", path: `/app/command/${enc(deliveryId)}`, body: { status: "DONE", claim_token: claimToken, response } }),
      /** Atalho: jogador offline (não consome max_attempts). */
      pending: (deliveryId: string, claimToken?: string) =>
        request({ method: "PATCH", path: `/app/command/${enc(deliveryId)}`, body: { status: "PENDING", claim_token: claimToken, error_code: "PLAYER_OFFLINE" } }),
      /** Atalho: falha. retryable=true agenda nova tentativa; false é final. */
      failed: (deliveryId: string, claimToken: string | undefined, errorCode: string, retryable: boolean, response?: string) =>
        request({ method: "PATCH", path: `/app/command/${enc(deliveryId)}`, body: { status: "FAILED", claim_token: claimToken, error_code: errorCode, retryable, response } }),
      userQueue: (clientId: string) => request({ path: `/app/user_queue/${enc(clientId)}` }),
      userSchedules: (clientId: string) => request({ path: `/app/user_schedules/${enc(clientId)}` }),
      heartbeat: (body: {
        server_id: string;
        addon_version?: string;
        minecraft_version?: string;
        api_client_version?: string;
        capabilities?: Record<string, unknown>;
        error_code?: string;
      }) => request({ method: "POST", path: "/app/heartbeat", body }),
    },
  };
}

export type StoreApi = ReturnType<typeof createStoreApi>;
export type StoreApiConnection = Awaited<ReturnType<StoreApi["connection"]["test"]>>;
