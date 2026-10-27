import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RETIRED_DEPLOYMENTS,
  STORE_DEPLOYMENT_URL,
  configuredConvexUrl,
  convexUrlCandidates,
  deploymentServesStore,
  isRetiredDeployment,
  resolveBuildConvexUrl,
} from "./convex-url";

describe("configuredConvexUrl", () => {
  it("aceita um endereço de deployment Convex e remove espaços/barra final", () => {
    expect(configuredConvexUrl(" https://tidy-mandrill-432.convex.cloud/ ")).toBe(
      "https://tidy-mandrill-432.convex.cloud",
    );
    expect(configuredConvexUrl("https://a1-b2.convex.cloud")).toBe("https://a1-b2.convex.cloud");
    expect(configuredConvexUrl("https://a1-b2.convex.cloud")).not.toBe("https://a1-b2.convex.cloud/");
  });

  it("devolve vazio quando ausente, vazio ou fora do formato de deployment", () => {
    expect(configuredConvexUrl(undefined)).toBe("");
    expect(configuredConvexUrl(null)).toBe("");
    expect(configuredConvexUrl("   ")).toBe("");
    expect(configuredConvexUrl("https://loja.exemplo.com")).toBe("");
    expect(configuredConvexUrl("capable-akita-865.convex.cloud")).toBe("");
    expect(configuredConvexUrl("javascript:alert(1)//.convex.cloud")).toBe("");
  });
});

describe("convexUrlCandidates", () => {
  it("sem configuração válida, usa o deployment desta loja", () => {
    expect(convexUrlCandidates(undefined)).toEqual([STORE_DEPLOYMENT_URL]);
    expect(convexUrlCandidates("nao-e-url")).toEqual([STORE_DEPLOYMENT_URL]);
  });

  it("quando o build já aponta para o deployment da loja, não repete a tentativa", () => {
    expect(convexUrlCandidates(STORE_DEPLOYMENT_URL)).toEqual([STORE_DEPLOYMENT_URL]);
    expect(convexUrlCandidates(`${STORE_DEPLOYMENT_URL}/`)).toEqual([STORE_DEPLOYMENT_URL]);
  });

  it("quando o build aponta para outro deployment, tenta ele antes do da loja", () => {
    const candidates = convexUrlCandidates("https://loja-nova.convex.cloud");
    expect(candidates).toEqual(["https://loja-nova.convex.cloud", STORE_DEPLOYMENT_URL]);
    expect(candidates[candidates.length - 1]).toBe(STORE_DEPLOYMENT_URL);
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it("nunca tenta um deployment aposentado — nem uma vez", () => {
    // O caso real (medido no deployment): um build saiu com
    // `tidy-mandrill-432` embutido. Antes, toda visita gastava um WebSocket que
    // nunca conectava + um POST de diagnóstico que voltava 500 antes de cair no
    // endereço certo. Agora o endereço morto é simplesmente pulado.
    for (const retired of RETIRED_DEPLOYMENTS) {
      expect(convexUrlCandidates(retired)).toEqual([STORE_DEPLOYMENT_URL]);
      expect(convexUrlCandidates(`${retired}/`)).toEqual([STORE_DEPLOYMENT_URL]);
      expect(convexUrlCandidates(retired)).not.toContain(retired);
    }
  });
});

describe("resolveBuildConvexUrl", () => {
  it("grava no bundle o endereço válido configurado", () => {
    expect(resolveBuildConvexUrl("https://loja-nova.convex.cloud")).toBe(
      "https://loja-nova.convex.cloud",
    );
    expect(resolveBuildConvexUrl(STORE_DEPLOYMENT_URL)).toBe(STORE_DEPLOYMENT_URL);
  });

  it("descarta o endereço aposentado: o build nunca nasce com ele", () => {
    expect(resolveBuildConvexUrl("https://tidy-mandrill-432.convex.cloud")).toBe(
      STORE_DEPLOYMENT_URL,
    );
    expect(resolveBuildConvexUrl("https://tidy-mandrill-432.convex.cloud/")).toBe(
      STORE_DEPLOYMENT_URL,
    );
  });

  it("usa o deployment da loja quando não há configuração válida", () => {
    expect(resolveBuildConvexUrl(undefined)).toBe(STORE_DEPLOYMENT_URL);
    expect(resolveBuildConvexUrl(null, "  ", "nao-e-url")).toBe(STORE_DEPLOYMENT_URL);
  });

  it("ignora valores inválidos antes de aceitar o primeiro válido", () => {
    expect(
      resolveBuildConvexUrl(undefined, "https://tidy-mandrill-432.convex.cloud", undefined),
    ).toBe(STORE_DEPLOYMENT_URL);
  });
});

describe("isRetiredDeployment", () => {
  it("reconhece os endereços aposentados e ignora os demais", () => {
    expect(isRetiredDeployment("https://tidy-mandrill-432.convex.cloud")).toBe(true);
    expect(isRetiredDeployment(STORE_DEPLOYMENT_URL)).toBe(false);
    expect(isRetiredDeployment("https://loja-nova.convex.cloud")).toBe(false);
  });
});

/** Resposta mínima no formato que `deploymentServesStore` consome. */
function fakeResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

describe("deploymentServesStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirma o endereço quando a loja responde, com POST em /api/query", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seenUrl = String(url);
        seenInit = init;
        return fakeResponse({ status: "success", value: { name: "Apollo Craft" } });
      }),
    );

    await expect(deploymentServesStore(STORE_DEPLOYMENT_URL)).resolves.toBe(true);
    expect(seenUrl).toBe(`${STORE_DEPLOYMENT_URL}/api/query`);
    expect(seenInit?.method).toBe("POST");
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      path: "settings:getStore",
      args: {},
      format: "json",
    });
  });

  it("recusa um deployment que responde erro na função (o caso do endereço antigo)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse({ status: "error", errorMessage: "Server Error" })),
    );
    await expect(deploymentServesStore("https://tidy-mandrill-432.convex.cloud")).resolves.toBe(false);
  });

  it("recusa quando o HTTP não é 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse({ code: "Server Error" }, { ok: false, status: 500 })),
    );
    await expect(deploymentServesStore("https://tidy-mandrill-432.convex.cloud")).resolves.toBe(false);
  });

  it("recusa quando a rede falha ou a resposta não é JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(deploymentServesStore("https://morto.convex.cloud")).resolves.toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      })),
    );
    await expect(deploymentServesStore("https://estranho.convex.cloud")).resolves.toBe(false);
  });

  it("desiste e recusa quando o endereço não responde no tempo limite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    );
    await expect(deploymentServesStore("https://sem-resposta.convex.cloud", 20)).resolves.toBe(false);
  });
});
