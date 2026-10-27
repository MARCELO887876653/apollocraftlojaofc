import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { discordRedirectUri } from "@/convex/lib/discord";
import { useStoreShell } from "@/lib/storefront";
import {
  DISCORD_DEFAULT_RETURN_TO,
  attemptMatchesState,
  clearDiscordAttempt,
  createDiscordAttempt,
  readDiscordAttempt,
  readDiscordCallback,
  saveDiscordAttempt,
} from "@/lib/discord-auth";
import logoMark from "@/assets/logo.svg";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";

type PublicDiscord = { enabled: boolean; clientId: string | null } | undefined;

/**
 * Volta do Discord (`/auth/discord?code=…&state=…`).
 *
 * Troca o código pelo login de verdade: o servidor (provider `discord` do
 * Convex Auth) confere as credenciais salvas no painel, lê o perfil e cria
 * ou vincula a conta da loja. Esta página só cuida do `state`/PKCE e do
 * caminho de volta.
 *
 * Quando o `code` não chega (página reaberta, endereço de retorno diferente do
 * registrado no Discord, sessão do navegador perdida), a tela não é um beco sem
 * saída: ela mostra o endereço que o Discord precisa devolver e oferece o
 * próprio botão para recomeçar o login.
 */
export default function DiscordCallbackPage() {
  const location = useLocation();
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  // Nome e logo vêm do shell da loja (sem consulta extra nesta tela).
  const store = useStoreShell()?.store as { name?: string; logoUrl?: string } | undefined;
  const discord = useQuery(api.discordAuth.getPublicConfig) as PublicDiscord;
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  // Voltou do Discord com parâmetro mas sem código: pode ser um soluço do
  // retorno (app no celular). Nesse caso tentamos o login de novo UMA vez.
  const [retryable, setRetryable] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const autoRetried = useRef(false);
  // StrictMode monta o componente duas vezes em desenvolvimento; o código do
  // Discord só pode ser trocado UMA vez, então a troca roda só na primeira.
  const started = useRef(false);

  const finish = useCallback(async () => {
    // Query + fragmento: o retorno do app do Discord no celular às vezes deixa
    // parte dos parâmetros depois do `#`.
    const callback = readDiscordCallback(location.search + location.hash);
    if (callback.kind !== "code") {
      setMissing(callback.kind === "error" && callback.missing === true);
      setRetryable(callback.kind === "error" && callback.missing !== true);
      setError(callback.message);
      return;
    }

    const attempt = readDiscordAttempt(sessionStorage);
    if (!attempt || !attemptMatchesState(attempt, callback.state)) {
      setError(
        "Esta tentativa de login expirou (ou o navegador perdeu os dados da sessão). Toque em \"Entrar com Discord\" novamente.",
      );
      return;
    }

    try {
      await signIn("discord", {
        code: callback.code,
        redirectUri: discordRedirectUri(window.location.origin),
        codeVerifier: attempt.codeVerifier,
      });
      clearDiscordAttempt(sessionStorage);
      navigate(attempt.returnTo, { replace: true });
    } catch (cause) {
      clearDiscordAttempt(sessionStorage);
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível entrar com o Discord. Tente novamente.",
      );
    }
  }, [navigate, location.search, location.hash, signIn]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void finish();
  }, [finish]);

  // Recomeça o login daqui mesmo, sem obrigar a pessoa a achar a tela de entrada.
  const restart = useCallback(async () => {
    if (!discord?.clientId) return;
    setRestarting(true);
    try {
      const { url, attempt } = await createDiscordAttempt({
        clientId: discord.clientId,
        origin: window.location.origin,
        returnTo: readDiscordAttempt(sessionStorage)?.returnTo ?? DISCORD_DEFAULT_RETURN_TO,
      });
      saveDiscordAttempt(sessionStorage, attempt);
      window.location.assign(url);
    } catch {
      setRestarting(false);
    }
  }, [discord?.clientId]);

  // Uma segunda chance automática: se o Discord voltou com o `state` mas sem o
  // `code`, repetimos o pedido uma vez (o cooldown de 20s evita laço entre as
  // duas idas ao Discord). Se voltar sem código de novo, a tela mostra o
  // diagnóstico com os parâmetros recebidos.
  useEffect(() => {
    if (!retryable || autoRetried.current || !discord?.clientId) return;
    const KEY = "apollo:discord-retry-at";
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 20_000) return;
    autoRetried.current = true;
    sessionStorage.setItem(KEY, String(Date.now()));
    void restart();
  }, [retryable, discord?.clientId, restart]);

  const canRestart = Boolean(discord?.enabled && discord.clientId);
  const redirectUri = discordRedirectUri(window.location.origin);
  const storeName = store?.name ?? "Apollo Craft";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-44 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/25 blur-[130px]" />
        <div className="absolute -bottom-40 -right-24 h-[420px] w-[420px] rounded-full bg-[#5865F2]/20 blur-[130px]" />
      </div>

      <div className="w-full max-w-[420px]">
        <Card className="overflow-hidden border-border/70 bg-card/80 shadow-2xl backdrop-blur-xl">
          <div className="h-1 w-full bg-gradient-to-r from-transparent via-[#5865F2] to-transparent" />
          <CardHeader className="gap-3 text-center">
            <div className="flex justify-center">
              <span className="flex size-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/25">
                {store?.logoUrl ? (
                  <img
                    src={store.logoUrl}
                    alt={storeName}
                    className="size-20 rounded-2xl object-cover"
                  />
                ) : (
                  <img src={logoMark} alt={storeName} className="size-12" />
                )}
              </span>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold tracking-tight">
                {error ? "Não deu para entrar" : "Conectando ao Discord…"}
              </CardTitle>
              <CardDescription className="text-pretty">
                {error
                  ? "Nada foi cobrado e sua conta continua igual."
                  : `Só um instante enquanto confirmamos sua conta na ${storeName}.`}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-4 pb-6">
            {error ? (
              <>
                <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  {error}
                </p>

                {missing && (
                  // Sem código não há como entrar: o navegador abriu este
                  // endereço direto (link salvo, recarregou a página, ou o
                  // Discord devolveu para outro endereço registrado).
                  <div className="w-full rounded-xl border bg-muted/40 p-3 text-left">
                    <p className="text-xs font-semibold">Endereço de retorno esperado</p>
                    <code className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                      {redirectUri}
                    </code>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      Precisa estar registrado, exatamente assim, em Discord Developer Portal →
                      OAuth2 → Redirects.
                    </p>
                  </div>
                )}

                {canRestart && (
                  <Button
                    className="w-full bg-[#5865F2] text-white hover:bg-[#4752c4]"
                    size="lg"
                    onClick={() => void restart()}
                    disabled={restarting}
                  >
                    {restarting ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    {restarting ? "Abrindo o Discord…" : "Entrar com Discord"}
                  </Button>
                )}

                <Button asChild variant={canRestart ? "outline" : "default"} className="w-full" size="lg">
                  <Link to="/auth">
                    <ArrowLeft className="mr-2 size-4" />
                    Voltar para o login
                  </Link>
                </Button>
              </>
            ) : (
              <Loader2 className="size-7 animate-spin text-[#5865F2]" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
