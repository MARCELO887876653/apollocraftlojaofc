/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { computeQueueCountsReal, readQueueCounts } from "../lib/queueStats";

// ─────────────────────────────────────────────────────────────
// Cenários reais do addon, pela rota HTTP (não pela action).
//
// Por que este arquivo existe: a quarta auditoria pediu simulação de servidor
// ATIVO, OCIOSO, jogadores OFFLINE e RECONEXÃO, e a comparação entre o caminho
// quente (httpAction → mutation) e o antigo (httpAction → action → mutation).
// Os testes abaixo chamam `t.fetch`, ou seja, atravessam o roteador de verdade
// (`http.ts` → `resolveHotRoute` → `internalAuthorizedCall`), com a mesma
// autenticação, rate limit e scope do addon instalado.
//
// Nenhum deles depende de mudar o addon: tudo é comportamento do servidor.
// ─────────────────────────────────────────────────────────────

const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);
type T = ReturnType<typeof convexTest>;

const CLAIM_SCOPES = [
  "deliveries:read",
  "deliveries:update",
  "deliveries:claim",
  "users:queue",
  "users:schedules",
  "server:heartbeat",
  "products:read",
  "categories:read",
];

async function newAddonKey(t: T) {
  return await t.mutation(internal.apiKeysV1.devCreateForTests, {
    name: "addon",
    scopes: CLAIM_SCOPES,
    serverId: "survival-01",
    addonId: "apollo-store",
  });
}

/**
 * Cria `count` entregas PENDING para o servidor do addon. Cada unidade vira um
 * comando (quantityMode REPEAT), igual ao que acontece numa compra real.
 */
async function seedDeliveries(
  t: T,
  count: number,
  opts: { offlineExecute?: boolean } = {},
) {
  const offlineExecute = opts.offlineExecute ?? true;
  const { orderId } = await t.run(async (ctx) => {
    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: "Moedas",
      slug: `moedas-${now}-${Math.random().toString(36).slice(2, 6)}`,
      images: [],
      tags: [],
      priceCents: 100,
      stock: 0,
      unlimitedStock: true,
      active: true,
      featured: false,
      popular: false,
      hidden: false,
      minQty: 1,
      maxQty: 999,
      order: 0,
      benefits: [],
      salesCount: 0,
      delivery: { type: "none", showToCustomer: true },
      deliveryV1: {
        enabled: true,
        actions: [
          {
            action: "ADD_MONEY",
            payload: { amount: 100 },
            quantityMode: "REPEAT",
            // mesmo addon da chave: o claim do addon filtra pelo próprio id
            addonId: "apollo-store",
            serverId: "survival-01",
            offlineExecute,
          },
        ],
      },
      createdAt: now,
      updatedAt: now,
    });
    const id = await ctx.db.insert("orders", {
      number: `#SC${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerName: "Steve",
      customerEmail: "steve@example.com",
      minecraftNick: "Steve123",
      items: [
        {
          productId,
          name: "Moedas",
          unitPriceCents: 100,
          quantity: count,
          totalCents: 100 * count,
        },
      ],
      subtotalCents: 100 * count,
      discountCents: 0,
      totalCents: 100 * count,
      paymentStatus: "paid",
      deliveryStatus: "pending",
      statusHistory: [],
      accessToken: "tok",
      createdAt: now,
      updatedAt: now,
    });
    return { orderId: id };
  });
  const created = await t.mutation(internal.deliveryCommands.internalCreateForOrder, {
    orderId,
  });
  expect(created.created).toBe(count);
}

async function claimViaHttp(t: T, token: string, limit = 5) {
  const res = await t.fetch("/api/v1/app/queued_commands/claim", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit, addon_id: "apollo-store" }),
  });
  return { res, body: (await res.json()) as any };
}

async function confirmViaHttp(
  t: T,
  token: string,
  publicId: string,
  body: Record<string, unknown>,
) {
  const res = await t.fetch(`/api/v1/app/command/${publicId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, body: (await res.json()) as any };
}

/** Contadores da fila continuam batendo com a tabela real. */
async function expectCountersConsistent(t: T) {
  const [counts, real] = await t.run(async (ctx) => [
    await readQueueCounts(ctx),
    await computeQueueCountsReal(ctx),
  ]);
  expect(counts).toEqual(real);
}

// ─────────────────────────────────────────────────────────────
// 1) Servidor ATIVO: entrega em lotes, nada sai duas vezes
// ─────────────────────────────────────────────────────────────

describe("servidor ativo", () => {
  test("12 entregas saem em lotes de 5 e a fila termina vazia", async () => {
    const t = convexTest(schema, modules);
    await seedDeliveries(t, 12);
    const { token } = await newAddonKey(t);

    const seen: string[] = [];
    for (const expected of [5, 5, 2, 0]) {
      const { res, body } = await claimViaHttp(t, token, 5);
      expect(res.status).toBe(200);
      expect(body.count).toBe(expected);
      expect(body.data).toHaveLength(expected);
      for (const cmd of body.data) {
        expect(cmd.status).toBe("PROCESSING");
        expect(cmd.claim_token).toMatch(/^clm_/);
        expect(cmd.order.client_identifier).toBe("Steve123");
        seen.push(cmd.id);
      }
    }
    // 12 entregas distintas, nenhuma repetida entre lotes
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
    await expectCountersConsistent(t);
  });

  test("confirmação do lote esvazia PROCESSING e marca tudo como DONE", async () => {
    const t = convexTest(schema, modules);
    await seedDeliveries(t, 3);
    const { token } = await newAddonKey(t);
    const { body } = await claimViaHttp(t, token, 5);

    for (const cmd of body.data) {
      const done = await confirmViaHttp(t, token, cmd.id, {
        status: "DONE",
        claim_token: cmd.claim_token,
        response: "ok",
      });
      expect(done.res.status).toBe(200);
    }

    const counts = await t.run(async (ctx) => await readQueueCounts(ctx));
    expect(counts).toMatchObject({ processing: 0, done: 3 });
    await expectCountersConsistent(t);
  });
});

// ─────────────────────────────────────────────────────────────
// 2) Servidor OCIOSO: resposta barata, sem poluir `apiLogs`
// ─────────────────────────────────────────────────────────────

describe("servidor ocioso", () => {
  test("8 polls com fila vazia → 200 {data:[],count:0} e no máximo 1 linha de log", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newAddonKey(t);

    for (let i = 0; i < 8; i++) {
      const { res, body } = await claimViaHttp(t, token, 5);
      expect(res.status).toBe(200);
      expect(body).toEqual({ data: [], count: 0 });
      // o addon continua recebendo a janela de rate limit para se autorregular
      expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
    }

    // Log de sucesso é AMOSTRADO (1 por chave+bucket a cada 10 min): 8 polls
    // ociosos não podem virar 8 registros.
    const logs = await t.run(async (ctx) => await ctx.db.query("apiLogs").collect());
    expect(logs.length).toBeLessThanOrEqual(1);

    // e nada de escrita: sem comandos, sem tentativas
    const attempts = await t.run(async (ctx) => await ctx.db.query("deliveryAttempts").collect());
    expect(attempts).toHaveLength(0);
  });

  test("fila ociosa não perde uma entrega criada logo depois do poll", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newAddonKey(t);
    await claimViaHttp(t, token, 5); // aquece o estado "sem trabalho"

    await seedDeliveries(t, 1);
    const { body } = await claimViaHttp(t, token, 5);
    expect(body.count).toBe(1);
    await expectCountersConsistent(t);
  });
});

// ─────────────────────────────────────────────────────────────
// 3) Jogadores OFFLINE: o comando espera, sem consumir tentativa
// ─────────────────────────────────────────────────────────────

describe("jogadores offline", () => {
  test("entrega com offline_execute=true é reservada mesmo sem jogador online", async () => {
    const t = convexTest(schema, modules);
    await seedDeliveries(t, 2, { offlineExecute: true });
    const { token } = await newAddonKey(t);

    const { body } = await claimViaHttp(t, token, 5);
    expect(body.count).toBe(2);
    expect(body.data.every((c: any) => c.order.client_identifier === "Steve123")).toBe(true);
  });

  test("addon devolve PLAYER_OFFLINE: volta para a fila sem nova tentativa", async () => {
    const t = convexTest(schema, modules);
    await seedDeliveries(t, 1, { offlineExecute: false });
    const { token } = await newAddonKey(t);
    const { body } = await claimViaHttp(t, token, 5);
    const cmd = body.data[0];
    const attemptsAfterClaim = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_publicId", (q) => q.eq("publicId", cmd.id))
        .first();
      return row!.attempts;
    });

    const waiting = await confirmViaHttp(t, token, cmd.id, {
      status: "PENDING",
      error_code: "PLAYER_OFFLINE",
      claim_token: cmd.claim_token,
    });
    expect(waiting.res.status).toBe(200);

    const after = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_publicId", (q) => q.eq("publicId", cmd.id))
        .first();
      return row!;
    });
    expect(after.status).toBe("PENDING");
    // esperar o jogador entrada NÃO consome tentativa: o claim incrementa e o
    // retorno para a fila devolve a tentativa (volta a 0)
    expect(attemptsAfterClaim).toBe(1);
    expect(after.attempts).toBe(0);
    // continua disponível para quando o jogador voltar
    expect((await claimViaHttp(t, token, 5)).body.count).toBe(1);
    await expectCountersConsistent(t);
  });
});

// ─────────────────────────────────────────────────────────────
// 4) RECONEXÃO: addon caiu com entregas em voo e volta
// ─────────────────────────────────────────────────────────────

describe("reconexão do addon", () => {
  test("leases vencidos voltam com claim_token NOVO e o token antigo é recusado", async () => {
    const t = convexTest(schema, modules);
    await seedDeliveries(t, 3);
    const { token } = await newAddonKey(t);

    const first = await claimViaHttp(t, token, 5);
    expect(first.body.count).toBe(3);
    const oldTokens = new Map<string, string>(
      first.body.data.map((c: any) => [c.id, c.claim_token]),
    );

    // addon caiu: todo lease em voo vence no passado
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_status_createdAt", (q) => q.eq("status", "PROCESSING"))
        .collect();
      for (const row of rows) await ctx.db.patch(row._id, { claimExpiresAt: Date.now() - 1000 });
    });

    const second = await claimViaHttp(t, token, 5);
    expect(second.body.count).toBe(3);
    for (const cmd of second.body.data) {
      expect(cmd.claim_token).not.toBe(oldTokens.get(cmd.id));
      expect(cmd.attempts).toBe(2);
    }

    // o addon que voltou não consegue confirmar com o token da sessão anterior
    const stale = await confirmViaHttp(t, token, second.body.data[0].id, {
      status: "DONE",
      claim_token: oldTokens.get(second.body.data[0].id),
    });
    expect(stale.res.status).toBe(409);
    expect(stale.body.errors[0].code).toBe("CLAIM_INVALID");

    // ...e a entrega segue reservada, não perdida
    const counts = await t.run(async (ctx) => await readQueueCounts(ctx));
    expect(counts).toMatchObject({ pending: 0, processing: 3, done: 0 });
    await expectCountersConsistent(t);

    // o histórico registra cada tentativa (2 claims = 2 registros por entrega)
    const attempts = await t.run(async (ctx) => await ctx.db.query("deliveryAttempts").collect());
    expect(attempts).toHaveLength(6);
  });

  test("reconexão sem comando em voo não cria entrega fantasma", async () => {
    const t = convexTest(schema, modules);
    await seedDeliveries(t, 1);
    const { token } = await newAddonKey(t);
    await claimViaHttp(t, token, 5);
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("deliveryCommands")
        .withIndex("by_status_createdAt", (q) => q.eq("status", "PROCESSING"))
        .collect();
      for (const row of rows) await ctx.db.patch(row._id, { claimExpiresAt: Date.now() - 1000 });
    });

    const again = await claimViaHttp(t, token, 5);
    expect(again.body.count).toBe(1);
    const rows = await t.run(async (ctx) => await ctx.db.query("deliveryCommands").collect());
    expect(rows).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 5) Paridade: caminho quente (httpAction → mutation) == caminho antigo
//
// O caminho quente economiza uma chamada de função por requisição. Estes
// testes garantem que ele NÃO muda a resposta: mesma autenticação, mesmo
// corpo, mesmos headers de rate limit.
// ─────────────────────────────────────────────────────────────

describe("paridade entre caminho quente e caminho antigo", () => {
  test("GET /sync/changes responde igual nos dois caminhos", async () => {
    const t = convexTest(schema, modules);
    // chaves separadas: cada caminho gasta 1 requisição da própria janela
    const { token: hotToken } = await newAddonKey(t);
    const { token } = await newAddonKey(t);

    const hot = await t.fetch("/api/v1/sync/changes?limit=50", {
      method: "GET",
      headers: { Authorization: `Bearer ${hotToken}` },
    });
    const hotBody = await hot.json();
    const legacy = await t.action(api.apiV1.handle, {
      method: "GET",
      path: "/api/v1/sync/changes",
      token,
      query: { limit: "50" },
      bodyText: undefined,
    });

    expect(hot.status).toBe(legacy.status);
    expect(hotBody).toEqual(legacy.body);
    expect(hot.headers.get("X-RateLimit-Limit")).toBe("120");
    // mesma janela: 1 chamada em cada chave → 119 restantes nas duas
    expect(hot.headers.get("X-RateLimit-Remaining")).toBe("119");
    expect(legacy.headers?.["X-RateLimit-Remaining"]).toBe("119");
  });

  test("claim: mesmos campos e mesmos limites nos dois caminhos", async () => {
    const t = convexTest(schema, modules);
    await seedDeliveries(t, 1);
    const { token } = await newAddonKey(t);

    const legacy = await t.action(api.apiV1.handle, {
      method: "POST",
      path: "/api/v1/app/queued_commands/claim",
      token,
      bodyText: JSON.stringify({ limit: 5, addon_id: "apollo-store" }),
      query: {},
    });
    const hot = await t.fetch("/api/v1/app/queued_commands/claim", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 5, addon_id: "apollo-store" }),
    });
    const hotBody = (await hot.json()) as any;

    expect(hot.status).toBe(legacy.status);
    // a entrega foi reservada pelo caminho antigo; o quente encontra a fila
    // vazia e devolve exatamente a mesma forma de resposta
    expect(Object.keys(hotBody).sort()).toEqual(Object.keys(legacy.body as any).sort());
    expect(hotBody).toEqual({ data: [], count: 0 });
    expect(hot.headers.get("X-RateLimit-Limit")).toBe("30");
  });

  test("corpo inválido no caminho quente cai no antigo e responde 422", async () => {
    const t = convexTest(schema, modules);
    const { token } = await newAddonKey(t);
    const res = await t.fetch("/api/v1/app/queued_commands/claim", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{ nao e json",
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).errors[0].code).toBe("INVALID_PAYLOAD");
  });

  test("sem token, o caminho quente não é usado e continua 401", async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch("/api/v1/app/queued_commands/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 5 }),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).errors[0].code).toBe("MISSING_API_KEY");
  });
});
