import { afterEach, describe, expect, test, vi } from "vitest";
import {
  checkDeployment,
  classifyDeploymentError,
  cleanDeploymentError,
  deploymentFailure,
} from "./deployment-status";

describe("diagnóstico do servidor de dados", () => {
  test("reconhece o deployment desativado por limite de uso", () => {
    // Mensagem real devolvida pelo Convex quando o limite é atingido.
    const message =
      "[Request ID: 3a4d14f5d58abe17] Server Error\nThis deployment has been disabled because it exceeded a configured usage limit. Update or disable the usage limit in the Convex dashboard in deployment settings to resume function execution.\n";
    expect(classifyDeploymentError(message)).toBe("usage-limit");
  });

  test("qualquer outro erro do servidor cai em 'server'", () => {
    expect(classifyDeploymentError("Could not find public function")).toBe("server");
    expect(classifyDeploymentError("")).toBe("server");
    expect(classifyDeploymentError(undefined)).toBe("server");
  });

  test("limpa o prefixo de Request ID antes de mostrar para o cliente", () => {
    expect(
      cleanDeploymentError("[Request ID: abc123] Server Error\nAlgo deu errado.\n"),
    ).toBe("Algo deu errado.");
    expect(cleanDeploymentError(undefined)).toBe("");
  });

  test("cada causa tem uma mensagem própria em português", () => {
    expect(deploymentFailure("usage-limit").message).toContain("limite de uso");
    expect(deploymentFailure("server").message).toContain("erro");
    expect(deploymentFailure("unreachable").message).toContain("servidor");
  });
});

describe("checkDeployment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("servidor saudável responde ok", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => ({
      ok: true,
      json: async () => ({ status: "success", value: { name: "Apollo Craft" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkDeployment("https://loja.convex.cloud")).resolves.toEqual({ ok: true });

    // O teste pergunta pela consulta que o app realmente precisa abrir: um
    // endereço que responde outras funções mas não tem o shell precisa falhar.
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.path).toBe("storefront:getShell");
  });

  test("limite de uso vira falha explicável, não erro genérico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "error",
          errorMessage:
            "[Request ID: 1] Server Error\nThis deployment has been disabled because it exceeded a configured usage limit.\n",
        }),
      })),
    );
    const result = await checkDeployment("https://loja.convex.cloud");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("usage-limit");
      expect(result.failure.detail).toContain("exceeded a configured usage limit");
      expect(result.failure.detail).not.toContain("Request ID");
    }
  });

  test("sem rede ou com endereço vazio não lança", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const offline = await checkDeployment("https://loja.convex.cloud");
    expect(offline.ok).toBe(false);
    if (!offline.ok) expect(offline.failure.kind).toBe("unreachable");

    const empty = await checkDeployment("");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.failure.detail).toContain("VITE_CONVEX_URL");
  });
});
