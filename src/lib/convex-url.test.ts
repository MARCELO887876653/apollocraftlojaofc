import { describe, expect, it } from "vitest";
import { STORE_DEPLOYMENT_URL, configuredConvexUrl, convexUrlCandidates } from "./convex-url";

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
