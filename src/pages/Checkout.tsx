import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/use-auth";
import { formatBRL } from "@/lib/format";
import { friendlyErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, ShoppingBag, ChevronRight, Lock, Zap, Plus, Minus, X, Ticket } from "lucide-react";

type Store = { name: string; checkoutFields: Array<{ key: string; label: string; enabled: boolean; required: boolean }> };

export default function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const store = useQuery(api.settings.getStore) as Store | undefined;
  const createOrder = useMutation(api.orders.create);

  const fields = store?.checkoutFields?.filter((f) => f.enabled) ?? [];
  // O pedido SEMPRE precisa de um e-mail (recibo + consulta de status). Se a
  // loja desativou o campo, ele ainda aparece aqui como "E-mail para o recibo"
  // — antes disso o checkout falhava para quem não estava logado.
  const renderFields = useMemo(
    () =>
      fields.some((f) => f.key === "email")
        ? fields
        : [...fields, { key: "email", label: "E-mail", enabled: true, required: true }],
    [fields],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const { user, isAuthenticated, signOut } = useAuth();

  // pré-preenche com os dados da conta logada (evita erro de e-mail vazio)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    setValues((s) => ({
      ...s,
      name: s.name || user.name || "",
      email: s.email || user.email || "",
      discord: s.discord || user.name || "",
    }));
  }, [isAuthenticated, user]);

  const missingRequired = useMemo(
    () => renderFields.some((f) => f.required && !(values[f.key] ?? "").trim()),
    [renderFields, values],
  );

  // O pedido sempre precisa de um e-mail (recibo + consulta de status): vale o
  // e-mail da conta logada ou o digitado no checkout. Sem nenhum dos dois o
  // visitante precisa entrar — antes isso virava um "Server Error" cru.
  const accountEmail = (user?.email ?? "").trim();
  const typedEmail = (values.email ?? "").trim();
  const orderEmail = accountEmail || typedEmail;
  const hasOrderEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderEmail);

  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  const submit = async () => {
    if (!cart.items.length) return;
    if (!accepted) {
      toast.error("Aceite os termos e condições para continuar.");
      return;
    }
    for (const f of renderFields) {
      if (f.required && !(values[f.key] ?? "").trim()) {
        toast.error(`${f.label} é obrigatório`);
        return;
      }
    }
    if (!hasOrderEmail) {
      toast.error("Informe um e-mail ou entre na sua conta para finalizar a compra.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createOrder({
        items: cart.items.map((i) => ({
          productId: i.productId as any,
          variantId: i.variantId as any,
          quantity: i.quantity,
        })),
        couponCode: cart.coupon ?? undefined,
        customer: {
          name: values.name || undefined,
          email: orderEmail || undefined,
          discord: values.discord || undefined,
          minecraftNick: values.minecraftNick || undefined,
          phone: values.phone || undefined,
          uuid: values.uuid || undefined,
        },
      });
      cart.clear();
      navigate(`/pedido/${encodeURIComponent(result.number)}?token=${result.accessToken ?? ""}`);
    } catch (e) {
      toast.error(
        friendlyErrorMessage(e, "Não foi possível concluir a compra. Revise os dados e tente novamente."),
      );
      setSubmitting(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <StoreLayout>
        <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center">
          <ShoppingBag className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Carrinho vazio</h1>
          <Button className="mt-6 rounded-xl bg-white font-bold text-zinc-950 hover:bg-zinc-200" onClick={() => navigate("/loja")}>Ver catálogo</Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        {/* Breadcrumb */}
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Checkout</h1>
        <nav className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">Início</Link>
          <ChevronRight className="size-4" />
          <span>Checkout</span>
        </nav>

        {/* Formas de pagamento */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-3xl border bg-card p-5 sm:p-6"
        >
          <h2 className="text-xl font-extrabold tracking-tight">Formas de pagamento</h2>
          <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-foreground/80 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-500">
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <path d="M6 3h12l4 6-10 12L2 9l4-6Zm2.4 2L6 8.4 12 15l6-6.6L15.6 5H8.4Z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-base font-bold">
                Pix
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-500">
                  <Zap className="size-3" /> Mais rápido
                </span>
              </p>
              <p className="text-sm text-muted-foreground">Aprovação imediata</p>
            </div>
          </div>
        </motion.section>

        {/* Informações de contato */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="mt-4 rounded-3xl border bg-card p-5 sm:p-6"
        >
          <h2 className="text-xl font-extrabold tracking-tight">Informações de contato</h2>
          {fields.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Preencha apenas o essencial: seu e-mail, usado no recibo e para acompanhar o pedido.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {renderFields.map((f) => (
              <Input
                key={f.key}
                id={f.key}
                type={f.key === "email" ? "email" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.label + (f.required ? " *" : "")}
                className="h-12 rounded-2xl border-border bg-muted/40 px-5 text-base placeholder:text-muted-foreground"
              />
            ))}
          </div>
        </motion.section>

        {/* Identificação (login) quando não há e-mail para o pedido */}
        {!hasOrderEmail && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 rounded-3xl border border-sky-500/30 bg-sky-500/[0.07] p-5 sm:p-6"
          >
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <Lock className="size-4.5 text-sky-400" />
              Falta só um e-mail para finalizar
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Preencha o e-mail no formulário acima para receber o recibo e acompanhar o pedido.
              Entrando na sua conta, preenchemos tudo automaticamente e a entrega aparece no seu histórico.
            </p>
            {user?.isAnonymous ? (
              <p className="mt-2 text-sm text-amber-300">
                Você está navegando como visitante. Pode concluir informando o e-mail acima ou entrar
                com sua conta para guardar o histórico das compras.
              </p>
            ) : null}
            <Button
              onClick={async () => {
                // Sessão de visitante sai primeiro: a tela de acesso redireciona
                // quem já está autenticado e, sem isso, o visitante não chegaria
                // ao formulário de e-mail.
                if (user?.isAnonymous) {
                  try {
                    await signOut();
                  } catch {
                    // segue para o login mesmo assim
                  }
                }
                navigate(`/auth?returnTo=${encodeURIComponent("/checkout")}`);
              }}
              className="mt-4 h-12 rounded-2xl bg-white px-6 text-base font-bold text-zinc-950 hover:bg-zinc-200"
            >
              {user?.isAnonymous ? "Entrar com e-mail" : "Entrar ou criar conta"}
            </Button>
          </motion.section>
        )}

        {/* Termos + Pagar */}
        <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm sm:items-center">
          <Checkbox
            checked={accepted}
            onCheckedChange={(v) => setAccepted(v === true)}
            className="size-6 rounded-md"
          />
          <span className="text-muted-foreground">
            Eu aceito os{" "}
            <Link to="/p/termos" className="font-bold text-foreground underline-offset-2 hover:underline">
              termos e condições
            </Link>{" "}
            desta compra.
          </span>
        </label>
        <motion.div whileTap={{ scale: 0.99 }} className="mt-4">
          <Button
            size="lg"
            disabled={submitting || missingRequired || !accepted || !hasOrderEmail}
            onClick={submit}
            className="h-14 w-full rounded-2xl bg-white text-lg font-bold text-zinc-950 shadow-lg shadow-sky-500/20 hover:bg-zinc-200"
          >
            {submitting ? (
              <><Loader2 className="mr-2 size-5 animate-spin" /> Processando...</>
            ) : (
              <>Pagar {formatBRL(cart.subtotalCents)}</>
            )}
          </Button>
        </motion.div>

        {/* Resumo do pedido */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="mt-6 overflow-hidden rounded-3xl border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5 sm:px-6">
            <h2 className="text-xl font-extrabold tracking-tight">Resumo do pedido</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-500">
              <Lock className="size-3.5" /> Pagamento seguro
            </span>
          </div>

          <div className="p-5 sm:px-6">
            {cart.items.map((item) => (
              <div key={`${item.productId}-${item.variantId ?? "b"}`} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ShoppingBag className="size-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold uppercase">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{formatBRL(item.unitPriceCents)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Diminuir"
                      onClick={() =>
                        cart.setQuantity(item.productId, item.variantId, Math.max(item.minQty ?? 1, item.quantity - 1))
                      }
                      className="flex size-9 items-center justify-center rounded-full border transition-colors hover:bg-accent"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="flex h-9 min-w-12 items-center justify-center rounded-full border px-2 text-sm font-bold">
                      {item.quantity}
                    </span>
                    <button
                      aria-label="Aumentar"
                      onClick={() =>
                        cart.setQuantity(
                          item.productId,
                          item.variantId,
                          Math.min(item.maxQty && item.maxQty > 0 ? item.maxQty : 99, item.quantity + 1),
                        )
                      }
                      className="flex size-9 items-center justify-center rounded-full border transition-colors hover:bg-accent"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <button
                      aria-label="Remover"
                      onClick={() => cart.remove(item.productId, item.variantId)}
                      className="ml-1 flex size-9 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-500 transition-colors hover:bg-sky-500/20"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <span className="text-lg font-bold">{formatBRL(item.unitPriceCents * item.quantity)}</span>
                </div>
              </div>
            ))}

            <Separator className="my-4" />

            {/* Cupom */}
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Input
                placeholder="Digite seu cupom de desconto"
                value={cart.coupon ?? ""}
                readOnly
                className="h-12 flex-1 rounded-2xl bg-muted/40 px-5 text-base"
              />
              <Button
                variant="outline"
                className="h-12 rounded-2xl border-border bg-card px-6 text-base font-bold"
                onClick={() => {
                  cart.setCoupon(null);
                  toast.info("Cupom removido.");
                }}
              >
                <Ticket className="mr-2 size-4.5" /> {cart.coupon ? "Remover" : "Cupom"}
              </Button>
            </div>

            <Separator className="my-4" />

            <div className="rounded-2xl bg-muted/40 p-4 text-sm">
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatBRL(cart.subtotalCents)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Descontos</span>
                <span>{cart.coupon ? `Cupom ${cart.coupon}` : "R$ 0,00"}</span>
              </div>
              <Separator className="my-3" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatBRL(cart.subtotalCents)}</span>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              O status do pagamento é confirmado automaticamente via PIX.
            </p>
          </div>
        </motion.section>
      </div>
    </StoreLayout>
  );
}
