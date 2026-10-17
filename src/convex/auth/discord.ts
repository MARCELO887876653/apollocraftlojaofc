import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { GenericActionCtxWithAuthConfig } from "@convex-dev/auth/server";
import { createAccount, retrieveAccount } from "@convex-dev/auth/server";
import type { GenericDataModel } from "convex/server";
import type { Value } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import {
  DISCORD_API,
  discordUserFields,
  isAllowedRedirectUri,
  type DiscordProfile,
  type DiscordUserFields,
} from "../lib/discord";

// ─────────────────────────────────────────────────────────────
// Provider "discord" do Convex Auth
//
// O Convex Auth não traz um provider pronto de Discord e os providers OAuth
// dele leem as credenciais de variáveis de ambiente — o que impediria
// configurar tudo pelo painel. Então o fluxo OAuth é feito aqui, com
// `ConvexCredentials`:
//
//   1. a loja manda o cliente para o Discord (authorization code + PKCE);
//   2. o Discord devolve o `code` em /auth/discord;
//   3. o cliente chama `signIn("discord", { code, redirectUri, codeVerifier })`;
//   4. este `authorize` troca o código pelo token usando as credenciais
//      salvas no banco, lê o perfil e cria/vincula o usuário.
//
// O Client Secret nunca sai do servidor.
// ─────────────────────────────────────────────────────────────

type DiscordAuthorize = (
  credentials: Partial<Record<string, Value | undefined>>,
  ctx: GenericActionCtxWithAuthConfig<GenericDataModel>,
) => Promise<{ userId: Id<"users"> } | null>;

const authorize: DiscordAuthorize = async (credentials, ctx) => {
  const code = typeof credentials.code === "string" ? credentials.code : "";
  const redirectUri = typeof credentials.redirectUri === "string" ? credentials.redirectUri : "";
  const codeVerifier =
    typeof credentials.codeVerifier === "string" ? credentials.codeVerifier : undefined;
  if (!code || !redirectUri) return null;
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new Error("Endereço de retorno do Discord inválido.");
  }

  const config: { enabled: boolean; clientId: string; clientSecret: string } = await ctx.runQuery(
    internal.discordAuth.internalCredentials,
    {},
  );
  if (!config.enabled || !config.clientId || !config.clientSecret) {
    throw new Error("O login com Discord não está ativo nesta loja.");
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  if (codeVerifier) body.set("code_verifier", codeVerifier);

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!tokenRes.ok) {
    // O código dura segundos e só pode ser usado uma vez: recarregar a página
    // do callback cai aqui. A mensagem orienta a tentar de novo.
    throw new Error(
      "O Discord não confirmou este acesso (o código expira em segundos). Toque em \"Entrar com Discord\" novamente.",
    );
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("O Discord não devolveu o token de acesso.");

  const meRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    throw new Error(`Não foi possível ler seu perfil do Discord (HTTP ${meRes.status}).`);
  }
  const profile = (await meRes.json()) as DiscordProfile;
  const fields = discordUserFields(profile);
  if (!profile.id || !fields) {
    throw new Error("Não foi possível identificar sua conta do Discord.");
  }

  // Já entrou antes? Reaproveita o mesmo usuário (e mantém pedidos/histórico).
  try {
    const existing = await retrieveAccount(ctx, {
      provider: "discord",
      account: { id: profile.id },
    });
    return { userId: existing.user._id };
  } catch {
    // Primeira vez com esta conta do Discord: cria agora.
  }

  // Quem já é cliente (mesmo e-mail verificado) é vinculado em vez de ganhar
  // uma conta nova — e aí NÃO sobrescrevemos o nome nem a foto que a pessoa
  // escolheu na loja.
  const existingUserId: Id<"users"> | null = fields.email
    ? await ctx.runQuery(internal.discordAuth.internalUserIdByEmail, { email: fields.email })
    : null;
  const accountProfile: Partial<DiscordUserFields> = existingUserId
    ? { email: fields.email, emailVerified: true }
    : fields;

  const created = await createAccount(ctx, {
    provider: "discord",
    account: { id: profile.id },
    profile: accountProfile,
    shouldLinkViaEmail: fields.emailVerified === true,
  });
  return { userId: created.user._id };
};

export const discord = ConvexCredentials({ id: "discord", authorize });
