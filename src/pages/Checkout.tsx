import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { useCart } from "@/lib/cart";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ShoppingBag, ArrowRight } from "lucide-react";

type Store = { name: string; checkoutFields: Array<{ key: string; label: string; enabled: boolean; required: boolean }> };

export default function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const store = useQuery(api.settings.getStore) as Store | undefined;
  const createOrder = useMutation(api.orders.create);

  const fields = store?.checkoutFields?.filter((f) => f.enabled) ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const missingRequired = useMemo(
    () => fields.some((f) => f.required && !(values[f.key] ?? "").trim()),
    [fields, values],
  );

  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  const submit = async () => {
    if (!cart.items.length) return;
    for (const f of fields) {
      if (f.required && !(values[f.key] ?? "").trim()) {
        toast.error(`${f.label} é obrigatório`);
        return;
      }
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
          email: values.email || undefined,
          discord: values.discord || undefined,
          minecraftNick: values.minecraftNick || undefined,
          phone: values.phone || undefined,
          uuid: values.uuid || undefined,
        },
      });
      cart.clear();
      navigate(`/pedido/${encodeURIComponent(result.number)}?token=${result.accessToken ?? ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar pedido");
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
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Finalizar compra</h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-semibold">Seus dados</h2>
            {fields.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhum campo configurado — preencha apenas o essencial.
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className={f.key === "name" ? "sm:col-span-2" : undefined}>
                  <Label htmlFor={f.key}>
                    {f.label} {f.required && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    id={f.key}
                    type={f.key === "email" ? "email" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.label}
                    className="mt-1.5"
                  />
                </div>
              ))}
            </div>

            <Separator className="my-6" />

            <h2 className="font-semibold">Itens do pedido</h2>
            <div className="mt-3 space-y-2">
              {cart.items.map((item) => (
                <div key={`${item.productId}-${item.variantId ?? "b"}`} className="flex items-center justify-between text-sm">
                  <span>
                    {item.quantity}× {item.name}
                    {item.variantName ? ` — ${item.variantName}` : ""}
                  </span>
                  <span className="font-medium">{formatBRL(item.unitPriceCents * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="h-fit rounded-xl border bg-card p-6 lg:sticky lg:top-24">
            <h2 className="font-semibold">Pagamento</h2>
            <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
              <span className="text-lg">🟢</span>
              <div>
                <p className="font-medium">PIX — Mercado Pago</p>
                <p className="text-xs text-muted-foreground">Confirmação automática após o pagamento</p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatBRL(cart.subtotalCents)}</span>
              </div>
              {cart.coupon && (
                <div className="flex justify-between text-emerald-600">
                  <span>Cupom {cart.coupon}</span>
                  <span>desconto na confirmação</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatBRL(cart.subtotalCents)}</span>
              </div>
            </div>

            <Button
              className="mt-6 w-full"
              size="lg"
              disabled={submitting || missingRequired}
              onClick={submit}
            >
              {submitting ? (
                <><Loader2 className="mr-2 size-4 animate-spin" /> Processando...</>
              ) : (
                <>Gerar pagamento PIX <ArrowRight className="ml-2 size-4" /></>
              )}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Você será redirecionado para o pagamento. O status é confirmado automaticamente.
            </p>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
