import { useState } from "react";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { friendlyErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, CheckCircle2, Clock, Loader2, Mail, ShoppingBag, Wrench,
} from "lucide-react";

type MaintenanceStore = {
  name?: string;
  description?: string;
  logoUrl?: string;
  maintenance?: { enabled: boolean; title: string; message: string; eta?: string };
};

/**
 * Loja fechada para manutenção: ninguém navega nem compra, mas o cliente pode
 * deixar o e-mail para ser avisado quando a loja voltar.
 *
 * `preview` é verdadeiro quando quem está vendo é a equipe com `?cliente=1` —
 * é a forma de o dono conferir exatamente o que o cliente vê. Nesse caso
 * mostramos a saída da pré-visualização.
 */
export function MaintenanceGate({
  store,
  preview,
  exitHref,
}: {
  store?: MaintenanceStore;
  preview?: boolean;
  exitHref?: string;
}) {
  const subscribe = useMutation(api.maintenance.subscribe);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeName = store?.name ?? "Apollo Craft";
  const title = store?.maintenance?.title?.trim() || "Estamos em manutenção";
  const message =
    store?.maintenance?.message?.trim() ||
    "Estamos fazendo alguns ajustes por aqui. Voltamos em breve!";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await subscribe({ email });
      setDone(true);
      setEmail("");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Não foi possível salvar seu e-mail. Tente novamente."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-14 text-foreground">
      {/* brilho de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-[120px]"
      />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-xl"
      >
        <div className="rounded-3xl border bg-card/80 p-7 shadow-[0_30px_80px_rgb(0,0,0,0.45)] backdrop-blur-xl sm:p-10">
          <div className="flex flex-col items-center text-center">
            {store?.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={storeName}
                className="size-20 rounded-2xl object-cover shadow-lg shadow-sky-500/20 ring-1 ring-sky-500/25"
              />
            ) : (
              <span className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/25">
                <ShoppingBag className="size-9 text-sky-950" />
              </span>
            )}

            <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
              <Wrench className="size-3.5" />
              Loja em manutenção
            </span>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {message}
            </p>

            {store?.maintenance?.eta ? (
              <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3.5 py-1.5 text-sm font-bold text-sky-400">
                <Clock className="size-4" />
                Previsão de retorno: {store.maintenance.eta}
              </span>
            ) : null}

            <p className="mt-5 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Durante a manutenção a loja está fechada: o catálogo, o carrinho e o checkout
              ficam indisponíveis e nenhum pedido novo é aceito.
            </p>
          </div>

          <div className="mt-7 border-t pt-7">
            {done ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center"
              >
                <CheckCircle2 className="size-9 text-emerald-400" />
                <p className="mt-3 text-base font-bold">Prontinho, avisamos você!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assim que a {storeName} voltar, enviamos um e-mail contando que já pode comprar.
                </p>
                <Button
                  variant="outline"
                  className="mt-5 h-11 rounded-xl border-border bg-card px-5 text-sm font-bold"
                  onClick={() => setDone(false)}
                >
                  Cadastrar outro e-mail
                </Button>
              </motion.div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-sky-400" />
                  <p className="text-base font-bold">Receber aviso no e-mail quando voltar</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Deixe seu e-mail abaixo e avisamos você no instante em que a loja reabrir.
                </p>
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="h-12 flex-1 rounded-2xl border-border bg-muted/40 px-5 text-base placeholder:text-muted-foreground"
                  />
                  <Button
                    type="submit"
                    disabled={sending || email.trim().length === 0}
                    className="h-12 rounded-2xl bg-white px-6 text-base font-bold text-zinc-950 hover:bg-zinc-200"
                  >
                    {sending ? (
                      <><Loader2 className="mr-2 size-4 animate-spin" /> Salvando...</>
                    ) : (
                      "Avisar-me"
                    )}
                  </Button>
                </div>
                {error ? (
                  <p className="text-sm font-medium text-red-400">{error}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Usamos seu e-mail apenas para este aviso. Nada de spam.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {storeName} — a loja reabre assim que a manutenção terminar.
        </p>

        {preview && (
          <p className="mt-3 text-center">
            <Link
              to={exitHref ?? "/"}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Sair da visão de cliente (voltar à equipe)
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}
