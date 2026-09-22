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
import { Trash2, Tag, ArrowRight, ShoppingBag } from "lucide-react";

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
            Ver catálogo <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Carrinho</h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <AnimatePresence initial={false}>
            {cart.items.map((item) => (
              <motion.div
                key={`${item.productId}-${item.variantId ?? "base"}`}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25 }}
                className="flex gap-4 rounded-xl border bg-card p-4"
              >
                <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {item.image ? (
                    <img src={item.image} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ShoppingBag className="size-6" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link to="/loja" className="font-semibold hover:text-primary">
                        {item.name}
                      </Link>
                      {item.variantName && (
                        <p className="text-sm text-muted-foreground">{item.variantName}</p>
                      )}
                    </div>
                    <motion.div whileTap={{ scale: 0.9 }}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => cart.remove(item.productId, item.variantId)}
                        aria-label="Remover"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </motion.div>
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-center rounded-lg border">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() =>
                          cart.setQuantity(
                            item.productId,
                            item.variantId,
                            Math.max(item.minQty ?? 1, item.quantity - 1),
                          )
                        }
                      >
                        −
                      </Button>
                      <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() =>
                          cart.setQuantity(
                            item.productId,
                            item.variantId,
                            Math.min(item.maxQty && item.maxQty > 0 ? item.maxQty : 99, item.quantity + 1),
                          )
                        }
                      >
                        +
                      </Button>
                    </div>
                    <span className="font-semibold">{formatBRL(item.unitPriceCents * item.quantity)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>

          <div className="h-fit rounded-xl border bg-card p-6 lg:sticky lg:top-24">
            <h2 className="font-semibold">Resumo</h2>

            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cupom de desconto"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setApplied(null);
                  }}
                  className="pl-9"
                />
              </div>
              <Button variant="secondary" onClick={applyCoupon} disabled={!couponResult?.ok}>
                Aplicar
              </Button>
            </div>
            {couponResult && !couponResult.ok && code.length >= 3 && (
              <p className="mt-2 text-xs text-red-600">{couponResult.error}</p>
            )}
            {applied && (
              <div className="mt-2 flex items-center justify-between rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                <span>Cupom {applied.code} aplicado</span>
                <button onClick={removeCoupon} className="underline">remover</button>
              </div>
            )}

            <Separator className="my-4" />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Desconto</span>
                  <span>−{formatBRL(discount)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
            </div>

            <Button
              className="mt-6 w-full"
              size="lg"
              onClick={() => navigate("/checkout")}
            >
              Finalizar compra <ArrowRight className="ml-2 size-4" />
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate("/loja")}>
              Continuar comprando
            </Button>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
