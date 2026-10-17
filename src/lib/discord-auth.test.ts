import { describe, expect, test } from "vitest";
import {
  DISCORD_OAUTH_STORAGE_KEY,
  attemptMatchesState,
  clearDiscordAttempt,
  codeChallengeFor,
  createDiscordAttempt,
  randomUrlSafeString,
  readDiscordAttempt,
  readDiscordCallback,
  safeReturnTo,
  saveDiscordAttempt,
  type DiscordAttempt,
} from "./discord-auth";

/** sessionStorage falso, só com o que usamos. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("PKCE", () => {
  test("gera strings aleatórias url-safe e diferentes entre si", () => {
    const a = randomUrlSafeString(16);
    const b = randomUrlSafeString(16);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });

  test("code_challenge é o SHA-256 em base64url (vetor da RFC 7636)", async () => {
    await expect(codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("início do login", () => {
  test("monta a URL do Discord e o que guardar", async () => {
    const { url, attempt, redirectUri } = await createDiscordAttempt({
      clientId: "1304504761076404225",
      origin: "https://apollocraft.online",
      returnTo: "/conta",
    });
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://discord.com");
    expect(parsed.pathname).toBe("/oauth2/authorize");
    expect(redirectUri).toBe("https://apollocraft.online/auth/discord");
    expect(parsed.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(parsed.searchParams.get("client_id")).toBe("1304504761076404225");
    expect(parsed.searchParams.get("state")).toBe(attempt.state);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    // O challenge enviado tem que corresponder ao verifier que guardamos.
    expect(parsed.searchParams.get("code_challenge")).toBe(
      await codeChallengeFor(attempt.codeVerifier),
    );
    expect(attempt.returnTo).toBe("/conta");
  });

  test("destino pós-login só aceita caminho interno", async () => {
    expect(safeReturnTo("/painel")).toBe("/painel");
    expect(safeReturnTo("//atacante.example")).toBe("/conta");
    expect(safeReturnTo("https://atacante.example")).toBe("/conta");
    expect(safeReturnTo(null)).toBe("/conta");
    expect(safeReturnTo(undefined, "/painel")).toBe("/painel");

    const { attempt } = await createDiscordAttempt({
      clientId: "1304504761076404225",
      origin: "https://apollocraft.online",
      returnTo: "https://atacante.example",
    });
    expect(attempt.returnTo).toBe("/conta");
  });
});

describe("tentativa guardada no navegador", () => {
  const attempt: DiscordAttempt = { state: "s1", codeVerifier: "v1", returnTo: "/conta" };

  test("guarda, lê e limpa", () => {
    const storage = fakeStorage();
    saveDiscordAttempt(storage, attempt);
    expect(storage.getItem(DISCORD_OAUTH_STORAGE_KEY)).toBeTruthy();
    expect(readDiscordAttempt(storage)).toEqual(attempt);

    clearDiscordAttempt(storage);
    expect(readDiscordAttempt(storage)).toBeNull();
  });

  test("ignora lixo em vez de quebrar a página", () => {
    const storage = fakeStorage();
    storage.setItem(DISCORD_OAUTH_STORAGE_KEY, "não é json");
    expect(readDiscordAttempt(storage)).toBeNull();

    storage.setItem(DISCORD_OAUTH_STORAGE_KEY, JSON.stringify({ state: "s1" }));
    expect(readDiscordAttempt(storage)).toBeNull();
  });

  test("só aceita o callback com o mesmo state", () => {
    expect(attemptMatchesState(attempt, "s1")).toBe(true);
    expect(attemptMatchesState(attempt, "outro")).toBe(false);
    expect(attemptMatchesState(attempt, null)).toBe(false);
    expect(attemptMatchesState(null, "s1")).toBe(false);
  });
});

describe("volta do Discord", () => {
  test("lê o código e o state", () => {
    expect(readDiscordCallback("?code=abc&state=s1")).toEqual({
      kind: "code",
      code: "abc",
      state: "s1",
    });
  });

  test("cancelar no Discord vira mensagem amigável", () => {
    expect(readDiscordCallback("?error=access_denied")).toEqual({
      kind: "cancelled",
      message: "Você cancelou o login com Discord.",
    });
  });

  test("outros erros mostram o motivo", () => {
    const result = readDiscordCallback("?error=invalid_scope&error_description=Escopo%20inv%C3%A1lido");
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toContain("invalid_scope");
    expect(result.kind === "error" && result.message).toContain("Escopo inválido");
  });

  test("sem código é erro (o Discord não devolveu nada)", () => {
    const result = readDiscordCallback("");
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toContain("código de acesso");
  });
});
