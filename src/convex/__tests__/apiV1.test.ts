/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { sha256Hex, generateApiToken } from "../lib/hash";

// Carrega todos os módulos Convex (exceto os próprios testes)
const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function newKey(
  t: T,
  scopes: string[],
  opts: { serverId?: string; addonId?: string } = {},
) {
  return await t.mutation(internal.apiKeysV1.devCreateForTests, {
    name: "Teste",
    scopes,
    serverId: opts.serverId,
    addonId: opts.addonId,
  });
}

async function callV1(
  t: T,
  token: string,
  method: string,
  path: string,
  opts: { body?: unknown; query?: Record<string, string> } = {},
) {
  return await t.action(api.apiV1.handle, {
    method,
    path,
    token,
    bodyText: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    query: opts.query ?? {},
  });
}

const FULL_SCOPES = [
  "deliveries:read",
  "deliveries:update",
  "users:queue",
  "users:schedules",
  "server:heartbeat",
];

/** Cria produto com entrega v1 e um pedido PAGO, retornando os ids. */
async function seedPaidOrder(
  t: T,
  actions: any[] = [
    {
      action: "ADD_MONEY",
      payload: { amount: 10000 },
      addonId: "economy",
      serverId: "survival-01",
      offlineExecute: true,
    },
  ],
  nick = "Steve123",
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "VIP Ouro",
      slug: `vip-ouro-${now}-${Math.random().toString(36).slice(2, 6)}`,
      images: [],
      tags: [],
      priceCents: 1000,
      stock: 0,
      unlimitedStock: true,
      active: true,
      featured: false,
      popular: false,
      hidden: false,
      minQty: 1,
      maxQty: 99,
      order: 0,
      benefits: [],
      salesCount: 0,
      delivery: { type: "none", showToCustomer: true },
      deliveryV1: { enabled: true, actions },
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      number: `#TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerName: "Steve",
      customerEmail: "steve@example.com",
      minecraftNick: nick,
      items: [
        {
          productId,
          name: "VIP Ouro",
          unitPriceCents: 1000,
          quantity: 1,
          totalCents: 1000,
        },
      ],
      subtotalCents: 1000,
      discountCents: 0,
      totalCents: 1000,
      paymentStatus: "paid",
      deliveryStatus: "pending",
      statusHistory: [],
      accessToken: "tok",
      createdAt: now,
      updatedAt: now,
    });
    return { productId, orderId };
  });
}

async function listCommands(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("deliveryCommands").collect());
}

// ─────────────────────────────────────────────────────────────
// Hash e token
// ─────────────────────────────────────────────────────────────

describe("hash e token", () => {
  test("sha256Hex bate com node:crypto", () => {
    const samples = ["", "sk_live_abc", "ação com acentos çã", JSON.stringify({ a: 1 })];
    for (const s of samples) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });

  test("token tem formato sk_live_<64 hex>", () => {
    const token = generateApiToken();
    expect(token).toMatch(/^sk_live_[0-9a-f]{64}$/);
    expect(generateApiToken()).not.toBe(token);
  });
});

// ─────────────────────────────────────────────────────────────
// Autenticação / scopes
// ─────────────────────────────────────────────────────────────

describe("autenticação e scopes", () => {
  test("chave válida acessa /me", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });
    const res = await callV1(t, token, "GET", "/api/v1/app/me");
    expect(res.status).toBe(200);
    expect((res.body as any).server_id).toBe("survival-01");
  });

  test("chave inválida → 401", async () => {
    const t = convexTest(schema, modules);
    const res = await callV1(t, "sk_live_inexistente", "GET", "/api/v1/app/queued_commands");
    expect(res.status).toBe(401);
    expect((res.body as any).errors[0].code).toBe("INVALID_API_KEY");
  });

  test("sem chave → 401 MISSING_API_KEY", async () => {
    const t = convexTest(schema, modules);
    const res = await callV1(t, "", "GET", "/api/v1/app/queued_commands");
    expect(res.status).toBe(401);
    expect((res.body as any).errors[0].code).toBe("MISSING_API_KEY");
  });

  test("chave revogada → 401", async () => {
    const t = convexTest(schema, modules);
    const { id, token } = await newKey(t, FULL_SCOPES);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { active: false, revokedAt: Date.now() });
    });
    const res = await callV1(t, token, "GET", "/api/v1/app/me");
    expect(res.status).toBe(401);
    expect((res.body as any).errors[0].code).toBe("API_KEY_REVOKED");
  });

  test("scope insuficiente → 403", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, ["server:heartbeat"]);
    const res = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(res.status).toBe(403);
    expect((res.body as any).errors[0].code).toBe("FORBIDDEN_SCOPE");
  });
});

// ─────────────────────────────────────────────────────────────
// Criação automática e idempotência
// ─────────────────────────────────────────────────────────────

describe("criação automática no pagamento", () => {
  test("pedido pago cria entrega", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const commands = await listCommands(t);
    expect(commands).toHaveLength(1);
    expect(commands[0].action).toBe("ADD_MONEY");
    expect(commands[0].status).toBe("PENDING");
    expect(commands[0].clientIdentifier).toBe("Steve123");
  });

  test("aprovação duplicada NÃO duplica entrega", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const commands = await listCommands(t);
    expect(commands).toHaveLength(1);
  });

  test("pedido não pago pelo gateway cria via applyGatewayStatus", async () => {
    const t = convexTest(schema, modules);
    // cria pedido pendente com gatewayPaymentId
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const productId = await ctx.db.insert("products", {
        name: "VIP", slug: `vip-${Math.random().toString(36).slice(2, 8)}`, images: [], tags: [],
        priceCents: 1000, stock: 0, unlimitedStock: true, active: true, featured: false,
        popular: false, hidden: false, minQty: 1, maxQty: 99, order: 0, benefits: [], salesCount: 0,
        delivery: { type: "none", showToCustomer: true },
        deliveryV1: { enabled: true, actions: [{ action: "ADD_MONEY", payload: { amount: 5 }, offlineExecute: true }] },
        createdAt: now, updatedAt: now,
      });
      const orderId = await ctx.db.insert("orders", {
        number: "#PEND001", customerName: "A", customerEmail: "a@b.com", minecraftNick: "Alex",
        items: [{ productId, name: "VIP", unitPriceCents: 1000, quantity: 1, totalCents: 1000 }],
        subtotalCents: 1000, discountCents: 0, totalCents: 1000,
        paymentStatus: "pending", deliveryStatus: "pending", gatewayPaymentId: "MP-123",
        statusHistory: [], accessToken: "tok", createdAt: now, updatedAt: now,
      });
      return { orderId };
    });
    void ids;
    vi.useFakeTimers();
    try {
      await t.mutation(internal.paymentsData.applyGatewayStatus, {
        gatewayPaymentId: "MP-123",
        mpStatus: "paid",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const commands = await listCommands(t);
    expect(commands).toHaveLength(1);
    expect(commands[0].action).toBe("ADD_MONEY");
  });
});

// ─────────────────────────────────────────────────────────────
// Fila (queued_commands) e confirmações
// ─────────────────────────────────────────────────────────────

describe("fila de entregas", () => {
  async function paidWithQueue(t: T, actions?: any[]) {
    const { orderId } = await seedPaidOrder(t, actions);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    return (await listCommands(t))[0];
  }

  test("queued_commands retorna PENDING disponível", async () => {
    const t = convexTest(schema, modules);
    await paidWithQueue(t);
    const { token } = await newKey(t, ["deliveries:read"], { serverId: "survival-01" });
    const res = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(res.status).toBe(200);
    const data = res.body as any[];
    expect(data).toHaveLength(1);
    expect(data[0].action).toBe("ADD_MONEY");
    expect(data[0].order.client_identifier).toBe("Steve123");
    expect(data[0].payload).toEqual({ amount: 10000 });
    // não expõe dados pessoais
    expect(JSON.stringify(data[0])).not.toContain("steve@example.com");
  });

  test("DONE desaparece da fila", async () => {
    const t = convexTest(schema, modules);
    const cmd = await paidWithQueue(t);
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });
    const done = await callV1(t, token, "PATCH", `/api/v1/app/command/${cmd.publicId}`, {
      body: { status: "DONE", response: "10000 moedas adicionadas" },
    });
    expect(done.status).toBe(200);
    const res = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(res.body as any[]).toHaveLength(0);
    const stored = (await listCommands(t))[0];
    expect(stored.status).toBe("DONE");
    expect(stored.response).toBe("10000 moedas adicionadas");
  });

  test("FAILED fica registrado e agenda nova tentativa", async () => {
    const t = convexTest(schema, modules);
    const cmd = await paidWithQueue(t);
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });
    await callV1(t, token, "PATCH", `/api/v1/app/command/${cmd.publicId}`, {
      body: { status: "FAILED", response: "banco offline" },
    });
    const stored = (await listCommands(t))[0];
    expect(stored.response).toBe("banco offline");
    const attempts = await t.run(async (ctx) => await ctx.db.query("deliveryAttempts").collect());
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts.some((a) => a.status === "FAILED")).toBe(true);
  });

  test("PENDING (jogador offline) continua disponível", async () => {
    const t = convexTest(schema, modules);
    const cmd = await paidWithQueue(t);
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });
    await callV1(t, token, "PATCH", `/api/v1/app/command/${cmd.publicId}`, {
      body: { status: "PENDING", response: "PLAYER_OFFLINE" },
    });
    const stored = (await listCommands(t))[0];
    expect(stored.status).toBe("PENDING");
    const res = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(res.body as any[]).toHaveLength(1);
  });

  test("delivery id inexistente → 404", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });
    const res = await callV1(t, token, "PATCH", "/api/v1/app/command/del_inexistente", {
      body: { status: "DONE", response: "x" },
    });
    expect(res.status).toBe(404);
    expect((res.body as any).errors[0].code).toBe("DELIVERY_NOT_FOUND");
  });

  test("payload inválido → 422", async () => {
    const t = convexTest(schema, modules);
    const cmd = await paidWithQueue(t);
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });
    const res = await t.action(api.apiV1.handle, {
      method: "PATCH",
      path: `/api/v1/app/command/${cmd.publicId}`,
      token,
      bodyText: "{ nao é json",
      query: {},
    });
    expect(res.status).toBe(422);
    expect((res.body as any).errors[0].code).toBe("INVALID_PAYLOAD");
  });

  test("status inválido → 422", async () => {
    const t = convexTest(schema, modules);
    const cmd = await paidWithQueue(t);
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });
    const res = await callV1(t, token, "PATCH", `/api/v1/app/command/${cmd.publicId}`, {
      body: { status: "PROCESSING" },
    });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────
// Claim / lease
// ─────────────────────────────────────────────────────────────

describe("claim e lease", () => {
  test("claim reserva e segunda chamada não pega a mesma entrega", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });

    const first = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 10,
    });
    expect(first).toHaveLength(1);
    expect(first[0].status).toBe("PROCESSING");
    expect(first[0].claim_token).toMatch(/^clm_/);

    const second = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 10,
    });
    expect(second).toHaveLength(0);
  });

  test("claim expirado volta para PENDING", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { id: apiKeyId } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });

    await t.mutation(internal.apiV1Data.internalClaim, { apiKeyId, serverId: "survival-01", limit: 1 });
    // simula o addon caindo: lease expirado no passado
    await t.run(async (ctx) => {
      const c = await ctx.db.query("deliveryCommands").first();
      await ctx.db.patch(c!._id, { claimExpiresAt: Date.now() - 1000 });
    });
    const again = await t.mutation(internal.apiV1Data.internalClaim, {
      apiKeyId,
      serverId: "survival-01",
      limit: 1,
    });
    expect(again).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Fila por jogador e agendamentos
// ─────────────────────────────────────────────────────────────

describe("fila por jogador e agendamentos", () => {
  test("user_queue retorna entregas do jogador", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { token } = await newKey(t, ["users:queue"], { serverId: "survival-01" });
    const res = await callV1(t, token, "GET", "/api/v1/app/user_queue/Steve123");
    expect(res.status).toBe(200);
    expect(res.body as any[]).toHaveLength(1);
  });

  test("user_schedules retorna comando futuro (VIP 30 dias → REMOVE_RANK)", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t, [
      {
        action: "ADD_RANK",
        payload: { rank: "ouro" },
        offlineExecute: true,
        reverseAction: "REMOVE_RANK",
        reversePayload: { rank: "ouro" },
        reverseDelaySeconds: 2592000,
      },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { token } = await newKey(t, ["users:schedules"], { serverId: "survival-01" });
    const res = await callV1(t, token, "GET", "/api/v1/app/user_schedules/Steve123");
    expect(res.status).toBe(200);
    const data = res.body as any[];
    expect(data).toHaveLength(1);
    expect(data[0].action).toBe("REMOVE_RANK");
    // e o ADD_RANK está disponível agora na fila normal
    const { token: readToken } = await newKey(t, ["deliveries:read"], { serverId: "survival-01" });
    const queue = await callV1(t, readToken, "GET", "/api/v1/app/queued_commands");
    expect((queue.body as any[]).map((c) => c.action)).toContain("ADD_RANK");
  });
});

// ─────────────────────────────────────────────────────────────
// Múltiplos servidores / addons
// ─────────────────────────────────────────────────────────────

describe("servidores e addons", () => {
  test("um servidor não pega entrega de outro (isolamento)", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t, [
      { action: "ADD_MONEY", payload: { amount: 1 }, serverId: "survival-01", offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { token } = await newKey(t, ["deliveries:read"], { serverId: "skyblock-01" });
    const res = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(res.body as any[]).toHaveLength(0);
  });

  test("server_id GLOBAL é visível para qualquer servidor", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t, [
      { action: "ADD_MONEY", payload: { amount: 1 }, serverId: "GLOBAL", offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { token } = await newKey(t, ["deliveries:read"], { serverId: "factions-01" });
    const res = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(res.body as any[]).toHaveLength(1);
  });

  test("filtro por addon_id", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t, [
      { action: "ADD_MONEY", payload: {}, addonId: "economy", offlineExecute: true },
      { action: "GIVE_KIT", payload: {}, addonId: "kits", offlineExecute: true },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { token } = await newKey(t, ["deliveries:read"], { serverId: "GLOBAL" });
    const res = await callV1(t, token, "GET", "/api/v1/app/queued_commands", {
      query: { addon_id: "kits" },
    });
    const data = res.body as any[];
    expect(data).toHaveLength(1);
    expect(data[0].addon_id).toBe("kits");
  });
});

// ─────────────────────────────────────────────────────────────
// Reembolso
// ─────────────────────────────────────────────────────────────

describe("reembolso e cancelamento", () => {
  test("reembolso antes da entrega cancela PENDING", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    await t.mutation(internal.deliveryCommands.internalCancelForOrder, {
      orderId,
      reason: "Reembolsado",
    });
    const stored = (await listCommands(t))[0];
    expect(stored.status).toBe("CANCELED");
  });

  test("reembolso após DONE cria reversão quando configurada", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t, [
      {
        action: "ADD_RANK",
        payload: { rank: "ouro" },
        offlineExecute: true,
        reverseAction: "REMOVE_RANK",
        reversePayload: { rank: "ouro" },
      },
    ]);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const cmd = (await listCommands(t)).find((c) => c.action === "ADD_RANK")!;
    await t.run(async (ctx) => {
      await ctx.db.patch(cmd._id, { status: "DONE", completedAt: Date.now() });
    });
    await t.mutation(internal.deliveryCommands.internalCancelForOrder, {
      orderId,
      reason: "Reembolsado",
    });
    const commands = await listCommands(t);
    expect(commands.some((c) => c.action === "REMOVE_RANK" && c.status === "PENDING")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Heartbeat
// ─────────────────────────────────────────────────────────────

describe("heartbeat", () => {
  test("registra servidor online", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, ["server:heartbeat"], { serverId: "survival-01" });
    const res = await callV1(t, token, "POST", "/api/v1/app/heartbeat", {
      body: { server_id: "survival-01", version: "1.2.0", minecraft_version: "1.21" },
    });
    expect(res.status).toBe(200);
    const servers = await t.query(internal.apiV1Data.internalListServers, {});
    expect(servers).toHaveLength(1);
    expect(servers[0].serverId).toBe("survival-01");
    expect(servers[0].online).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Rate limit
// ─────────────────────────────────────────────────────────────

describe("rate limit", () => {
  test("121º GET é bloqueado com 429 e headers", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, ["deliveries:read"], { serverId: "GLOBAL" });
    let last: any;
    for (let i = 0; i < 120; i++) {
      last = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
      expect(last.status).toBe(200);
    }
    expect(last.headers["X-RateLimit-Limit"]).toBe("120");
    const blocked = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(blocked.status).toBe(429);
    expect((blocked.body as any).errors[0].code).toBe("RATE_LIMIT_REACHED");
    expect(blocked.headers["Retry-After"]).toBeDefined();
  });

  test("headers de rate limit aparecem na resposta", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, ["deliveries:read"], { serverId: "GLOBAL" });
    const res = await callV1(t, token, "GET", "/api/v1/app/queued_commands");
    expect(res.headers["X-RateLimit-Limit"]).toBe("120");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("119");
  });
});

// ─────────────────────────────────────────────────────────────
// Rota HTTP real (roteador http.ts) — de ponta a ponta
// ─────────────────────────────────────────────────────────────

describe("roteador HTTP /api/v1", () => {
  test("GET real via http.ts com Bearer", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const { token } = await newKey(t, ["deliveries:read"], { serverId: "survival-01" });
    const res = await t.fetch("/api/v1/app/queued_commands", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(data).toHaveLength(1);
    expect(data[0].action).toBe("ADD_MONEY");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("120");
  });

  test("X-Api-Key também autentica", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newKey(t, ["deliveries:read"], { serverId: "GLOBAL" });
    const res = await t.fetch("/api/v1/app/me", {
      method: "GET",
      headers: { "X-Api-Key": token },
    });
    expect(res.status).toBe(200);
  });

  test("PATCH real confirma entrega via http.ts", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedPaidOrder(t);
    await t.mutation(internal.deliveryCommands.internalCreateForOrder, { orderId });
    const cmd = (await listCommands(t))[0];
    const { token } = await newKey(t, FULL_SCOPES, { serverId: "survival-01" });
    const res = await t.fetch(`/api/v1/app/command/${cmd.publicId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE", response: "ok" }),
    });
    expect(res.status).toBe(200);
    const stored = (await listCommands(t))[0];
    expect(stored.status).toBe("DONE");
  });

  test("erro 401 segue o formato { errors: [...] }", async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch("/api/v1/app/queued_commands", { method: "GET" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.errors[0].code).toBe("MISSING_API_KEY");
  });
});
