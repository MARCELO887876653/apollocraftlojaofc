// ─────────────────────────────────────────────────────────────
// Diagnóstico do servidor de dados (deployment Convex) da loja.
//
// Antes, quando o servidor recusava as consultas, a tela dizia apenas "confira
// VITE_CONVEX_URL" — o que mandava o dono procurar defeito no lugar errado. O
// caso mais comum é o deployment ficar DESATIVADO por limite de uso do Convex:
// o endereço está certo, o site abre, mas toda consulta volta erro.
//
// Aqui a resposta do servidor é lida e classificada para a tela conseguir
// explicar o que aconteceu (e para o app saber que deve tentar de novo).
// ─────────────────────────────────────────────────────────────

export type DeploymentFailureKind = "usage-limit" | "server" | "unreachable";

export type DeploymentFailure = {
  kind: DeploymentFailureKind;
  /** Mensagem curta em português, pronta para a tela. */
  message: string;
  /** Detalhe técnico devolvido pelo servidor (pode vir vazio). */
  detail: string;
};

/** O Convex desativa o deployment quando o limite configurado é atingido. */
const USAGE_LIMIT_MARKERS = [
  "exceeded a configured usage limit",
  "usage limit",
  "deployment has been disabled",
];

export function classifyDeploymentError(
  errorMessage?: string | null,
): DeploymentFailureKind {
  const text = (errorMessage ?? "").toLowerCase();
  if (USAGE_LIMIT_MARKERS.some((marker) => text.includes(marker))) {
    return "usage-limit";
  }
  return "server";
}

/** Remove o "[Request ID: …] Server Error" que o Convex põe na frente. */
export function cleanDeploymentError(errorMessage?: string | null): string {
  return (errorMessage ?? "")
    .replace(/^\[Request ID:[^\]]*\]\s*/i, "")
    .replace(/^Server Error\s*/i, "")
    .trim();
}

export function deploymentFailure(
  kind: DeploymentFailureKind,
  detail = "",
): DeploymentFailure {
  switch (kind) {
    case "usage-limit":
      return {
        kind,
        message: "O servidor da loja foi desativado porque atingiu o limite de uso.",
        detail,
      };
    case "unreachable":
      return {
        kind,
        message: "Não foi possível falar com o servidor da loja.",
        detail,
      };
    default:
      return {
        kind: "server",
        message: "O servidor da loja respondeu com erro.",
        detail,
      };
  }
}

export type DeploymentCheck =
  | { ok: true }
  | { ok: false; failure: DeploymentFailure };

/**
 * Pergunta ao deployment (mesmo endpoint público que o site usa) se ele está
 * executando as funções desta loja. Responde rápido e nunca lança: qualquer
 * falha de rede vira `unreachable`.
 */
export async function checkDeployment(
  url: string,
  timeoutMs = 6000,
): Promise<DeploymentCheck> {
  if (!url) {
    return {
      ok: false,
      failure: deploymentFailure(
        "unreachable",
        "VITE_CONVEX_URL não está configurada neste build.",
      ),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // A pergunta é feita na consulta que o app REALMENTE precisa para abrir
      // (o shell da loja): assim um endereço que responde outras funções mas não
      // tem esta é acusado em vez de passar no teste.
      body: JSON.stringify({ path: "storefront:getShell", args: {}, format: "json" }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        failure: deploymentFailure("server", `HTTP ${res.status} em ${url}`),
      };
    }
    const body = (await res.json()) as {
      status?: string;
      errorMessage?: string;
    } | null;
    if (body?.status === "success") return { ok: true };

    const detail = cleanDeploymentError(body?.errorMessage);
    return {
      ok: false,
      failure: deploymentFailure(classifyDeploymentError(body?.errorMessage), detail),
    };
  } catch {
    return { ok: false, failure: deploymentFailure("unreachable") };
  } finally {
    clearTimeout(timer);
  }
}
