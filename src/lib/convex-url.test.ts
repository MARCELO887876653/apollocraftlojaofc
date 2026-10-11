import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STORE_DEPLOYMENT_URL,
  configuredConvexUrl,
  convexUrlCandidates,
  deploymentServesStore,
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
    // Este é o caso que deixava o app publicado carregando para sempre.
    const candidates = convexUrlCandidates("https://tidy-mandrill-432.convex.cloud");
    expect(candidates).toEqual(["https://tidy-mandrill-432.convex.cloud", STORE_DEPLOYMENT_URL]);
    expect(candidates[candidates.length - 1]).toBe(STORE_DEPLOYMENT_URL);
    expect(new Set(candidates).size).toBe(candidates.length);
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
