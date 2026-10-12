/**
 * Bio do link dentro do HTML publicado.
 *
 * Os robôs do Discord/WhatsApp/Telegram NÃO executam JavaScript: eles leem o
 * HTML servido. Então o `<title>`, a `description`, as tags `og:*`/`twitter:*` e
 * a capa precisam estar dentro do `index.html` entregue.
 *
 * Duas peças usam este módulo:
 *   1. o plugin `seoShareMeta` do `vite.config.ts`, que injeta o bloco durante o
 *      BUILD (é a peça que garante que publicar a loja atualize o card, seja
 *      qual for o comando de build usado);
 *   2. o painel (Configurações → Bio do link), que lê o HTML publicado com
 *      `publishedShareMeta` e compara com o que está salvo, avisando quando o
 *      card no ar ainda é o antigo.
 *
 * Nada aqui depende de Convex nem do navegador: são funções puras + um fetch,
 * para poderem rodar no build (Node) e no painel.
 */
// Imports RELATIVOS de propósito: este módulo é usado pelo `vite.config.ts`
// (projeto TS do Node, sem o alias "@") e pelo painel — o caminho relativo
// resolve nos dois sem duplicar configuração de paths.
import type { ShareMeta, ShareMetaTag } from "../convex/lib/seo";
import { STORE_DEPLOYMENT_URL } from "./convex-url";

/** Marcadores que delimitam a região gerada dentro do `<head>`. */
export const SHARE_BLOCK_START = "<!-- seo:link-preview:start";
export const SHARE_BLOCK_END = "<!-- seo:link-preview:end -->";

/** Resposta do servidor para a bio já resolvida (mesma forma de `getShareMeta`). */
export type ShareMetaPayload = { meta: ShareMeta; tags: ShareMetaTag[] };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const decodeHtml = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * Bloco de `<head>` com a bio. O preconnect do deployment vem primeiro: as
 * consultas, a API e as imagens da loja saem desse mesmo host, então a conexão
 * (DNS + TLS + WebSocket) já está pronta quando o app pede os dados — sem isso o
 * navegador só descobre o host depois de baixar e executar o JavaScript.
 * São duas linhas porque o navegador mantém sockets separados para requisições
 * com CORS (API/WebSocket) e sem CORS (imagens).
 */
export function renderShareMetaBlock(
  payload: ShareMetaPayload,
  deploymentUrl: string = STORE_DEPLOYMENT_URL,
): string {
  const lines: string[] = [];
  try {
    const origin = new URL(deploymentUrl).origin;
    lines.push(`  <link rel="preconnect" href="${escapeHtml(origin)}" />`);
    lines.push(`  <link rel="preconnect" href="${escapeHtml(origin)}" crossorigin />`);
  } catch {
    // Endereço inválido: o bloco segue sem preconnect.
  }

  lines.push(`  <title>${escapeHtml(payload.meta.title)}</title>`);
  for (const tag of payload.tags) {
    lines.push(`  <meta ${tag.attr}="${tag.key}" content="${escapeHtml(tag.content)}" />`);
  }
  if (payload.meta.canonical) {
    lines.push(`  <link rel="canonical" href="${escapeHtml(payload.meta.canonical)}" />`);
  }
  return lines.join("\n");
}

/**
 * Troca a região entre os marcadores pelo bloco novo. Devolve `null` quando o
 * HTML não tem os marcadores — aí o HTML original é usado como está, em vez de
 * ser servido sem as tags.
 */
export function injectShareMetaBlock(html: string, block: string): string | null {
  const startIndex = html.indexOf(SHARE_BLOCK_START);
  if (startIndex === -1) return null;
  const startLineEnd = html.indexOf("\n", startIndex);
  const endIndex = html.indexOf(SHARE_BLOCK_END, startIndex);
  if (startLineEnd === -1 || endIndex === -1 || endIndex < startLineEnd) return null;
  return html.slice(0, startLineEnd + 1) + block + "\n  " + html.slice(endIndex);
}

/** Lê a bio do link do servidor (endpoint público, o mesmo que as ferramentas usam). */
export async function fetchShareMetaPayload(
  deploymentUrl: string,
  timeoutMs = 8000,
): Promise<ShareMetaPayload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${deploymentUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "settings:getShareMeta", args: {}, format: "json" }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as {
      status?: string;
      value?: ShareMetaPayload;
      errorMessage?: string;
    } | null;
    if (body?.status !== "success" || !body.value?.meta) {
      throw new Error(body?.errorMessage ?? "resposta inesperada do servidor");
    }
    return body.value;
  } finally {
    clearTimeout(timer);
  }
}

/** Campos do `<head>` que interessam na comparação com o painel. */
export type PublishedShareMeta = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  hasTags: boolean;
};

const META_TAG = /<meta\b[^>]*>/gi;
const ATTR = /([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g;

/**
 * Lê as tags já publicadas de um HTML. Tolerante à ordem dos atributos e a tags
 * escritas em qualquer ordem (o gerador escreve `attr="key" content="…"`, mas
 * quem editar isso à mão não deveria quebrar a verificação do painel).
 */
export function publishedShareMeta(html: string): PublishedShareMeta {
  const meta: Record<string, string> = {};
  for (const tag of html.match(META_TAG) ?? []) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(ATTR)) attrs[match[1].toLowerCase()] = decodeHtml(match[2]);
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content !== undefined) meta[key] = attrs.content;
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    title: title ? decodeHtml(title[1].trim()) : null,
    description: meta.description ?? null,
    image: meta["og:image"] ?? null,
    siteName: meta["og:site_name"] ?? null,
    hasTags: Boolean(meta["og:title"] || meta.description),
  };
}

/**
 * Diferenças entre o que está no ar e o que está salvo no painel. Lista vazia =
 * card publicado em dia. Devolve também quando o HTML publicado não tem tag
 * nenhuma (aí não dá para afirmar que está desatualizado).
 */
export function shareMetaDiff(
  published: PublishedShareMeta,
  expected: Pick<ShareMeta, "title" | "description" | "image" | "siteName">,
): { stale: string[]; comparable: boolean } {
  if (!published.hasTags) return { stale: [], comparable: false };
  const stale: string[] = [];
  if (published.title !== expected.title) stale.push("título");
  if (published.description !== expected.description) stale.push("descrição");
  if (published.siteName && published.siteName !== expected.siteName) stale.push("nome do site");
  if (published.image !== (expected.image ?? null)) stale.push("capa");
  return { stale, comparable: true };
}
