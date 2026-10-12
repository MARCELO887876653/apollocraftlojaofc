/**
 * Endereço da API v1 de entregas: normalização e diagnóstico.
 *
 * Por que isto existe: um addon configurado com o endereço ERRADO (tipicamente
 * o deployment de desenvolvimento do `convex dev`, que expira/para de
 * responder) recebe **HTTP 500** do Convex — `{"code":"[Request ID: …] Server
 * Error"}` — em *toda* rota, inclusive na autenticação. O sintoma engana: parece
 * chave inválida, fila vazia ou bug na loja, mas a requisição nunca chega ao
 * código desta loja (por isso também não aparece nada no log da API e nenhuma
 * entrega é reservada).
 *
 * Este módulo é PURO (sem `fetch`, sem banco) para poder rodar em três lugares
 * com o mesmo resultado:
 *   1. na action `apiV1Probe` (que faz a chamada de verdade, do servidor);
 *   2. no painel (Integrações → API v1), mostrando o endereço correto;
 *   3. nos testes.
 */

/** Caminho base das HTTP actions da API v1. */
export const API_V1_PATH = "/api/v1";

/** Endereço do Convex Site (HTTP actions) a partir do endereço do deployment. */
export function convexSiteUrl(deploymentUrl: string): string {
  return deploymentUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.convex\.cloud$/i, ".convex.site");
}

/** `API_BASE_URL` de produção desta loja, a partir do deployment do Convex. */
export function storeApiBaseUrl(deploymentUrl: string): string {
  const site = convexSiteUrl(deploymentUrl).replace(/\/+$/, "");
  // Já é um endereço de site com o caminho? Não duplica.
  return site.endsWith(API_V1_PATH) ? site : `${site}${API_V1_PATH}`;
}

/**
 * Aceita o que o dono realmente cola no addon (endereço do deployment, do site,
 * com ou sem `/api/v1`, com a rota de um endpoint, com barra no fim) e devolve
 * sempre `<origem>/api/v1`. Devolve `null` quando não dá para interpretar.
 */
export function normalizeApiBaseUrl(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  // Sem esquema o `new URL` não resolve: assume https (é o único aceito pelo
  // Convex e pelo addon).
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const apiIndex = segments.findIndex((s, i) => s === "api" && segments[i + 1] === "v1");
  const base = `${url.origin}${API_V1_PATH}`;
  if (apiIndex >= 0) return base; // corta qualquer rota depois de /api/v1
  return base;
}

/** Veredito do diagnóstico de um endereço. */
export type EndpointVerdict =
  /** Falou com a API desta loja (o 401 sem chave é o esperado). */
  | "ok"
  /** Convex respondeu erro de servidor em tudo: endereço de outro/deployment morto. */
  | "dead_deployment"
  /** Endereço existe, mas não tem a API v1 (404). */
  | "not_found"
  /** Nosso próprio 500 — nesse caso o defeito É na loja. */
  | "api_error"
  /** Respondeu outra coisa (HTML, JSON inesperado, redirect…). */
  | "unexpected"
  /** Sem resposta: rede, DNS, TLS ou CORS. */
  | "network";

export type EndpointProbeResult = {
  baseUrl: string;
  /** Endereço de produção desta loja, para comparar. */
  expectedBaseUrl: string;
  status: number | null;
  verdict: EndpointVerdict;
  /** Trecho curto da resposta (nunca contém segredo: a sondagem não envia chave). */
  snippet: string;
  /** Texto pronto para o painel; explica o que fazer. */
  message: string;
};

const SNIPPET_MAX = 200;

/** Trecho seguro e curto da resposta (sem dados pessoais/segredos). */
export function trimSnippet(bodyText: string): string {
  return (bodyText ?? "").replace(/\s+/g, " ").trim().slice(0, SNIPPET_MAX);
}

/** Convex devolve este formato quando a própria função falha antes do código. */
const CONVEX_RAW_ERROR = /\[Request ID:\s*[0-9a-f]+\]\s*Server Error|"code"\s*:\s*"\[Request ID/i;

/**
 * Classifica a resposta de `GET {base}/api/v1/app/me` feita SEM chave.
 * Uma API v1 saudável responde 401 com `code: "MISSING_API_KEY"`.
 */
export function classifyEndpointResponse(input: {
  status: number;
  contentType?: string;
  bodyText?: string;
}): EndpointVerdict {
  const status = input.status;
  const contentType = (input.contentType ?? "").toLowerCase();
  const body = input.bodyText ?? "";
  const isJson = contentType.includes("json");

  if (status === 401 && body.includes("MISSING_API_KEY")) return "ok";

  // Nosso erro interno: JSON no padrão da API com código INTERNAL_ERROR.
  if (isJson && body.includes("INTERNAL_ERROR")) return "api_error";

  if (status >= 500) return "dead_deployment";

  if (status === 404) return "not_found";

  // Convex pode devolver 200/4xx com o erro cru no corpo.
  if (CONVEX_RAW_ERROR.test(body)) return "dead_deployment";

  if (!isJson) return "unexpected";
  if (isJson && body.includes("MISSING_API_KEY")) return "ok";
  return "unexpected";
}

/** Mensagem em português para o painel — o que significa e o que fazer. */
export function endpointMessage(
  verdict: EndpointVerdict,
  baseUrl: string,
  expectedBaseUrl: string,
): string {
  const same = baseUrl === expectedBaseUrl;
  switch (verdict) {
    case "ok":
      return "Endereço certo e API no ar. O 401 sem chave é o esperado: a autenticação funciona (com a sua chave, `GET /app/me` responde 200).";
    case "dead_deployment":
      return `Este endereço não executa a API desta loja: o Convex respondeu erro de servidor para a própria função (500 "Server Error"), antes de olhar a chave. Normalmente é um endereço de desenvolvimento (\`convex dev\`) já expirado. ${
        same
          ? "Se o diagnóstico continuar assim, publique o backend e verifique os logs do deployment."
          : `Troque o \`API_BASE_URL\` do addon por ${expectedBaseUrl}.`
      }`;
    case "not_found":
      return `Não existe API v1 neste endereço (404). ${
        same ? "Confirme se o backend foi publicado." : `Use ${expectedBaseUrl}.`
      }`;
    case "api_error":
      return "O endereço é o desta loja, mas a API devolveu erro interno (500 INTERNAL_ERROR) — este é um defeito real na loja, não um problema de chave. Veja os logs do deployment e envie o Request ID.";
    case "unexpected":
      return `Alguém respondeu, mas não com a API v1 (nem JSON no padrão da loja). ${
        same ? "" : `O endereço correto é ${expectedBaseUrl}.`
      }`.trim();
    case "network":
      return `Não houve resposta deste endereço (rede, DNS, TLS ou bloqueio de origem). ${
        same ? "Confirme se o deployment está no ar." : `O endereço correto é ${expectedBaseUrl}.`
      }`;
  }
}

/** Monta o resultado completo a partir da resposta bruta (ou da ausência dela). */
export function buildProbeResult(params: {
  baseUrl: string;
  expectedBaseUrl: string;
  response?: { status: number; contentType?: string; bodyText?: string } | null;
}): EndpointProbeResult {
  const { baseUrl, expectedBaseUrl } = params;
  if (!params.response) {
    return {
      baseUrl,
      expectedBaseUrl,
      status: null,
      verdict: "network",
      snippet: "",
      message: endpointMessage("network", baseUrl, expectedBaseUrl),
    };
  }
  const verdict = classifyEndpointResponse(params.response);
  return {
    baseUrl,
    expectedBaseUrl,
    status: params.response.status,
    verdict,
    snippet: trimSnippet(params.response.bodyText ?? ""),
    message: endpointMessage(verdict, baseUrl, expectedBaseUrl),
  };
}
