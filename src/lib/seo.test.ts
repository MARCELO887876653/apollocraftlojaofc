import { describe, expect, it } from "vitest";
import { applyShareMeta, type ShareMetaDocument, type ShareMetaTag } from "./seo";

/** Elemento <meta> falso, com os atributos guardados num mapa. */
function fakeMeta() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (name: string, value: string) => {
      attrs.set(name, value);
    },
    getAttribute: (name: string) => attrs.get(name) ?? null,
  };
}

/**
 * Documento falso que entende só o seletor usado pelo app:
 * `meta[name="..."]` / `meta[property="..."]`.
 */
function fakeDocument() {
  const metas: ReturnType<typeof fakeMeta>[] = [];
  return {
    title: "",
    metas,
    createElement: () => fakeMeta(),
    head: {
      querySelector: (selector: string) => {
        const match = /^meta\[(name|property)="(.+)"\]$/.exec(selector);
        if (!match) return null;
        const [, attr, key] = match;
        return metas.find((m) => m.getAttribute(attr) === key) ?? null;
      },
      appendChild: (el: ReturnType<typeof fakeMeta>) => {
        metas.push(el);
        return el;
      },
      removeChild: (el: ReturnType<typeof fakeMeta>) => {
        const index = metas.indexOf(el);
        if (index >= 0) metas.splice(index, 1);
        return el;
      },
    },
  };
}

const TAG: ShareMetaTag = { attr: "property", key: "og:title", content: "Apollo" };

describe("applyShareMeta", () => {
  it("define o título da aba e cria as tags que ainda não existem", () => {
    const doc = fakeDocument();

    applyShareMeta(
      { title: "Apollo Craft", image: null },
      [TAG],
      doc as unknown as ShareMetaDocument,
    );

    expect(doc.title).toBe("Apollo Craft");
    expect(doc.metas).toHaveLength(1);
    expect(doc.metas[0].getAttribute("property")).toBe("og:title");
    expect(doc.metas[0].getAttribute("content")).toBe("Apollo");
  });

  it("atualiza uma tag existente em vez de duplicá-la", () => {
    const doc = fakeDocument();
    applyShareMeta({ title: "A", image: null }, [TAG], doc as unknown as ShareMetaDocument);

    applyShareMeta(
      { title: "B", image: null },
      [{ ...TAG, content: "Atualizado" }],
      doc as unknown as ShareMetaDocument,
    );

    expect(doc.metas).toHaveLength(1);
    expect(doc.metas[0].getAttribute("content")).toBe("Atualizado");
    expect(doc.title).toBe("B");
  });

  it("remove a capa antiga quando a loja limpa a imagem do link", () => {
    const doc = fakeDocument();
    const withImage: ShareMetaTag[] = [
      { attr: "property", key: "og:image", content: "https://cdn/capa.gif" },
      { attr: "name", key: "twitter:image", content: "https://cdn/capa.gif" },
      { attr: "property", key: "og:title", content: "Apollo" },
    ];
    applyShareMeta(
      { title: "Apollo", image: "https://cdn/capa.gif" },
      withImage,
      doc as unknown as ShareMetaDocument,
    );
    expect(doc.metas).toHaveLength(3);

    applyShareMeta(
      { title: "Apollo", image: null },
      [{ attr: "property", key: "og:title", content: "Apollo" }],
      doc as unknown as ShareMetaDocument,
    );

    expect(doc.metas.map((m) => m.getAttribute("property"))).toEqual(["og:title"]);
  });

  it("cria cada tag identificada pelo seu atributo (name ou property)", () => {
    const doc = fakeDocument();
    const tags: ShareMetaTag[] = [
      { attr: "name", key: "description", content: "Loja de VIPs" },
      { attr: "property", key: "og:image", content: "https://cdn/gif.gif" },
    ];

    applyShareMeta(
      { title: "X", image: "https://cdn/gif.gif" },
      tags,
      doc as unknown as ShareMetaDocument,
    );

    expect(doc.metas.map((m) => [m.getAttribute("name") ?? m.getAttribute("property"), m.getAttribute("content")])).toEqual([
      ["description", "Loja de VIPs"],
      ["og:image", "https://cdn/gif.gif"],
    ]);
  });
});
