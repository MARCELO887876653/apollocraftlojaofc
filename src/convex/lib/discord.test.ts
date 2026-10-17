import { describe, expect, test } from "vitest";
import {
  DISCORD_CALLBACK_PATH,
  discordAuthorizeUrl,
  discordAvatarUrl,
  discordDisplayName,
  discordRedirectUri,
  discordStatus,
  discordUserFields,
  isAllowedRedirectUri,
  isValidClientId,
  normalizeClientId,
  normalizeClientSecret,
} from "./discord";

describe("Client ID / Client Secret do Discord", () => {
  test("aceita snowflake de 17 a 20 dígitos (com espaços ao redor)", () => {
    expect(normalizeClientId(" 1304504761076404225 ")).toBe("1304504761076404225");
    expect(isValidClientId("12345678901234567")).toBe(true);
    expect(isValidClientId("12345678901234567890")).toBe(true);
  });

  test("rejeita o que não é Client ID", () => {
    for (const value of ["", "abc", "123", "1234567890123456", "123456789012345678901", "1234 5678"]) {
      expect(normalizeClientId(value)).toBeNull();
      expect(isValidClientId(value)).toBe(false);
    }
  });

  test("rejeita secret vazio, curto ou com espaço", () => {
    expect(normalizeClientSecret("")).toBeNull();
    expect(normalizeClientSecret("curto")).toBeNull();
    expect(normalizeClientSecret("a".repeat(31) + " x")).toBeNull();
    expect(normalizeClientSecret("  " + "a".repeat(32) + "  ")).toBe("a".repeat(32));
  });
});

describe("redirect_uri", () => {
  test("monta a URL do callback no domínio da loja", () => {
    expect(discordRedirectUri("https://apollocraft.online")).toBe(
      `https://apollocraft.online${DISCORD_CALLBACK_PATH}`,
    );
    expect(discordRedirectUri("https://loja.vly.sh/")).toBe(
      `https://loja.vly.sh${DISCORD_CALLBACK_PATH}`,
    );
  });

  test("só aceita o nosso caminho de callback em https (ou localhost em dev)", () => {
    expect(isAllowedRedirectUri("https://apollocraft.online/auth/discord")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:5173/auth/discord")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:5173/auth/discord")).toBe(true);

    expect(isAllowedRedirectUri("https://apollocraft.online/auth")).toBe(false);
    expect(isAllowedRedirectUri("https://apollocraft.online/auth/discord/extra")).toBe(false);
    expect(isAllowedRedirectUri("http://apollocraft.online/auth/discord")).toBe(false);
    // Qualquer origem em https com o NOSSO caminho passa: quem garante que o
    // domínio foi registrado no app é o próprio Discord, na troca do código.
    expect(isAllowedRedirectUri("https://outra-loja.example/auth/discord")).toBe(true);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("")).toBe(false);
  });
});

describe("URL de autorização", () => {
  test("leva client_id, redirect, escopos, state e PKCE S256", () => {
    const url = new URL(
      discordAuthorizeUrl({
        clientId: "1304504761076404225",
        redirectUri: "https://apollocraft.online/auth/discord",
        state: "abc",
        codeChallenge: "xyz",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("1304504761076404225");
    expect(url.searchParams.get("redirect_uri")).toBe("https://apollocraft.online/auth/discord");
    expect(url.searchParams.get("scope")).toBe("identify email");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("code_challenge")).toBe("xyz");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("perfil do Discord → usuário da loja", () => {
  const base = {
    id: "1304504761076404225",
    username: "apollo",
    global_name: "Apollo Craft",
    avatar: "a_1b2c3", // prefixo a_ = avatar animado (GIF) no Discord
  };

  test("usa o apelido global e monta o avatar da CDN (gif quando animado)", () => {
    expect(discordDisplayName(base)).toBe("Apollo Craft");
    expect(discordAvatarUrl({ ...base, avatar: "abc" })).toBe(
      "https://cdn.discordapp.com/avatars/1304504761076404225/abc.png?size=256",
    );
    expect(discordAvatarUrl(base)).toBe(
      "https://cdn.discordapp.com/avatars/1304504761076404225/a_1b2c3.gif?size=256",
    );
  });

  test("cai para o username quando não há apelido global", () => {
    expect(discordDisplayName({ ...base, global_name: null })).toBe("apollo");
    expect(discordDisplayName({ ...base, global_name: "  " })).toBe("apollo");
    expect(discordDisplayName({})).toBeNull();
  });

  test("só grava e-mail quando o Discord confirma que ele é verificado", () => {
    expect(discordUserFields({ ...base, email: "A@B.com", verified: true })).toEqual({
      name: "Apollo Craft",
      image: "https://cdn.discordapp.com/avatars/1304504761076404225/a_1b2c3.gif?size=256",
      email: "a@b.com",
      emailVerified: true,
    });
    expect(discordUserFields({ ...base, email: "a@b.com", verified: false })).toEqual({
      name: "Apollo Craft",
      image: "https://cdn.discordapp.com/avatars/1304504761076404225/a_1b2c3.gif?size=256",
    });
    expect(discordUserFields({ ...base, email: null, verified: true })).toEqual({
      name: "Apollo Craft",
      image: "https://cdn.discordapp.com/avatars/1304504761076404225/a_1b2c3.gif?size=256",
    });
  });

  test("sem avatar no Discord, deixa nossa foto em paz", () => {
    const fields = discordUserFields({ ...base, avatar: null });
    expect(fields).toEqual({ name: "Apollo Craft" });
    expect("image" in fields!).toBe(false);
  });

  test("sem id não há avatar e sem nome não há perfil", () => {
    expect(discordAvatarUrl({ avatar: "abc" })).toBeUndefined();
    expect(discordUserFields({ id: "12345678901234567" })).toBeNull();
  });
});

describe("estado do login com Discord no painel", () => {
  test("desligado, incompleto e pronto", () => {
    expect(discordStatus({ enabled: false, clientId: "1304504761076404225", hasSecret: true })).toBe("off");
    expect(discordStatus({ enabled: true, clientId: "", hasSecret: false })).toBe("incomplete");
    expect(discordStatus({ enabled: true, clientId: "1304504761076404225", hasSecret: false })).toBe("incomplete");
    expect(discordStatus({ enabled: true, clientId: "abc", hasSecret: true })).toBe("incomplete");
    expect(discordStatus({ enabled: true, clientId: "1304504761076404225", hasSecret: true })).toBe("ready");
  });
});
