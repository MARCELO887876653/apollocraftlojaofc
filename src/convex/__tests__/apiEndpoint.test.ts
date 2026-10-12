import { describe, expect, test } from "vitest";
import {
  buildProbeResult,
  classifyEndpointResponse,
  endpointMessage,
  normalizeApiBaseUrl,
  storeApiBaseUrl,
  trimSnippet,
} from "../lib/apiEndpoint";

// ─────────────────────────────────────────────────────────────
// Diagnóstico do endereço da API v1.
//
// Estes casos usam as respostas REAIS capturadas do incidente de 12/10/2026:
// o addon apontava para o deployment de desenvolvimento já morto e recebia
// 500 em toda rota — inclusive na autenticação e até numa query pública.
// ─────────────────────────────────────────────────────────────

const DEAD_DEPLOYMENT_BODY =
  '{"code":"[Request ID: fccbb1f6876296a1] Server Error"}';

const LIVE_BODY =
  '{"errors":[{"code":"MISSING_API_KEY","message":"Cabeçalho Authorization com Bearer token ausente."}]}';

describe("normalizeApiBaseUrl", () => {
  test("endereço de site sem caminho ganha /api/v1", () => {
    expect(normalizeApiBaseUrl("https://capable-akita-865.convex.site")).toBe(
      "https://capable-akita-865.convex.site/api/v1",
    );
  });

  test("barra no fim não duplica o caminho", () => {
    expect(normalizeApiBaseUrl("https://capable-akita-865.convex.site/")).toBe(
      "https://capable-akita-865.convex.site/api/v1",
    );
    expect(normalizeApiBaseUrl("https://capable-akita-865.convex.site/api/v1/")).toBe(
      "https://capable-akita-865.convex.site/api/v1",
    );
  });

  test("rota completa colada é cortada até a base", () => {
    expect(
      normalizeApiBaseUrl("https://tidy-mandrill-432.convex.site/api/v1/app/queued_commands/claim"),
    ).toBe("https://tidy-mandrill-432.convex.site/api/v1");
  });

  test("endereço de deployment (.convex.cloud) é aceito como base", () => {
    expect(normalizeApiBaseUrl("https://capable-akita-865.convex.cloud")).toBe(
      "https://capable-akita-865.convex.cloud/api/v1",
    );
  });

  test("domínio próprio com /api/v1 é preservado", () => {
    expect(normalizeApiBaseUrl("apollocraft.online/api/v1")).toBe(
      "https://apollocraft.online/api/v1",
    );
  });

  test("espaços são ignorados", () => {
    expect(normalizeApiBaseUrl("  https://x1.convex.site/api/v1  ")).toBe(
      "https://x1.convex.site/api/v1",
    );
  });

  test("entradas inválidas devolvem null", () => {
    for (const raw of ["", "   ", "sem-ponto", "://x", "javascript:alert(1)"]) {
      expect(normalizeApiBaseUrl(raw)).toBeNull();
    }
  });
});

describe("storeApiBaseUrl", () => {
  test("troca .convex.cloud por .convex.site e acrescenta /api/v1", () => {
    expect(storeApiBaseUrl("https://capable-akita-865.convex.cloud")).toBe(
      "https://capable-akita-865.convex.site/api/v1",
    );
  });

  test("não duplica o caminho quando o endereço já é de site", () => {
    expect(storeApiBaseUrl("https://capable-akita-865.convex.site/api/v1")).toBe(
      "https://capable-akita-865.convex.site/api/v1",
    );
  });
});

describe("classifyEndpointResponse", () => {
  test("401 MISSING_API_KEY = API no ar (sem chave o 401 é o esperado)", () => {
    expect(
      classifyEndpointResponse({ status: 401, contentType: "application/json", bodyText: LIVE_BODY }),
    ).toBe("ok");
  });

  test("500 com Server Error cru do Convex = deployment morto/endereço errado", () => {
    expect(
      classifyEndpointResponse({
        status: 500,
        contentType: "application/json",
        bodyText: DEAD_DEPLOYMENT_BODY,
      }),
    ).toBe("dead_deployment");
  });

  test("500 cru sem content-type também é deployment morto", () => {
    expect(classifyEndpointResponse({ status: 500, bodyText: DEAD_DEPLOYMENT_BODY })).toBe(
      "dead_deployment",
    );
  });

  test("500 no padrão da própria API é defeito da loja, não de endereço", () => {
    expect(
      classifyEndpointResponse({
        status: 500,
        contentType: "application/json",
        bodyText: '{"errors":[{"code":"INTERNAL_ERROR","message":"Erro interno no servidor."}]}',
      }),
    ).toBe("api_error");
  });

  test("404 = endereço existe sem API v1", () => {
    expect(classifyEndpointResponse({ status: 404, bodyText: "" })).toBe("not_found");
  });

  test("página HTML = não é a API", () => {
    expect(
      classifyEndpointResponse({ status: 200, contentType: "text/html", bodyText: "<html>…" }),
    ).toBe("unexpected");
  });

  test("403 com JSON da API não é confundido com endereço errado", () => {
    expect(
      classifyEndpointResponse({
        status: 403,
        contentType: "application/json",
        bodyText: '{"errors":[{"code":"FORBIDDEN_SCOPE","message":"…"}]}',
      }),
    ).toBe("unexpected");
  });
});

describe("buildProbeResult", () => {
  const expected = "https://capable-akita-865.convex.site/api/v1";

  test("sem resposta = rede/CORS, e a mensagem aponta o endereço certo", () => {
    const res = buildProbeResult({
      baseUrl: "https://tidy-mandrill-432.convex.site/api/v1",
      expectedBaseUrl: expected,
      response: null,
    });
    expect(res.verdict).toBe("network");
    expect(res.status).toBeNull();
    expect(res.message).toContain(expected);
  });

  test("deployment morto explica a causa e manda trocar pelo endereço de produção", () => {
    const res = buildProbeResult({
      baseUrl: "https://tidy-mandrill-432.convex.site/api/v1",
      expectedBaseUrl: expected,
      response: { status: 500, contentType: "application/json", bodyText: DEAD_DEPLOYMENT_BODY },
    });
    expect(res.verdict).toBe("dead_deployment");
    expect(res.status).toBe(500);
    expect(res.message).toContain(expected);
    expect(res.message).toContain("convex dev");
  });

  test("endereço de produção saudável é reconhecido", () => {
    const res = buildProbeResult({
      baseUrl: expected,
      expectedBaseUrl: expected,
      response: { status: 401, contentType: "application/json", bodyText: LIVE_BODY },
    });
    expect(res.verdict).toBe("ok");
    expect(res.message).toContain("401");
  });

  test("o trecho guardado é curto e sem espaços repetidos", () => {
    const res = buildProbeResult({
      baseUrl: expected,
      expectedBaseUrl: expected,
      response: { status: 500, bodyText: `${"x".repeat(500)}\n\n  y` },
    });
    expect(res.snippet.length).toBeLessThanOrEqual(200);
    expect(res.snippet).not.toContain("\n");
    expect(trimSnippet("a  \n b")).toBe("a b");
  });
});

describe("endpointMessage", () => {
  test("quando o endereço já é o de produção, não manda trocar de endereço", () => {
    const msg = endpointMessage(
      "dead_deployment",
      "https://capable-akita-865.convex.site/api/v1",
      "https://capable-akita-865.convex.site/api/v1",
    );
    expect(msg).not.toContain("Troque");
    expect(msg).toContain("publique o backend");
  });

  test("api_error manda olhar os logs em vez de culpar a chave", () => {
    const msg = endpointMessage("api_error", "https://x.convex.site/api/v1", "https://x.convex.site/api/v1");
    expect(msg).toContain("defeito real");
    expect(msg).toContain("Request ID");
  });
});
