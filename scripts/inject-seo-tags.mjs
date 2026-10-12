// Grava a "bio do link" (painel → Configurações → Bio do link) no HTML que é
// publicado.
//
// Por quê: Discord, WhatsApp, Telegram e Google NÃO executam JavaScript. Num
// site SPA eles leem só o index.html servido — então o `<title>`, a
// `description` e a capa (imagem ou GIF) precisam estar lá dentro no build.
//
// Roda no `prebuild` (antes do vite build). Os valores são resolvidos pelo
// servidor (`settings:getShareMeta`), que é a MESMA fonte usada pelo app —
// nada de regra duplicada aqui. Se o Convex estiver fora do ar no build, o
// HTML anterior é mantido e o build segue normalmente.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(root, "index.html");

/** Marcadores que delimitam a região gerada dentro do <head>. */
const START_MARKER = "<!-- seo:link-preview:start";
const END_MARKER = "<!-- seo:link-preview:end -->";

/** Mesmo deployment de `src/lib/convex-url.ts` (infra pública da loja). */
const STORE_DEPLOYMENT_URL = "https://capable-akita-865.convex.cloud";
const TIMEOUT_MS = 8000;

function deploymentCandidates() {
  const configured = (process.env.VITE_CONVEX_URL ?? "").trim().replace(/\/+$/, "");
  return Array.from(new Set([configured, STORE_DEPLOYMENT_URL].filter(Boolean)));
}

/** Pergunta ao servidor a bio do link já resolvida ({ meta, tags }). */
async function fetchShareMeta(url) {
  const response = await fetch(`${url}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "settings:getShareMeta",
      args: {},
      format: "json",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.status !== "success" || !payload.value?.meta) {
    throw new Error(payload?.errorMessage ?? "resposta inesperada do servidor");
  }
  return payload.value;
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Monta o bloco de <head> com a bio do link. */
function renderTags({ meta, tags }) {
  const lines = [`  <title>${escapeHtml(meta.title)}</title>`];
  for (const tag of tags) {
    lines.push(
      `  <meta ${tag.attr}="${tag.key}" content="${escapeHtml(tag.content)}" />`,
    );
  }
  if (meta.canonical) {
    lines.push(`  <link rel="canonical" href="${escapeHtml(meta.canonical)}" />`);
  }
  return lines.join("\n");
}

async function main() {
  const html = readFileSync(indexPath, "utf8");
  const startLineEnd = html.indexOf("\n", html.indexOf(START_MARKER));
  const endIndex = html.indexOf(END_MARKER);
  if (startLineEnd === -1 || endIndex === -1 || endIndex < startLineEnd) {
    console.warn(
      "[seo] index.html sem os marcadores seo:link-preview — nada foi alterado.",
    );
    return;
  }

  let value = null;
  const failures = [];
  for (const url of deploymentCandidates()) {
    try {
      value = await fetchShareMeta(url);
      break;
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (!value) {
    console.warn(
      `[seo] não foi possível ler a bio do link (${failures.join(" | ")}). ` +
        "O index.html anterior foi mantido.",
    );
    return;
  }

  const next =
    html.slice(0, startLineEnd + 1) +
    renderTags(value) +
    "\n  " +
    html.slice(endIndex);

  if (next !== html) writeFileSync(indexPath, next);
  console.log(
    `[seo] bio do link gravada no index.html: "${value.meta.title}"` +
      (value.meta.image ? " (com capa)" : " (sem capa)"),
  );
}

await main();
