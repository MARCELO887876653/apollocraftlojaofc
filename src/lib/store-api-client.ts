// ─────────────────────────────────────────────────────────────
// SDK/helper reutilizável da API v1 (Apollo Craft).
//
// Importe nos seus futuros addons em vez de reescrever as chamadas HTTP:
//
//   import { createStoreApi } from "./store-api-client";
//   const storeApi = createStoreApi({
//     baseUrl: "https://SEU-DOMINIO/api/v1",
//     apiKey: process.env.API_KEY!,
//   });
//   await storeApi.categories.create({ name: "Kits" });
//   const product = await storeApi.products.create({ name: "Kit", price: 9.9, ... });
//   await storeApi.products.setDeliveryRecipe(product.id, { version: 1, actions: [...] });
//   await storeApi.products.publish(product.id);
//
// Roda em Node (18+) e no Bedrock Dedicated Server (fetch global).
// ─────────────────────────────────────────────────────────────

export type DeliveryAction = {
  type: string;
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

export type StoreApiConfig = {
  /** Ex.: https://SEU-DOMINIO/api/v1  (configurável; nunca fixe o domínio) */
  baseUrl: string;
  /** sk_live_... criada no painel → Integrações → API de entregas automáticas */
  apiKey: string;
};

export class StoreApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: string;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
};

export function createStoreApi(config: StoreApiConfig) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  async function request<T = any>(opts: RequestOptions): Promise<T> {
    const res = await fetch(`${baseUrl}${opts.path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = json?.errors?.[0];
      throw new StoreApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `HTTP ${res.status}`);
    }
    return json as T;
  }

  return {
    // ─── Categorias ───
    categories: {
      list: () => request({ path: "/categories" }),
      get: (ref: string) => request({ path: `/categories/${encodeURIComponent(ref)}` }),
      create: (data: any, idempotencyKey?: string) =>
        request({ method: "POST", path: "/categories", body: data, idempotencyKey }),
      update: (ref: string, data: any) =>
        request({ method: "PATCH", path: `/categories/${encodeURIComponent(ref)}`, body: data }),
      remove: (ref: string) =>
        request({ method: "DELETE", path: `/categories/${encodeURIComponent(ref)}` }),
    },

    // ─── Produtos ───
    products: {
      list: () => request({ path: "/products" }),
      get: (ref: string) => request({ path: `/products/${encodeURIComponent(ref)}` }),
      create: (data: any, idempotencyKey?: string) =>
        request({ method: "POST", path: "/products", body: data, idempotencyKey }),
      update: (ref: string, data: any) =>
        request({ method: "PATCH", path: `/products/${encodeURIComponent(ref)}`, body: data }),
      remove: (ref: string) =>
        request({ method: "DELETE", path: `/products/${encodeURIComponent(ref)}` }),
      publish: (ref: string) =>
        request({ method: "POST", path: `/products/${encodeURIComponent(ref)}/publish` }),
      unpublish: (ref: string) =>
        request({ method: "POST", path: `/products/${encodeURIComponent(ref)}/unpublish` }),
      getDeliveryRecipe: (ref: string) =>
        request({ path: `/products/${encodeURIComponent(ref)}/delivery-recipe` }),
      setDeliveryRecipe: (ref: string, recipe: DeliveryRecipe) =>
        request({
          method: "PUT",
          path: `/products/${encodeURIComponent(ref)}/delivery-recipe`,
          body: recipe,
        }),
    },

    // ─── Imagens (storage do Convex) ───
    files: {
      uploadUrl: () => request({ method: "POST", path: "/files/upload-url" }),
      finalize: (storageId: string) =>
        request({ method: "POST", path: "/files/finalize", body: { storage_id: storageId } }),
    },

    // ─── Entregas ───
    deliveries: {
      getQueue: (params?: { addon_id?: string; limit?: number }) => {
        const qs = new URLSearchParams();
        if (params?.addon_id) qs.set("addon_id", params.addon_id);
        if (params?.limit) qs.set("limit", String(params.limit));
        const q = qs.toString();
        return request({ path: `/app/queued_commands${q ? `?${q}` : ""}` });
      },
      claim: (body?: { limit?: number; addon_id?: string }) =>
        request({ method: "POST", path: "/app/queued_commands/claim", body: body ?? {} }),
      userQueue: (clientId: string) =>
        request({ path: `/app/user_queue/${encodeURIComponent(clientId)}` }),
      userSchedules: (clientId: string) =>
        request({ path: `/app/user_schedules/${encodeURIComponent(clientId)}` }),
      complete: (deliveryId: string, status: "DONE" | "FAILED" | "PENDING" | "CANCELED", response?: string, reason?: string) =>
        request({
          method: "PATCH",
          path: `/app/command/${encodeURIComponent(deliveryId)}`,
          body: { status, response, reason },
        }),
      heartbeat: (body: { server_id: string; version?: string; minecraft_version?: string }) =>
        request({ method: "POST", path: "/app/heartbeat", body }),
    },

    me: () => request({ path: "/app/me" }),
  };
}

export type StoreApi = ReturnType<typeof createStoreApi>;
