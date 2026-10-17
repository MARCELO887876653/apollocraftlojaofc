import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { discordRedirectUri } from "@/convex/lib/discord";
import {
  attemptMatchesState,
  clearDiscordAttempt,
  readDiscordAttempt,
  readDiscordCallback,
} from "@/lib/discord-auth";
import logoMark from "@/assets/logo.svg";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";

/**
 * Volta do Discord (`/auth/discord?code=…&state=…`).
 *
 * Troca o código pelo login de verdade: o servidor (provider `discord` do
 * Convex Auth) confere as credenciais salvas no painel, lê o perfil e cria
 * ou vincula a conta da loja. Esta página só cuida do `state`/PKCE e do
 * caminho de volta.
 */
export default function DiscordCallbackPage() {
  const [searchParams] = useSearchParams();
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const store = useQuery(api.settings.getStore) as { name?: string; logoUrl?: string } | undefined;
  const [error, setError] = useState<string | null>(null);
  // StrictMode monta o componente duas vezes em desenvolvimento; o código do
  // Discord só pode ser trocado UMA vez, então a troca roda só na primeira.
  const started = useRef(false);

  const finish = useCallback(async () => {
    const callback = readDiscordCallback(searchParams.toString());
    if (callback.kind !== "code") {
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
  }, [navigate, searchParams, signIn]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void finish();
  }, [finish]);

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
                <Button asChild className="w-full" size="lg">
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
