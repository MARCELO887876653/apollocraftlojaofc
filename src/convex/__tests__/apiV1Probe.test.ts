/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

// Carrega todos os módulos Convex (exceto os próprios testes)
const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"]);

type T = ReturnType<typeof convexTest>;

const identity = (subject: string) => ({
  subject,
  issuer: "test",
  tokenIdentifier: `test|${subject}`,
});

/** Semeia um usuário logado; com `asAdmin` também vira owner da equipe. */
async function seedUser(t: T, asAdmin: boolean) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Dono",
      email: "dono@example.com",
    });
    if (asAdmin) {
      await ctx.db.insert("adminUsers", {
        email: "dono@example.com",
        name: "Dono",
        userId,
        role: "owner",
        permissions: [],
        active: true,
        createdAt: Date.now(),
      });
    }
    return userId;
  });
}

/** Resposta do Convex quando a função morre antes de executar (deployment morto). */
const DEAD = { status: 500, body: '{"code":"[Request ID: fccbb1f6876296a1] Server Error"}' };
/** Resposta da API v1 desta loja quando a chamada vai sem chave. */
const ALIVE = {
  status: 401,
  body: '{"errors":[{"code":"MISSING_API_KEY","message":"Cabeçalho Authorization com Bearer token ausente."}]}',
};

function stubFetch(status: number, body: string) {
  const spy = vi.fn(async () =>
    new Response(body, { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sondagem do endereço da API v1 (apiV1Probe)", () => {
  test("endereço do addon com deployment morto é diagnosticado como tal", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, true);
    const spy = stubFetch(DEAD.status, DEAD.body);

    const res = await t
      .withIdentity(identity(userId))
      .action(api.apiV1Probe.probeEndpoint, {
        url: "https://tidy-mandrill-432.convex.site/api/v1/app/queued_commands/claim",
      });

    expect(res.verdict).toBe("dead_deployment");
    expect(res.status).toBe(500);
    // a URL colada foi normalizada para a base
    expect(res.baseUrl).toBe("https://tidy-mandrill-432.convex.site/api/v1");
    // a sondagem vai SEM chave nenhuma
    const [calledUrl, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://tidy-mandrill-432.convex.site/api/v1/app/me");
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization|api-key/i);
    // e recomenda o endereço de produção desta loja
    expect(res.expectedBaseUrl).toMatch(/\.convex\.site\/api\/v1$/);
    expect(res.message).toContain(res.expectedBaseUrl);
  });

  test("endereço de produção responde 401 MISSING_API_KEY = API no ar", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, true);
    stubFetch(ALIVE.status, ALIVE.body);

    const res = await t
      .withIdentity(identity(userId))
      .action(api.apiV1Probe.probeEndpoint, { url: "https://capable-akita-865.convex.site" });

    expect(res.verdict).toBe("ok");
    expect(res.status).toBe(401);
  });

  test("sem resposta (DNS/rede/timeout) é tratado como rede, sem explodir", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const res = await t
      .withIdentity(identity(userId))
      .action(api.apiV1Probe.probeEndpoint, { url: "https://nao-existe-0000.convex.site" });

    expect(res.verdict).toBe("network");
    expect(res.status).toBeNull();
  });

  test("sem permissão de admin a sondagem é recusada", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, false);
    const spy = stubFetch(ALIVE.status, ALIVE.body);

    await expect(
      t.withIdentity(identity(userId)).action(api.apiV1Probe.probeEndpoint, {
        url: "https://capable-akita-865.convex.site",
      }),
    ).rejects.toThrow(/restrito/i);
    expect(spy).not.toHaveBeenCalled();
  });

  test("endereço inválido não faz chamada nenhuma", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, true);
    const spy = stubFetch(ALIVE.status, ALIVE.body);

    const res = await t
      .withIdentity(identity(userId))
      .action(api.apiV1Probe.probeEndpoint, { url: "sem-ponto" });

    expect(res.status).toBeNull();
    expect(res.message).toMatch(/inválido/i);
    expect(spy).not.toHaveBeenCalled();
  });
});
