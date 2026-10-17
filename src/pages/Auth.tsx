import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { createDiscordAttempt, saveDiscordAttempt } from "@/lib/discord-auth";
import logoMark from "@/assets/logo.svg";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

const RESEND_SECONDS = 60;

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type StoreBrand = { name?: string; logoUrl?: string };

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  // Logo enviado pela loja (Configurações → Loja). Enquanto ele não chega,
  // mostramos a marca Apollo embutida no projeto.
  const store = useQuery(api.settings.getStore) as StoreBrand | undefined;
  // O botão do Discord só aparece quando o dono da loja liga a integração
  // (Painel → Discord). `clientId` é público: vai na URL de autorização.
  const discord = useQuery(api.discordAuth.getPublicConfig) as
    | { enabled: boolean; clientId: string | null }
    | undefined;
  const [discordLoading, setDiscordLoading] = useState(false);
  const storeName = store?.name ?? "Apollo Craft";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  // Contagem regressiva para liberar o botão de reenvio do código.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "").trim();
      await signIn("email-otp", formData);
      setStep({ email });
      setOtp("");
      setResendIn(RESEND_SECONDS);
      setNotice("Código enviado! Você pode conferir sua caixa de entrada.");
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o código. Tente novamente.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("O código informado está incorreto ou expirou. Confira e tente novamente.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleResend = async () => {
    if (typeof step === "string" || resendIn > 0 || isResending) return;
    setIsResending(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("email", step.email);
      await signIn("email-otp", formData);
      setOtp("");
      setResendIn(RESEND_SECONDS);
      setNotice("Enviamos um novo código para o seu e-mail.");
    } catch (error) {
      console.error("Resend OTP error:", error);
      setError("Não foi possível reenviar o código agora. Tente novamente.");
    } finally {
      setIsResending(false);
    }
  };

  const handleDiscordLogin = async () => {
    if (!discord?.clientId) return;
    setIsLoading(true);
    setDiscordLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { url, attempt } = await createDiscordAttempt({
        clientId: discord.clientId,
        origin: window.location.origin,
        returnTo: redirect,
      });
      // O `state`/PKCE ficam na sessão do navegador até a volta do Discord.
      saveDiscordAttempt(sessionStorage, attempt);
      window.location.assign(url);
    } catch (cause) {
      console.error("Discord sign-in error:", cause);
      setError("Não foi possível iniciar o login com Discord. Tente novamente.");
      setIsLoading(false);
      setDiscordLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Não foi possível entrar como visitante: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`,
      );
      setIsLoading(false);
    }
  };

  const goBackToEmail = () => {
    setStep("signIn");
    setOtp("");
    setError(null);
    setNotice(null);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Luz de fundo no tom da marca */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-44 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/25 blur-[130px]" />
        <div className="absolute -bottom-40 -right-24 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[130px]" />
      </div>

      <div className="w-full max-w-[420px]">
        <Card className="overflow-hidden border-border/70 bg-card/80 shadow-2xl backdrop-blur-xl">
          <div className="h-1 w-full bg-gradient-to-r from-transparent via-primary to-transparent" />

          {step === "signIn" ? (
            <>
              <CardHeader className="gap-3 text-center">
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    title="Ir para a loja"
                    className="group mt-2 rounded-2xl outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {store?.logoUrl ? (
                      <img
                        src={store.logoUrl}
                        alt={storeName}
                        width={80}
                        height={80}
                        className="h-20 w-20 rounded-2xl object-cover shadow-lg shadow-primary/20 ring-1 ring-primary/25"
                      />
                    ) : (
                      <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/25">
                        <img
                          src={logoMark}
                          alt={storeName}
                          width={52}
                          height={52}
                          className="h-12 w-12"
                        />
                      </span>
                    )}
                  </button>
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-bold tracking-tight">
                    Acessar a {storeName}
                  </CardTitle>
                  <CardDescription className="text-pretty">
                    {discord?.enabled
                      ? "Entre com o Discord em um toque ou receba um código de acesso no seu e-mail."
                      : "Informe seu e-mail para receber um código de acesso. Sem senha, rápido e seguro."}
                  </CardDescription>
                </div>
              </CardHeader>
              <form onSubmit={handleEmailSubmit}>
                <CardContent className="space-y-4 pb-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      name="email"
                      placeholder="seu@email.com"
                      type="email"
                      autoComplete="email"
                      className="h-11 pl-9"
                      disabled={isLoading}
                      required
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando código...
                      </>
                    ) : (
                      <>
                        Enviar código de acesso
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">
                        ou
                      </span>
                    </div>
                  </div>

                  {discord?.enabled && discord.clientId && (
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      className="w-full border-[#5865F2]/40 bg-[#5865F2]/10 font-semibold text-foreground hover:bg-[#5865F2]/20 hover:text-foreground"
                      onClick={() => void handleDiscordLogin()}
                      disabled={isLoading}
                    >
                      {discordLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <DiscordIcon className="mr-2 h-4 w-4 text-[#5865F2]" />
                      )}
                      Entrar com Discord
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={handleGuestLogin}
                    disabled={isLoading}
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    Continuar como visitante
                  </Button>
                </CardContent>
              </form>
            </>
          ) : (
            <>
              <CardHeader className="gap-3 pb-2 text-center">
                <div className="flex justify-center">
                  <div className="neon-glow flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <MailCheck className="h-7 w-7" />
                  </div>
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-xl font-bold tracking-tight">
                    Verifique seu e-mail
                  </CardTitle>
                  <CardDescription className="text-pretty">
                    Enviamos um código de 6 dígitos para{" "}
                    <span className="font-medium text-foreground">
                      {step.email}
                    </span>
                    .
                  </CardDescription>
                </div>
              </CardHeader>

              <form onSubmit={handleOtpSubmit}>
                <CardContent className="space-y-4 pb-2">
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />

                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                          const form = (e.target as HTMLElement).closest("form");
                          if (form) form.requestSubmit();
                        }
                      }}
                    >
                      <InputOTPGroup className="gap-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot
                            key={index}
                            index={index}
                            className="h-12 w-11 rounded-lg border text-lg font-semibold"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <p className="flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    O e-mail normalmente chega em até 1 minuto. Confira também a
                    caixa de spam ou lixo eletrônico.
                  </p>

                  {notice && (
                    <p className="flex items-center justify-center gap-1.5 text-center text-sm text-emerald-500">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {notice}
                    </p>
                  )}

                  {error && (
                    <p className="text-center text-sm text-destructive">
                      {error}
                    </p>
                  )}
                </CardContent>

                <CardFooter className="flex-col gap-3">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      <>
                        Verificar e entrar
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <div className="flex w-full items-center justify-between text-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 text-muted-foreground"
                      onClick={goBackToEmail}
                      disabled={isLoading || isResending}
                    >
                      <ArrowLeft className="mr-1.5 h-4 w-4" />
                      Trocar e-mail
                    </Button>

                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="px-0"
                      onClick={handleResend}
                      disabled={isLoading || isResending || resendIn > 0}
                    >
                      <RefreshCw
                        className={`mr-1.5 h-3.5 w-3.5 ${
                          isResending ? "animate-spin" : ""
                        }`}
                      />
                      {resendIn > 0
                        ? `Reenviar em ${resendIn}s`
                        : "Reenviar código"}
                    </Button>
                  </div>
                </CardFooter>
              </form>
            </>
          )}

          <div className="border-t bg-muted/40 px-6 py-4 text-center text-xs text-muted-foreground">
            Protegido por{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-primary"
            >
              freebuff.com
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
