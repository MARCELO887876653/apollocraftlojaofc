// ─────────────────────────────────────────────────────────────
// Login com Discord (OAuth2) — regras puras
//
// Este arquivo é a única fonte da verdade sobre "o que é um Client ID
// válido", "qual redirect_uri aceitamos" e "que dados do Discord viram
// perfil do usuário". Ele é usado pelo provider do Convex Auth, pela tela de
// login, pelo callback e pela aba Discord do painel — e é testado direto
// (src/convex/lib/discord.test.ts), sem rede e sem banco.
// ─────────────────────────────────────────────────────────────

export const DISCORD_API = "https://discord.com/api/v10";
/** Endpoint onde o cliente é mandado para autorizar a loja. */
export const DISCORD_AUTHORIZE_ENDPOINT = "https://discord.com/oauth2/authorize";
/** `identify` traz id/nome/avatar; `email` traz o e-mail (quando ele autoriza). */
export const DISCORD_SCOPE = "identify email";
/** Caminho da loja que recebe o `code` do Discord. */
export const DISCORD_CALLBACK_PATH = "/auth/discord";
/** Tamanho máximo do avatar enviado pelo cliente. */
export const AVATAR_MAX_MB = 5;

/** Dados que o Discord devolve em `/users/@me`. */
export type DiscordProfile = {
  id?: string;
  username?: string;
  global_name?: string | null;
  email?: string | null;
  verified?: boolean;
  avatar?: string | null;
  /** Hash do avatar na CDN, usado no endpoint `/users/@me`. */
  discriminator?: string;
};

/** Perfil já pronto para gravar na tabela `users`. */
export type DiscordUserFields = {
  name: string;
  image?: string;
  email?: string;
  emailVerified?: boolean;
};

/**
 * O Client ID do Discord é um "snowflake": sempre 17 a 20 dígitos.
 * Devolve o valor limpo ou `null` se não parecer um Client ID.
 */
export function normalizeClientId(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, "");
  if (!/^\d{17,20}$/.test(value)) return null;
  return value;
}

export function isValidClientId(raw: string): boolean {
  return normalizeClientId(raw) !== null;
}

/**
 * O Client Secret é gerado pelo Discord (hoje 32 caracteres). Não existe
 * formato público garantido, então só rejeitamos o que claramente está
 * errado/truncado colado — evitando salvar um valor incompleto.
 */
export function normalizeClientSecret(raw: string): string | null {
  const value = raw.trim();
  if (value.length < 20 || /\s/.test(value)) return null;
  return value;
}

/**
 * Só aceitamos o retorno do Discord no nosso próprio caminho de callback
 * (`/auth/discord`), em https — ou http em desenvolvimento local. Assim um
 * cliente malicioso não consegue usar a loja para trocar código em outra URL.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.pathname !== DISCORD_CALLBACK_PATH) return false;
  if (url.protocol === "https:") return true;
  const localhost = ["localhost", "127.0.0.1", "[::1]"];
  return url.protocol === "http:" && localhost.includes(url.hostname);
}

/** URL que o admin deve registrar no Discord Developer Portal. */
export function discordRedirectUri(origin: string): string {
  return `${origin.trim().replace(/\/+$/, "")}${DISCORD_CALLBACK_PATH}`;
}

/** Monta a URL de autorização (com state + PKCE). */
export function discordAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(DISCORD_AUTHORIZE_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", DISCORD_SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

/** Avatar do usuário na CDN do Discord (256px, mesmo tamanho do painel). */
export function discordAvatarUrl(profile: DiscordProfile): string | undefined {
  if (!profile.id) return undefined;
  // Sem hash o Discord mostra só a "letra" — nesse caso usamos a nossa.
  if (!profile.avatar) return undefined;
  const ext = profile.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${ext}?size=256`;
}

/** Nome de exibição: apelido global (novo) → username → nada. */
export function discordDisplayName(profile: DiscordProfile): string | null {
  // Apelido global primeiro; se vier vazio (ou só espaços), cai para o username.
  for (const candidate of [profile.global_name, profile.username]) {
    const name = (candidate ?? "").trim().replace(/\s+/g, " ");
    if (name) return name.slice(0, 60);
  }
  return null;
}

/**
 * Converte o perfil do Discord no que gravamos em `users`.
 * O e-mail só entra quando o Discord confirma que ele é verificado — é o que
 * permite vincular a conta do Discord à conta de e-mail já existente na loja.
 */
export function discordUserFields(profile: DiscordProfile): DiscordUserFields | null {
  const name = discordDisplayName(profile);
  if (!name) return null;
  const email = profile.email?.trim().toLowerCase();
  const verified = profile.verified === true;
  const fields: DiscordUserFields = { name };
  const image = discordAvatarUrl(profile);
  if (image) fields.image = image;
  if (email && verified) {
    fields.email = email;
    fields.emailVerified = true;
  }
  return fields;
}

/** Estado do login com Discord mostrado no painel e na tela de entrada. */
export type DiscordStatus = "off" | "incomplete" | "ready";

export function discordStatus(config: {
  enabled?: boolean;
  clientId?: string;
  hasSecret?: boolean;
}): DiscordStatus {
  const id = config.clientId ? normalizeClientId(config.clientId) : null;
  if (!config.enabled) return "off";
  return id && config.hasSecret ? "ready" : "incomplete";
}
