import { describe, expect, it } from "vitest";
import { buildShareMeta, shareMetaTags, type ShareMeta } from "@/convex/lib/seo";
import {
  injectShareMetaBlock,
  publishedShareMeta,
  renderShareMetaBlock,
  SHARE_BLOCK_END,
  SHARE_BLOCK_START,
  shareMetaDiff,
  type ShareMetaPayload,
} from "@/lib/shareMetaHtml";

const payloadOf = (meta: Partial<ShareMeta>): ShareMetaPayload => {
  const full = buildShareMeta({
    name: meta.siteName ?? "Loja do Zé",
    description: "Cash e VIPs",
    logoUrl: meta.image ?? undefined,
    seo: {
      title: meta.title,
      description: meta.description,
      ogImage: meta.image ?? undefined,
      siteName: meta.siteName,
    },
  });
  return { meta: full, tags: shareMetaTags(full) };
};

const htmlWithMarkers = (inner: string) =>
  [
    "<!doctype html>",
    "<html>",
    "<head>",
    '  <meta charset="UTF-8" />',
    `  ${SHARE_BLOCK_START} — gerado no build -->`,
    inner,
    `  ${SHARE_BLOCK_END}`,
    "  <style>html { background: #000; }</style>",
    "</head>",
    '<body><div id="root"></div></body>',
    "</html>",
  ].join("\n");

describe("renderShareMetaBlock", () => {
  it("publica preconnect, título, descrição e capa", () => {
    const block = renderShareMetaBlock(
      payloadOf({ title: "Loja do Zé", description: "Cash barato", image: "https://cdn/capa.png" }),
      "https://loja.convex.cloud",
    );

    expect(block).toContain('<link rel="preconnect" href="https://loja.convex.cloud" />');
    expect(block).toContain(
      '<link rel="preconnect" href="https://loja.convex.cloud" crossorigin />',
    );
    expect(block).toContain("<title>Loja do Zé</title>");
    expect(block).toContain(
      '<meta property="og:description" content="Cash barato" />',
    );
    expect(block).toContain('<meta property="og:image" content="https://cdn/capa.png" />');
  });

  it("escapa aspas para não quebrar o atributo", () => {
    const block = renderShareMetaBlock(
      payloadOf({ title: 'Kit "Premium"', description: "Entrega <automática>" }),
    );

    expect(block).toContain("<title>Kit &quot;Premium&quot;</title>");
    expect(block).toContain("Entrega &lt;automática&gt;");
  });

  it("endereço inválido não gera preconnect (e não derruba o resto)", () => {
    const block = renderShareMetaBlock(payloadOf({ title: "Loja" }), "não-é-url");
    expect(block).not.toContain("preconnect");
    expect(block).toContain("<title>Loja</title>");
  });
});

describe("injectShareMetaBlock", () => {
  it("troca só a região entre os marcadores", () => {
    const html = htmlWithMarkers("  <title>Antigo</title>");
    const next = injectShareMetaBlock(
      html,
      renderShareMetaBlock(payloadOf({ title: "Novo", description: "Descrição nova" })),
    );

    expect(next).not.toBeNull();
    expect(next).toContain("<title>Novo</title>");
    expect(next).toContain('<meta property="og:description" content="Descrição nova" />');
    expect(next).not.toContain("Antigo");
    // O resto do documento fica intacto.
    expect(next).toContain('<div id="root"></div>');
    expect(next).toContain("html { background: #000; }");
    expect(next).toContain(SHARE_BLOCK_START);
    expect(next).toContain(SHARE_BLOCK_END);
  });

  it("é idempotente: aplicar duas vezes dá o mesmo HTML", () => {
    const block = renderShareMetaBlock(payloadOf({ title: "Loja", description: "Igual" }));
    const once = injectShareMetaBlock(htmlWithMarkers("  <title>Antigo</title>"), block)!;
    const twice = injectShareMetaBlock(once, block)!;

    expect(twice).toBe(once);
    expect(once.match(/<title>/g)).toHaveLength(1);
  });

  it("devolve null quando faltam os marcadores (não publica <head> vazio)", () => {
    expect(injectShareMetaBlock("<html><head></head></html>", "<title>x</title>")).toBeNull();
  });
});

describe("publishedShareMeta + shareMetaDiff", () => {
  const publishedHtml = [
    "<head>",
    "<title>Apollo Craft — Loja Oficial</title>",
    '<meta content="Compre VIPs, cash e upgrades." name="description" />',
    '<meta property="og:site_name" content="Apollo Craft" />',
    '<meta content="https://cdn/antiga.png" property="og:image" />',
    "</head>",
  ].join("\n");

  it("lê as tags publicadas mesmo com atributos fora de ordem", () => {
    const published = publishedShareMeta(publishedHtml);

    expect(published.title).toBe("Apollo Craft — Loja Oficial");
    expect(published.description).toBe("Compre VIPs, cash e upgrades.");
    expect(published.image).toBe("https://cdn/antiga.png");
    expect(published.hasTags).toBe(true);
  });

  it("aponta o que está desatualizado em relação ao painel", () => {
    const { stale, comparable } = shareMetaDiff(publishedShareMeta(publishedHtml), {
      title: "Apollo Craft — Loja Oficial",
      description: "Encontre os melhores kits para Minecraft.",
      image: "https://cdn/nova.png",
      siteName: "Apollo Craft",
    });

    expect(comparable).toBe(true);
    expect(stale).toEqual(["descrição", "capa"]);
  });

  it("quando o HTML publicado não tem tag nenhuma, não afirma desatualizado", () => {
    const { stale, comparable } = shareMetaDiff(publishedShareMeta("<head></head>"), {
      title: "T",
      description: "D",
      image: null,
      siteName: "S",
    });

    expect(comparable).toBe(false);
    expect(stale).toEqual([]);
  });
});
