import {
  DISCORD_CALLBACK_PATH,
  discordAuthorizeUrl,
  discordRedirectUri,
} from "@/convex/lib/discord";

/**
 * Parte do navegador do login com Discord.
 *
 * O fluxo é: montar a URL de autorização (com `state` e PKCE S256) → o
 * Discord volta em `/auth/discord?code=…&state=…` → a página de callback
 * chama `signIn("discord", …)`. Aqui ficam as funções puras desse caminho
 * (testadas em src/lib/discord-auth.test.ts); nada aqui fala com o Convex.
 */

export const DISCORD_OAUTH_STORAGE_KEY = "apollo:discord-oauth";
export const DISCORD_CALLBACK_PATH_ = DISCORD_CALLBACK_PATH;
export const DISCORD_DEFAULT_RETURN_TO = "/conta";

/** O que guardamos entre o "Entrar com Discord" e a volta dele. */
export type DiscordAttempt = {
  state: string;
  codeVerifier: string;
  returnTo: string;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** String aleatória em base64url (usada no `state` e no code_verifier). */
export function randomUrlSafeString(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
}

/** `code_challenge` do PKCE (SHA-256 do verifier, em base64url). */
export async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** URL do Discord para onde mandamos o visitante, e o que guardar antes. */
export async function createDiscordAttempt(input: {
  clientId: string;
  origin: string;
  returnTo?: string;
}): Promise<{ url: string; attempt: DiscordAttempt; redirectUri: string }> {
  const state = randomUrlSafeString(16);
  const codeVerifier = randomUrlSafeString(32);
  const redirectUri = discordRedirectUri(input.origin);
  const attempt: DiscordAttempt = {
    state,
    codeVerifier,
    returnTo: safeReturnTo(input.returnTo),
  };
  const url = discordAuthorizeUrl({
    clientId: input.clientId,
    redirectUri,
    state,
    codeChallenge: await codeChallengeFor(codeVerifier),
  });
  return { url, attempt, redirectUri };
}

/** Só aceitamos caminhos internos como destino pós-login. */
export function safeReturnTo(returnTo: string | null | undefined, fallback = DISCORD_DEFAULT_RETURN_TO): string {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

// ─── Guarda o "state" no navegador (sessionStorage) ───

export function saveDiscordAttempt(storage: Storage, attempt: DiscordAttempt) {
  storage.setItem(DISCORD_OAUTH_STORAGE_KEY, JSON.stringify(attempt));
}

export function readDiscordAttempt(storage: Storage): DiscordAttempt | null {
  const raw = storage.getItem(DISCORD_OAUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DiscordAttempt>;
    if (!parsed.state || !parsed.codeVerifier) return null;
    return {
      state: parsed.state,
      codeVerifier: parsed.codeVerifier,
      returnTo: safeReturnTo(parsed.returnTo),
    };
  } catch {
    return null;
  }
}

export function clearDiscordAttempt(storage: Storage) {
  storage.removeItem(DISCORD_OAUTH_STORAGE_KEY);
}

// ─── Volta do Discord ───

export type DiscordCallback =
  | { kind: "code"; code: string; state: string | null }
  | { kind: "cancelled"; message: string }
  | { kind: "error"; message: string };

/** Traduz a query string devolvida pelo Discord (sempre em pt-BR). */
export function readDiscordCallback(search: string): DiscordCallback {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const error = params.get("error");
  if (error) {
    if (error === "access_denied") {
      return { kind: "cancelled", message: "Você cancelou o login com Discord." };
    }
    const description = params.get("error_description");
    return {
      kind: "error",
      message: `O Discord recusou o acesso (${error})${description ? `: ${description}` : "."}`,
    };
  }
  const code = params.get("code");
  if (!code) {
    return {
      kind: "error",
      message: "O Discord não devolveu o código de acesso. Toque em \"Entrar com Discord\" novamente.",
    };
  }
  return { kind: "code", code, state: params.get("state") };
}

/**
 * O `state` que voltou do Discord tem que ser o mesmo que guardamos — é isso
 * que impede alguém de forçar um login com um código que não é desta sessão.
 */
export function attemptMatchesState(attempt: DiscordAttempt | null, state: string | null): boolean {
  return Boolean(attempt && state && attempt.state === state);
}
