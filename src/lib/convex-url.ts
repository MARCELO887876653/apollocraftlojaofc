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

/** Formato de um endereço de deployment Convex. */
const CONVEX_DEPLOYMENT = /^https:\/\/[a-z0-9-]+\.convex\.cloud$/i;

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
 */
export function convexUrlCandidates(raw?: string | null): string[] {
  const configured = configuredConvexUrl(raw);
  if (!configured) return [STORE_DEPLOYMENT_URL];
  return configured === STORE_DEPLOYMENT_URL ? [configured] : [configured, STORE_DEPLOYMENT_URL];
}
