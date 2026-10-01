import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { useCart } from "@/lib/cart";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ChevronRight, ShoppingBag, Plus, Minus, X, Ticket, Lock } from "lucide-react";

type CouponResult =
  | { ok: true; code: string; discount: number }
  | { ok: false; error: string }
  | undefined;

export default function CartPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null);

  const couponResult = useQuery(
    api.coupons.validate,
    cart.items.length && code.trim().length >= 3
      ? {
          code,
          items: cart.items.map((i) => ({
            productId: i.productId as any,
            variantId: i.variantId as any,
            quantity: i.quantity,
          })),
          email: undefined,
        }
      : "skip",
  ) as CouponResult;

  const subtotal = cart.subtotalCents;
  const discount = applied?.discount ?? 0;
  const total = Math.max(0, subtotal - discount);

  const applyCoupon = () => {
    if (!couponResult) return;
    if (couponResult.ok) {
      setApplied({ code: couponResult.code, discount: couponResult.discount });
      cart.setCoupon(couponResult.code);
      toast.success(`Cupom ${couponResult.code} aplicado!`);
    } else {
      setApplied(null);
      cart.setCoupon(null);
      toast.error(couponResult.error);
    }
  };

  const removeCoupon = () => {
    setApplied(null);
    setCode("");
    cart.setCoupon(null);
  };

  if (cart.items.length === 0) {
    return (
      <StoreLayout>
        <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center">
          <ShoppingBag className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Seu carrinho está vazio</h1>
          <p className="mt-2 text-muted-foreground">Explore o catálogo e adicione produtos.</p>
          <Button
            className="mt-6 rounded-xl bg-white font-bold text-zinc-950 hover:bg-zinc-200"
            onClick={() => navigate("/loja")}
          >
            Ver catálogo
          </Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Carrinho</h1>
        <nav className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">Início</Link>
          <ChevronRight className="size-4" />
          <span>Carrinho</span>
        </nav>

        <div className="mt-6 space-y-6">
          {/* Itens */}
          <section className="rounded-3xl border bg-card p-5 sm:p-6">
            <h2 className="text-xl font-extrabold tracking-tight">Seus itens</h2>
            <AnimatePresence initial={false}>
              {cart.items.map((item) => (
                <motion.div
                  key={`${item.productId}-${item.variantId ?? "base"}`}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25 }}
                  className="py-5 first-of-type:mt-2 last:pb-0 [&:not(:first-of-type)]:border-t"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {item.image ? (
                        <img src={item.image} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ShoppingBag className="size-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to="/loja" className="block truncate font-bold uppercase hover:text-red-400">
                        {item.name}
                      </Link>
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
                        className="ml-1 flex size-9 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-500 transition-colors hover:bg-red-500/20"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <span className="text-lg font-bold">{formatBRL(item.unitPriceCents * item.quantity)}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </section>

          {/* Cupom + Resumo + Pagar */}
          <section className="rounded-3xl border bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Input
                placeholder="Digite seu cupom de desconto"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setApplied(null);
                }}
                className="h-12 flex-1 rounded-2xl bg-muted/40 px-5 text-base placeholder:text-muted-foreground"
              />
              <Button
                variant="outline"
                onClick={applied ? removeCoupon : applyCoupon}
                disabled={!applied && !couponResult?.ok}
                className="h-12 rounded-2xl border-border bg-card px-6 text-base font-bold"
              >
                <Ticket className="mr-2 size-4.5" /> {applied ? "Remover" : "Aplicar"}
              </Button>
            </div>
            {couponResult && !couponResult.ok && code.length >= 3 && (
              <p className="mt-2 text-xs text-red-500">{couponResult.error}</p>
            )}

            <Separator className="my-5" />

            <div className="rounded-2xl bg-muted/40 p-4 text-sm">
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between py-0.5 font-medium text-red-400">
                  <span>Descontos</span>
                  <span>−{formatBRL(discount)}</span>
                </div>
              )}
              <Separator className="my-3" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
            </div>

            <motion.div whileTap={{ scale: 0.99 }} className="mt-5">
              <Button
                size="lg"
                onClick={() => navigate("/checkout")}
                className="h-14 w-full rounded-2xl bg-white text-lg font-bold text-zinc-950 shadow-lg shadow-red-500/20 hover:bg-zinc-200"
              >
                <Lock className="mr-2 size-4.5" /> Continuar para o pagamento
              </Button>
            </motion.div>
            <button
              onClick={() => navigate("/loja")}
              className="mt-3 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Continuar comprando
            </button>
          </section>
        </div>
      </div>
    </StoreLayout>
  );
}
