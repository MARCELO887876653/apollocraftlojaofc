import { describe, expect, it } from "vitest";
import {
  SHARE_FALLBACK_DESCRIPTION,
  SHARE_FALLBACK_TITLE,
  buildShareMeta,
  shareMetaTags,
} from "../lib/seo";

const tagsObject = (tags: ReturnType<typeof shareMetaTags>) =>
  Object.fromEntries(tags.map((t) => [t.key, t.content]));

describe("buildShareMeta", () => {
  it("usa a bio cadastrada no painel quando ela existe", () => {
    const meta = buildShareMeta({
      name: "Apollo Craft",
      logoUrl: "https://cdn/logo.png",
      seo: {
        title: "Apollo Craft — VIPs até 50% OFF",
        description: "Entrega automática no seu nick.",
        ogImage: "https://cdn/capa.gif",
        siteName: "Apollo Craft",
        themeColor: "#0ea5e9",
      },
    });

    expect(meta.title).toBe("Apollo Craft — VIPs até 50% OFF");
    expect(meta.description).toBe("Entrega automática no seu nick.");
    expect(meta.image).toBe("https://cdn/capa.gif");
    expect(meta.themeColor).toBe("#0ea5e9");
  });

  it("detecta GIF pela extensão e também pela marcação do painel", () => {
    expect(buildShareMeta({ seo: { ogImage: "https://cdn/x.gif" } }).imageAnimated).toBe(true);
    expect(buildShareMeta({ seo: { ogImage: "https://cdn/x.png" } }).imageAnimated).toBe(false);
    // URLs do Convex Storage não têm extensão: aí vale a marcação explícita.
    expect(
      buildShareMeta({
        seo: { ogImage: "https://capable.convex.cloud/api/storage/abc", ogImageAnimated: true },
      }).imageAnimated,
    ).toBe(true);
  });

  it("cai na logo, no nome da loja e no tema quando os campos estão vazios", () => {
    const meta = buildShareMeta(
      { name: "Loja do Zé", description: "Cash e VIPs", logoUrl: "https://cdn/logo.png", seo: { title: " ", description: "" } },
      { background: "#101820" },
    );

    expect(meta.title).toBe("Loja do Zé");
    expect(meta.description).toBe("Cash e VIPs");
    expect(meta.image).toBe("https://cdn/logo.png");
    expect(meta.siteName).toBe("Loja do Zé");
    expect(meta.themeColor).toBe("#101820");
    expect(meta.canonical).toBeNull();
  });

  it("usa os padrões do site quando não há nada cadastrado", () => {
    const meta = buildShareMeta(null);

    expect(meta.title).toBe(SHARE_FALLBACK_TITLE);
    expect(meta.description).toBe(SHARE_FALLBACK_DESCRIPTION);
    expect(meta.image).toBeNull();
    expect(meta.siteName).toBe("Apollo Craft");
    expect(meta.themeColor).toBe("#0b1017");
  });
});

describe("shareMetaTags", () => {
  it("inclui a capa e o cartão grande quando há imagem ou GIF", () => {
    const tags = tagsObject(
      shareMetaTags(
        buildShareMeta({ seo: { ogImage: "https://cdn/capa.gif", title: "T", description: "D" } }),
      ),
    );

    expect(tags["og:image"]).toBe("https://cdn/capa.gif");
    expect(tags["og:image:type"]).toBe("image/gif");
    expect(tags["twitter:image"]).toBe("https://cdn/capa.gif");
    expect(tags["twitter:card"]).toBe("summary_large_image");
  });

  it("sem capa, publica um cartão de texto e nenhuma tag de imagem", () => {
    const tags = tagsObject(shareMetaTags(buildShareMeta({ seo: {} })));

    expect(tags["og:image"]).toBeUndefined();
    expect(tags["twitter:card"]).toBe("summary");
    expect(tags["og:title"]).toBe(SHARE_FALLBACK_TITLE);
    expect(tags["og:description"]).toBe(SHARE_FALLBACK_DESCRIPTION);
  });

  it("só publica og:url quando a loja define o endereço oficial", () => {
    expect(tagsObject(shareMetaTags(buildShareMeta({ seo: {} })))["og:url"]).toBeUndefined();

    const tags = tagsObject(
      shareMetaTags(buildShareMeta({ seo: { canonical: "https://apollocraft.online" } })),
    );
    expect(tags["og:url"]).toBe("https://apollocraft.online");
  });
});
