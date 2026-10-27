// ─────────────────────────────────────────────────────────────
// Resolução do endereço do deployment Convex usado pelo app.
//
// O endereço normal vem de VITE_CONVEX_URL, embutido no build. O problema: um
// build já publicado saiu com essa variável apontando para um deployment que
// não roda esta loja (backend morto) — e, nesse caso, o cliente nunca conecta,
// toda query fica pendente e *todas* as telas ficam "carregando" para sempre.
//
// Por isso o app conhece também o deployment desta loja (o mesmo alvo dos
// rewrites de /api em vercel.json e das HTTP actions documentadas em
// /docs/api) e tenta ele em seguida. É infraestrutura pública da loja, não
// segredo: o valor já aparece no bundle publicado.
// ─────────────────────────────────────────────────────────────

/**
 * Deployment que hospeda esta loja. Se a loja mudar de deployment, atualize
 * este valor junto com `vercel.json`, `public/openapi-v1.json` e a
 * documentação da API.
 */
export const STORE_DEPLOYMENT_URL = "https://capable-akita-865.convex.cloud";

/**
 * Painel do Convex onde o limite de uso deste deployment é ajustado
 * (Deployment → Settings → Usage limits). Usado na tela de erro quando o
 * servidor é desativado automaticamente por estourar o limite.
 */
export const STORE_DASHBOARD_URL =
  "https://dashboard.convex.dev/t/freebuff/7cf38cdf-8e08-4dcd-bfce-f72dfc8d2371/capable-akita-865";

/**
 * Deployments que já existiram para esta loja e NÃO a servem mais.
 *
 * Por que existe: um build publicado saiu com `VITE_CONVEX_URL` apontando para
 * `tidy-mandrill-432` (um endereço que não executa mais nada). Como ele vinha
 * ANTES do deployment real na lista de candidatos, TODA visita gastava uma
 * tentativa inútil: o cliente abria um WebSocket que nunca conectava, o guard
 * disparava um POST de diagnóstico que voltava 500 e só então o app trocava de
 * endereço — tela de erro piscando e erro no log do Convex à toa.
 *
 * Endereços desta lista são pulados: nunca são tentados nem sondados. Isto NÃO
 * troca o deployment ativo (segue sendo `VITE_CONVEX_URL`), apenas evita um
 * endereço que já se sabe morto. Ao consolidar um deployment novo, basta
 * apontar `VITE_CONVEX_URL`/`STORE_DEPLOYMENT_URL` para ele; inclua aqui apenas
 * um endereço antigo que volte a aparecer em algum build.
 */
export const RETIRED_DEPLOYMENTS: readonly string[] = [
  "https://tidy-mandrill-432.convex.cloud",
];

/** Formato de um endereço de deployment Convex. */
const CONVEX_DEPLOYMENT = /^https:\/\/[a-z0-9-]+\.convex\.cloud$/i;

/** O endereço está na lista de deployments aposentados (nunca deve ser tentado). */
export function isRetiredDeployment(url: string): boolean {
  return RETIRED_DEPLOYMENTS.includes(url);
}

/**
 * Normaliza o valor de VITE_CONVEX_URL. Devolve "" quando ausente ou quando não
 * é um endereço de deployment Convex (evita construir o cliente com lixo).
 */
export function configuredConvexUrl(raw?: string | null): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  return CONVEX_DEPLOYMENT.test(value) ? value : "";
}

/**
 * Endereços a tentar, em ordem: o configurado no build e, se ele nunca
 * conectar, o deployment desta loja. Quando os dois coincidem (ou o configurado
 * está ausente), devolve um único endereço — sem tentativa extra.
 *
 * Um endereço APOSENTADO (ver RETIRED_DEPLOYMENTS) é descartado antes de tudo:
 * se o build saiu com ele embutido, o app vai direto ao deployment da loja, sem
 * tentativa, sem erro e sem reconexão. `VITE_CONVEX_URL` continua mandando
 * quando aponta para um endereço válido — inclusive um deployment novo.
 */
export function convexUrlCandidates(raw?: string | null): string[] {
  const configured = configuredConvexUrl(raw);
  if (!configured || isRetiredDeployment(configured)) return [STORE_DEPLOYMENT_URL];
  return configured === STORE_DEPLOYMENT_URL ? [configured] : [configured, STORE_DEPLOYMENT_URL];
}

/** Tempo máximo do teste abaixo — o normal é responder em menos de 100ms. */
const PROBE_TIMEOUT_MS = 4000;

/**
 * Pergunta ao endereço, por HTTP (mesmo endpoint público que as ferramentas
 * usam), se ele responde às funções desta loja. `settings:getStore` é público e
 * sempre devolve um objeto no backend certo, então um "não" aqui é motivo
 * suficiente para trocar de endereço na hora — sem esperar o WebSocket dar
 * (ou não) sinal de vida.
 */
export async function deploymentServesStore(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "settings:getStore", args: {}, format: "json" }),
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string } | null;
    return body?.status === "success";
  } catch {
    // Endereço fora do ar, sem CORS, com timeout ou resposta inválida: não
    // confirmamos a loja aqui — e o candidato seguinte é justamente o
    // deployment dela.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
