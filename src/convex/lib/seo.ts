/**
 * Bio do link: o que aparece quando alguém compartilha a loja no Discord,
 * WhatsApp, Telegram, X…
 *
 * Importante: os robôs desses serviços NÃO executam JavaScript. Por isso os
 * mesmos valores resolvidos aqui são usados em dois lugares:
 *   1. gravados no HTML publicado pelo plugin `seoShareMetaPlugin` (vite.config.ts)
 *      (o que o Discord/WhatsApp realmente leem);
 *   2. aplicados no <head> em tempo de execução pelo app (título da aba e
 *      navegadores).
 * A regra de precedência fica só aqui, para os dois nunca divergirem.
 */

export type ShareMetaTag = {
  /** `name` (description, twitter:*) ou `property` (og:*). */
  attr: "name" | "property";
  key: string;
  content: string;
};

export type ShareMeta = {
  title: string;
  description: string;
  image: string | null;
  /** Verdadeiro quando a capa é um GIF animado (o Discord anima o card). */
  imageAnimated: boolean;
  siteName: string;
  themeColor: string;
  canonical: string | null;
};

/** Usados enquanto a loja não personaliza a bio (nada de card vazio). */
export const SHARE_FALLBACK_TITLE = "Apollo Craft — Loja Oficial";
export const SHARE_FALLBACK_DESCRIPTION =
  "Compre VIPs, cash e upgrades com entrega automática e pagamento seguro via PIX.";
const SHARE_FALLBACK_SITE_NAME = "Apollo Craft";
const DEFAULT_THEME_COLOR = "#0b1017";

/** URLs de GIF animado (as do Convex Storage não têm extensão — aí vale a flag). */
const GIF_URL = /\.gif($|[?#])/i;

const text = (value?: string | null) => (value ?? "").trim();

type StoreLike = {
  name?: string;
  description?: string;
  logoUrl?: string;
  seo?: {
    title?: string;
    description?: string;
    ogImage?: string;
    ogImageAnimated?: boolean;
    siteName?: string;
    themeColor?: string;
    canonical?: string;
  } | null;
};

/**
 * Resolve a bio do link a partir das configurações da loja. Campo em branco cai
 * para o próximo da fila: título → nome da loja → padrão; imagem → logo da
 * loja; cor → fundo do tema.
 */
export function buildShareMeta(
  store: StoreLike | null | undefined,
  theme?: { background?: string } | null,
): ShareMeta {
  const seo = store?.seo ?? {};
  const image = text(seo.ogImage) || text(store?.logoUrl) || null;

  return {
    title: text(seo.title) || text(store?.name) || SHARE_FALLBACK_TITLE,
    description:
      text(seo.description) || text(store?.description) || SHARE_FALLBACK_DESCRIPTION,
    image,
    imageAnimated: Boolean(seo.ogImageAnimated) || (image !== null && GIF_URL.test(image)),
    siteName: text(seo.siteName) || text(store?.name) || SHARE_FALLBACK_SITE_NAME,
    themeColor: text(seo.themeColor) || text(theme?.background) || DEFAULT_THEME_COLOR,
    canonical: text(seo.canonical) || null,
  };
}

/**
 * Tags `<head>` correspondentes à bio. Devolvidas como dados (não HTML) porque
 * o mesmo resultado é aplicado no DOM pelo app e serializado em HTML pelo
 * script de build.
 */
export function shareMetaTags(meta: ShareMeta): ShareMetaTag[] {
  const tags: ShareMetaTag[] = [
    { attr: "name", key: "description", content: meta.description },
    { attr: "name", key: "theme-color", content: meta.themeColor },
    { attr: "property", key: "og:type", content: "website" },
    { attr: "property", key: "og:site_name", content: meta.siteName },
    { attr: "property", key: "og:title", content: meta.title },
    { attr: "property", key: "og:description", content: meta.description },
    {
      attr: "name",
      key: "twitter:card",
      content: meta.image ? "summary_large_image" : "summary",
    },
    { attr: "name", key: "twitter:title", content: meta.title },
    { attr: "name", key: "twitter:description", content: meta.description },
  ];

  if (meta.image) {
    tags.push({ attr: "property", key: "og:image", content: meta.image });
    tags.push({ attr: "property", key: "og:image:alt", content: meta.title });
    if (meta.imageAnimated) {
      tags.push({ attr: "property", key: "og:image:type", content: "image/gif" });
    }
    tags.push({ attr: "name", key: "twitter:image", content: meta.image });
  }

  if (meta.canonical) {
    tags.push({ attr: "property", key: "og:url", content: meta.canonical });
  }

  return tags;
}
