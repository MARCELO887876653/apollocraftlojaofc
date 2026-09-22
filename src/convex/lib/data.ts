import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────
// Helpers de dados compartilhados entre funções Convex
// ─────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Lê um documento de configuração por chave. */
export async function getSetting<T = unknown>(
  ctx: QueryCtx,
  key: string,
): Promise<T | null> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return (doc?.value as T) ?? null;
}

export async function setSetting(
  ctx: MutationCtx,
  key: string,
  value: unknown,
) {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const updatedAt = Date.now();
  if (doc) {
    await ctx.db.patch(doc._id, { value, updatedAt });
  } else {
    await ctx.db.insert("settings", { key, value, updatedAt });
  }
}

// ─── Defaults (usados como fallback caso a config não exista) ───

export const DEFAULT_STORE = {
  name: "ApolloCraft",
  description: "A loja definitiva para VIPs, cash e upgrades do seu servidor — entrega automática 24/7.",
  logoUrl: "",
  faviconUrl: "",
  currency: "BRL",
  email: "",
  discord: "",
  whatsapp: "",
  instagram: "",
  twitter: "",
  youtube: "",
  maintenance: {
    enabled: false,
    title: "Estamos em manutenção",
    message: "Voltaremos em breve com novidades!",
    eta: "",
  },
  checkoutFields: [
    { key: "name", label: "Nome completo", enabled: true, required: true },
    { key: "email", label: "E-mail", enabled: true, required: true },
    { key: "discord", label: "Discord", enabled: true, required: false },
    { key: "minecraftNick", label: "Nickname do Minecraft", enabled: true, required: false },
    { key: "phone", label: "Telefone", enabled: false, required: false },
    { key: "uuid", label: "UUID do Minecraft", enabled: false, required: false },
  ],
  seo: {
    title: "ApolloCraft — Loja Oficial",
    description: "Compre VIPs, cash e upgrades com entrega automática e pagamento seguro via PIX.",
    ogImage: "",
    canonical: "",
  },
};

/** Tema dark permanente da ApolloCraft (estilo vitrine escura, CTA branco). */
export const DEFAULT_THEME = {
  primary: "#818cf8",
  primaryForeground: "#0b0d12",
  secondary: "#181c26",
  secondaryForeground: "#e6e8ee",
  background: "#0a0c10",
  foreground: "#f0f2f6",
  card: "#101318",
  border: "#1f242e",
  radius: 14,
  font: "Inter",
  darkMode: true,
};

export const DEFAULT_HOMEPAGE = [
  { id: "hero", type: "hero", enabled: true, config: {} },
  { id: "benefits", type: "benefits", enabled: true, config: {} },
  { id: "categories", type: "categories", enabled: true, config: {} },
  { id: "featured", type: "featured", enabled: true, config: { title: "Produtos em destaque", count: 8 } },
  { id: "promo", type: "promo", enabled: true, config: { title: "Promoções", count: 4 } },
  { id: "popular", type: "popular", enabled: true, config: { title: "Mais vendidos", count: 8 } },
  { id: "new", type: "new", enabled: true, config: { title: "Lançamentos", count: 4 } },
  { id: "faq", type: "faq", enabled: true, config: { title: "Perguntas frequentes", count: 6 } },
];

/** Garante que as configurações existam (idempotente). */
export async function ensureDefaults(ctx: MutationCtx) {
  const defaults: Array<[string, unknown]> = [
    ["store", DEFAULT_STORE],
    ["theme", DEFAULT_THEME],
    ["homepage", DEFAULT_HOMEPAGE],
    [
      "menu",
      [
        { label: "Início", url: "/", newTab: false },
        { label: "Catálogo", url: "/loja", newTab: false },
      ],
    ],      [
        "footer",
        {
          about: "ApolloCraft — sua loja de confiança com entrega automática e pagamento seguro via PIX.",
          columns: [{ title: "Institucional", links: [{ label: "Termos de uso", url: "/p/termos" }, { label: "Privacidade", url: "/p/privacidade" }] }],
          copyright: "",
        },
      ],
  ];
  for (const [key, value] of defaults) {
    const existing = await getSetting(ctx, key);
    if (existing === null) await setSetting(ctx, key, value);
  }
}

const ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Gera número de pedido único (checa colisão no banco). */
export async function generateOrderNumber(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    let n = "#";
    for (let j = 0; j < 8; j++) {
      n += ORDER_ALPHABET[Math.floor(Math.random() * ORDER_ALPHABET.length)];
    }
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_number", (q) => q.eq("number", n))
      .first();
    if (!existing) return n;
  }
  throw new Error("Não foi possível gerar um número de pedido");
}

export function generateToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Contador de rate limit por janela deslizante simples. Retorna true se permitido. */
export async function checkRateLimit(
  ctx: MutationCtx,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const doc = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (!doc || now - doc.windowStart > windowMs) {
    if (doc) await ctx.db.patch(doc._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
    return true;
  }
  if (doc.count >= max) return false;
  await ctx.db.patch(doc._id, { count: doc.count + 1 });
  return true;
}

export type Product = Doc<"products">;
export type ProductVariant = Doc<"productVariants">;
export type Category = Doc<"categories">;
export type Order = Doc<"orders">;
