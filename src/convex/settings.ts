import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAdmin, logAudit } from "./lib/admin";
import { getSetting, setSetting, DEFAULT_STORE, DEFAULT_THEME, DEFAULT_HOMEPAGE } from "./lib/data";

/**
 * Migration idempotente: garante ApolloCraft + tema dark. Só preenche o que
 * ainda usa o valor padrão antigo (NexaStore / tema claro), sem sobrescrever
 * personalizações reais do admin.
 */
export const applyBrandDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const OLD_VALUES = {
      storeNames: ["NexaStore", "Loja"],
      oldSeoTitle: "NexaStore — Loja Digital",
      oldPrimaries: ["#7c3aed", "#6366f1"], // roxo original e indigo anterior
      oldBackgrounds: ["#ffffff", "#0b0d12"],
    };

    // store
    const store = (await getSetting(ctx, "store")) as any;
    if (store && OLD_VALUES.storeNames.includes(store.name)) {
      await setSetting(ctx, "store", {
        ...store,
        name: DEFAULT_STORE.name,
        description: DEFAULT_STORE.description,
        seo: { ...DEFAULT_STORE.seo },
      });
    }

    // theme (só se ainda for um tema padrão antigo, preservando o raio ajustado)
    const theme = (await getSetting(ctx, "theme")) as any;
    if (
      theme &&
      OLD_VALUES.oldPrimaries.includes(theme.primary) &&
      OLD_VALUES.oldBackgrounds.includes(theme.background)
    ) {
      await setSetting(ctx, "theme", {
        ...DEFAULT_THEME,
        radius: typeof theme.radius === "number" ? theme.radius : DEFAULT_THEME.radius,
      });
    }

    return { ok: true };
  },
});

// ─── Públicas (loja) ───

export const getStore = query({
  args: {},
  handler: async (ctx) => {
    const store = (await getSetting(ctx, "store")) as any;
    return store ?? DEFAULT_STORE;
  },
});

export const getTheme = query({
  args: {},
  handler: async (ctx) => {
    return (await getSetting(ctx, "theme")) ?? DEFAULT_THEME;
  },
});

export const getHomepage = query({
  args: {},
  handler: async (ctx) => {
    return (await getSetting(ctx, "homepage")) ?? DEFAULT_HOMEPAGE;
  },
});

export const getMenu = query({
  args: {},
  handler: async (ctx) => {
    return (await getSetting(ctx, "menu")) ?? [];
  },
});

export const getFooter = query({
  args: {},
  handler: async (ctx) => {
    return (await getSetting(ctx, "footer")) ?? { about: "", columns: [], copyright: "" };
  },
});

export const isMaintenance = query({
  args: {},
  handler: async (ctx) => {
    const store = (await getSetting(ctx, "store")) as any;
    return store?.maintenance?.enabled ?? false;
  },
});

// ─── Admin: obter tudo (para as telas de config) ───

export const getStoreConfig = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "settings.manage");
    const store = (await getSetting(ctx, "store")) as any;
    return store ?? DEFAULT_STORE;
  },
});

export const getAppearance = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "appearance.manage");
    const theme = (await getSetting(ctx, "theme")) as any;
    const homepage = (await getSetting(ctx, "homepage")) as any[];
    const menu = (await getSetting(ctx, "menu")) as any[];
    const footer = (await getSetting(ctx, "footer")) as any;
    return { theme: theme ?? DEFAULT_THEME, homepage: homepage ?? DEFAULT_HOMEPAGE, menu: menu ?? [], footer };
  },
});

const storePatch = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  faviconUrl: v.optional(v.string()),
  currency: v.optional(v.string()),
  email: v.optional(v.string()),
  discord: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  instagram: v.optional(v.string()),
  twitter: v.optional(v.string()),
  youtube: v.optional(v.string()),
  maintenance: v.optional(
    v.object({
      enabled: v.boolean(),
      title: v.string(),
      message: v.string(),
      eta: v.optional(v.string()),
    }),
  ),
  checkoutFields: v.optional(
    v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        enabled: v.boolean(),
        required: v.boolean(),
      }),
    ),
  ),
  seo: v.optional(
    v.object({
      title: v.string(),
      description: v.string(),
      ogImage: v.optional(v.string()),
      canonical: v.optional(v.string()),
    }),
  ),
});

export const updateStore = mutation({
  args: { patch: storePatch },
  handler: async (ctx, { patch }) => {
    const admin = await requireAdmin(ctx, "settings.manage");
    const store = ((await getSetting(ctx, "store")) as any) ?? DEFAULT_STORE;
    const next = { ...store };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) (next as any)[k] = val;
    }
    await setSetting(ctx, "store", next);
    await logAudit(ctx, admin, "settings.update", "settings", "store", patch);
  },
});

const themeValidator = v.object({
  primary: v.string(),
  primaryForeground: v.string(),
  secondary: v.string(),
  secondaryForeground: v.string(),
  background: v.string(),
  foreground: v.string(),
  card: v.string(),
  border: v.string(),
  radius: v.number(),
  font: v.string(),
  darkMode: v.boolean(),
});

export const updateTheme = mutation({
  args: { theme: themeValidator },
  handler: async (ctx, { theme }) => {
    const admin = await requireAdmin(ctx, "appearance.manage");
    await setSetting(ctx, "theme", theme);
    await logAudit(ctx, admin, "settings.update", "settings", "theme");
  },
});

const sectionValidator = v.object({
  id: v.string(),
  type: v.string(),
  enabled: v.boolean(),
  config: v.any(),
});

export const updateHomepage = mutation({
  args: { sections: v.array(sectionValidator) },
  handler: async (ctx, { sections }) => {
    const admin = await requireAdmin(ctx, "appearance.manage");
    await setSetting(ctx, "homepage", sections);
    await logAudit(ctx, admin, "settings.update", "settings", "homepage");
  },
});

export const updateMenu = mutation({
  args: {
    menu: v.array(
      v.object({
        label: v.string(),
        url: v.string(),
        icon: v.optional(v.string()),
        newTab: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, { menu }) => {
    const admin = await requireAdmin(ctx, "appearance.manage");
    await setSetting(ctx, "menu", menu);
    await logAudit(ctx, admin, "settings.update", "settings", "menu");
  },
});

export const updateFooter = mutation({
  args: {
    footer: v.object({
      about: v.string(),
      copyright: v.string(),
      columns: v.array(
        v.object({
          title: v.string(),
          links: v.array(
            v.object({ label: v.string(), url: v.string() }),
          ),
        }),
      ),
    }),
  },
  handler: async (ctx, { footer }) => {
    const admin = await requireAdmin(ctx, "appearance.manage");
    await setSetting(ctx, "footer", footer);
    await logAudit(ctx, admin, "settings.update", "settings", "footer");
  },
});

export const resetTheme = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx, "appearance.manage");
    await setSetting(ctx, "theme", DEFAULT_THEME);
    await setSetting(ctx, "homepage", DEFAULT_HOMEPAGE);
    await logAudit(ctx, admin, "settings.reset", "settings", "theme");
  },
});

/** Aplica a identidade ApolloCraft + tema dark (executa a migration acima). */
export const applyBrand = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.settings.applyBrandDefaults, {});
  },
});
