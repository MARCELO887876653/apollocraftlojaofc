import { action, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { requireAdmin, logAudit } from "./lib/admin";
import { getSetting, setSetting } from "./lib/data";
import {
  DISCORD_API,
  discordStatus,
  normalizeClientId,
  normalizeClientSecret,
  type DiscordStatus,
} from "./lib/discord";

// ─────────────────────────────────────────────────────────────
// Login com Discord — configuração pelo painel (aba Discord)
//
// As credenciais ficam no banco (settings → "discord_auth"), e não em
// variáveis de ambiente: assim o dono da loja configura tudo pelo painel,
// sem CLI nem deploy. O segredo NUNCA é devolvido para o navegador — as
// consultas do painel só informam se ele existe (`hasSecret`).
// ─────────────────────────────────────────────────────────────

const KEY = "discord_auth";

type DiscordAuthConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  updatedAt?: number;
};

async function readConfig(ctx: Parameters<typeof getSetting>[0]): Promise<DiscordAuthConfig> {
  const stored = await getSetting<Partial<DiscordAuthConfig>>(ctx, KEY);
  return {
    enabled: Boolean(stored?.enabled),
    clientId: stored?.clientId ?? "",
    clientSecret: stored?.clientSecret ?? "",
    updatedAt: stored?.updatedAt,
  };
}

function publicView(config: DiscordAuthConfig) {
  const status: DiscordStatus = discordStatus({
    enabled: config.enabled,
    clientId: config.clientId,
    hasSecret: Boolean(config.clientSecret),
  });
  return {
    enabled: status === "ready",
    clientId: status === "ready" ? config.clientId : null,
  };
}

/**
 * Usada pela tela de login: só diz se o botão "Entrar com Discord" deve
 * aparecer e qual Client ID usar na URL de autorização. Público de propósito —
 * o Client ID é informação pública (vai na URL) e o segredo fica no servidor.
 */
export const getPublicConfig = query({
  args: {},
  handler: async (ctx) => {
    return publicView(await readConfig(ctx));
  },
});

/** Configuração para a aba Discord do painel (nunca devolve o segredo). */
export const adminGet = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "settings.manage");
    const config = await readConfig(ctx);
    return {
      enabled: config.enabled,
      clientId: config.clientId,
      hasSecret: Boolean(config.clientSecret),
      status: discordStatus({
        enabled: config.enabled,
        clientId: config.clientId,
        hasSecret: Boolean(config.clientSecret),
      }),
      updatedAt: config.updatedAt ?? null,
    };
  },
});

export const adminSave = mutation({
  args: {
    enabled: v.boolean(),
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
  },
  handler: async (ctx, { enabled, clientId, clientSecret }) => {
    const admin = await requireAdmin(ctx, "settings.manage");
    const current = await readConfig(ctx);

    let nextClientId = current.clientId;
    if (clientId !== undefined && clientId.trim() !== "") {
      const normalized = normalizeClientId(clientId);
      if (!normalized) {
        throw new Error(
          "Client ID inválido. Copie o número de 17 a 20 dígitos em Discord Developer Portal → OAuth2 → General.",
        );
      }
      nextClientId = normalized;
    }

    // Campo em branco mantém o segredo já salvo (igual às outras integrações).
    let nextSecret = current.clientSecret;
    if (clientSecret !== undefined && clientSecret.trim() !== "") {
      const normalized = normalizeClientSecret(clientSecret);
      if (!normalized) {
        throw new Error(
          "Client Secret inválido. Use o valor de 32 caracteres em OAuth2 → General → Reset Secret (sem espaços).",
        );
      }
      nextSecret = normalized;
    }

    if (enabled && (!nextClientId || !nextSecret)) {
      throw new Error(
        "Para ativar o login com Discord, informe o Client ID e o Client Secret do seu aplicativo.",
      );
    }

    await setSetting(ctx, KEY, {
      enabled,
      clientId: nextClientId,
      clientSecret: nextSecret,
      updatedAt: Date.now(),
    } satisfies DiscordAuthConfig);

    await logAudit(ctx, admin, "settings.discord", "settings", KEY, {
      enabled,
      clientId: nextClientId,
    });

    return {
      enabled,
      clientId: nextClientId,
      hasSecret: Boolean(nextSecret),
      status: discordStatus({ enabled, clientId: nextClientId, hasSecret: Boolean(nextSecret) }),
    };
  },
});

/** Apaga as credenciais e desliga o login com Discord. */
export const adminClear = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx, "settings.manage");
    await setSetting(ctx, KEY, {
      enabled: false,
      clientId: "",
      clientSecret: "",
      updatedAt: Date.now(),
    } satisfies DiscordAuthConfig);
    await logAudit(ctx, admin, "settings.discord.clear", "settings", KEY);
  },
});

/** Credenciais completas — só para o servidor (provider do Convex Auth). */
export const internalCredentials = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await readConfig(ctx);
    return {
      enabled: config.enabled,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    };
  },
});

/**
 * Usuário já existente com este e-mail verificado (login por código de
 * e-mail). Usamos para NÃO sobrescrever nome/foto de quem já é cliente da
 * loja quando ele entra pelo Discord pela primeira vez.
 */
export const internalUserIdByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
      .take(2);
    return users.length === 1 ? users[0]._id : null;
  },
});

/** Valida o par Client ID/Secret perguntando ao próprio Discord. */
export const testCredentials = action({
  args: {},
  handler: async (ctx) => {
    // O ctx de action não tem banco: a checagem de admin vem pela query.
    await ctx.runQuery(api.discordAuth.adminGet, {});
    const config: DiscordAuthConfig = await ctx.runQuery(
      internal.discordAuth.internalCredentials,
      {},
    );
    if (!config.clientId || !config.clientSecret) {
      return { ok: false, message: "Informe o Client ID e o Client Secret antes de testar." };
    }

    try {
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: "client_credentials",
          scope: "identify",
        }).toString(),
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text();
        return {
          ok: false,
          message: `O Discord recusou estas credenciais (HTTP ${tokenRes.status}). ${
            detail.includes("invalid_client")
              ? "Client ID ou Client Secret incorretos."
              : detail.slice(0, 200)
          }`,
        };
      }
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) {
        return { ok: false, message: "O Discord não devolveu o token de acesso." };
      }

      const meRes = await fetch(`${DISCORD_API}/oauth2/@me`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!meRes.ok) {
        return { ok: false, message: `Credenciais válidas, mas o Discord devolveu HTTP ${meRes.status} ao ler o aplicativo.` };
      }
      const me = (await meRes.json()) as { application?: { name?: string; id?: string } };
      return {
        ok: true,
        // Aviso explícito: este teste NÃO valida o endereço de retorno — foi
        // exatamente o que fez "Testar credenciais" passar com o login quebrado.
        message: `Credenciais válidas${me.application?.name ? ` — aplicativo "${me.application.name}"` : ""}. O login ainda depende do endereço de retorno registrado em OAuth2 → Redirects.`,
        application: me.application?.name ?? null,
        applicationId: me.application?.id ?? null,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Não foi possível falar com o Discord: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
});
