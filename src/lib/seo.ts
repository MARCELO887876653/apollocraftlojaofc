import type { ShareMeta, ShareMetaTag } from "@/convex/lib/seo";

export type { ShareMeta, ShareMetaTag };

/**
 * Parte do `document` que aplicamos — descrita de forma mínima para que a
 * aplicação da bio do link seja testável sem navegador (o teste passa um
 * documento falso).
 */
export type ShareMetaDocument = Pick<Document, "title"> & {
  head: {
    querySelector(selectors: string): Element | null;
    appendChild(node: Element): unknown;
    removeChild(node: Element): unknown;
  };
  createElement(tagName: string): Element;
};

const metaSelector = (attr: string, key: string) => `meta[${attr}="${key}"]`;

/** Tags que só existem quando há capa — removidas quando a capa é limpa. */
const IMAGE_TAGS = [
  { attr: "property", key: "og:image" },
  { attr: "property", key: "og:image:alt" },
  { attr: "property", key: "og:image:type" },
  { attr: "name", key: "twitter:image" },
] as const;

/**
 * Aplica no <head> a bio do link vinda do servidor(`settings.getShareMeta`).
 *
 * Os robôs do Discord/WhatsApp não rodam JavaScript — o que eles leem é o HTML
 * publicado, gravado pelo `scripts/inject-seo-tags.mjs`. Aqui o alvo é o
 * navegador: título da aba e, para qualquer consumidor que leia o DOM, a mesma
 * bio sem esperar a próxima publicação.
 */
export function applyShareMeta(
  meta: Pick<ShareMeta, "title" | "image">,
  tags: ShareMetaTag[],
  doc: ShareMetaDocument = document,
): void {
  doc.title = meta.title;

  for (const tag of tags) {
    const existing = doc.head.querySelector(
      metaSelector(tag.attr, tag.key),
    ) as Element | null;
    if (existing) {
      existing.setAttribute("content", tag.content);
      continue;
    }

    const created = doc.createElement("meta");
    created.setAttribute(tag.attr, tag.key);
    created.setAttribute("content", tag.content);
    doc.head.appendChild(created);
  }

  // Sem capa agora (o admin removeu a imagem/GIF): não deixe a capa antiga
  // presa no <head> até a próxima publicação.
  if (!meta.image) {
    for (const tag of IMAGE_TAGS) {
      const stale = doc.head.querySelector(metaSelector(tag.attr, tag.key));
      if (stale) doc.head.removeChild(stale);
    }
  }
}
