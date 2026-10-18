import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { useCart } from "@/lib/cart";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/store/ProductCard";
import { ShoppingBag, ShoppingCart, Zap, Plus, Minus } from "lucide-react";

type Variant = {
  _id: string;
  name: string;
  priceCents: number;
  compareAtPriceCents?: number;
  stock: number;
  unlimitedStock: boolean;
  active: boolean;
};

function GemIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 3h12l4 6-10 12L2 9l4-6Zm2.4 2L6 8.4 12 15l6-6.6L15.6 5H8.4Z" />
    </svg>
  );
}

export default function ProductPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  // UMA chamada traz produto, variações, categoria e relacionados. Antes os
  // relacionados só eram pedidos depois que o produto chegava (ida e volta a
  // mais em toda visita).
  const data = useQuery(api.storefront.getProductPage, { slug }) as
    | { product: any; variants: Variant[]; category: any; related: any[] }
    | null
    | undefined;
  const [variantId, setVariantId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [mainImage, setMainImage] = useState<string | null>(null);

  // troca de produto: reset de estado (evita "1 virar 10" ao navegar entre produtos)
  useEffect(() => {
    setVariantId("");
    setQty(1);
    setMainImage(null);
  }, [slug]);

  const product = data?.product;
  const variants = data?.variants ?? [];

  const related = data?.related;

  const selectedVariant = useMemo(
    () => variants.find((v) => v._id === variantId) ?? null,
    [variants, variantId],
  );

  const effective = selectedVariant ?? product;
  const price = effective?.priceCents ?? 0;
  const compareAt = effective?.compareAtPriceCents ?? product?.compareAtPriceCents;
  const discount =
    compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;

  const stock = selectedVariant
    ? selectedVariant.unlimitedStock
      ? Infinity
      : selectedVariant.stock
    : product
      ? product.unlimitedStock
        ? Infinity
        : product.stock
      : 0;
  const outOfStock = !product || (stock !== Infinity && stock < 1);
  const minQty = product?.minQty ?? 1;
  const maxQty = Math.min(product?.maxQty ?? 99, stock === Infinity ? 99 : stock);
  const deliveryType = product?.delivery?.type;
  const instantDelivery =
    deliveryType && deliveryType !== "none" && deliveryType !== "manual";

  if (data === undefined) {
    return (
      <StoreLayout>
        <div className="mx-auto w-full max-w-3xl px-4 py-12">
          <div className="aspect-video animate-pulse rounded-2xl bg-muted/60" />
          <div className="mt-6 space-y-3">
            <div className="h-9 w-2/3 animate-pulse rounded bg-muted/60" />
            <div className="h-6 w-1/3 animate-pulse rounded bg-muted/60" />
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (!product) {
    return (
      <StoreLayout>
        <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center">
          <ShoppingBag className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Produto não encontrado</h1>
          <p className="mt-2 text-muted-foreground">Ele pode ter sido removido ou está indisponível.</p>
          <Button className="mt-6" onClick={() => navigate("/loja")}>Voltar ao catálogo</Button>
        </div>
      </StoreLayout>
    );
  }

  const addToCart = () => {
    cart.add({
      productId: product._id,
      variantId: selectedVariant?._id,
      name: product.name,
      variantName: selectedVariant?.name,
      image: product.image,
      unitPriceCents: price,
      quantity: qty,
      minQty,
      maxQty: product.maxQty,
    });
  };

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        {/* Card principal do produto — estilo CentralCart */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-3xl border bg-card p-4 sm:p-6"
        >
          <div className="overflow-hidden rounded-2xl border bg-muted">
            {mainImage || product.image ? (
              <motion.img
                key={mainImage ?? product.image}
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                src={mainImage ?? product.image}
                alt={product.name}
                loading="eager"
                decoding="async"
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-muted-foreground">
                <ShoppingBag className="size-14" />
              </div>
            )}
          </div>
          {product.images?.length > 0 && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[product.image, ...product.images].filter(Boolean).slice(0, 5).map((img: string, i: number) => {
                const selected = (mainImage ?? product.image) === img;
                return (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.95 }}
                    className={`overflow-hidden rounded-lg border transition ${
                      selected ? "border-primary ring-2 ring-primary/40" : "opacity-70 hover:opacity-100"
                    }`}
                    onClick={() => setMainImage(img)}
                  >
                    <img src={img} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                  </motion.button>
                );
              })}
            </div>
          )}

          <h1 className="mt-5 text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
            {product.name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {compareAt && compareAt > price && (
              <>
                <span className="text-base text-muted-foreground line-through">{formatBRL(compareAt)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-sm font-bold">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5">
                    <path d="m3 7 6 6 4-4 8 8" />
                    <path d="M21 11v6h-6" />
                  </svg>
                  -{discount} % OFF
                </span>
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-3xl font-extrabold tracking-tight">{formatBRL(price)}</span>
            <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
              {stock === Infinity || product.unlimitedStock
                ? "100+ em estoque"
                : `${Math.max(stock, 0)} em estoque`}
            </span>
            {instantDelivery && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-zinc-950">
                <Zap className="size-3.5" /> Entrega automática
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">À vista no Pix</p>

          {variants.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Escolha uma opção</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const vOut = !v.unlimitedStock && v.stock <= 0;
                  return (
                    <button
                      key={v._id}
                      disabled={vOut}
                      onClick={() => {
                        setVariantId(v._id === variantId ? "" : v._id);
                        setQty(minQty);
                      }}
                      className={`rounded-xl border px-4 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        variantId === v._id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-primary/40"
                      }`}
                    >
                      <span className="font-medium">{v.name}</span>
                      <span className="block text-xs text-muted-foreground">{formatBRL(v.priceCents)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border p-4">
            {/* Contador de quantidade */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty((q) => Math.max(minQty, q - 1))}
                aria-label="Diminuir quantidade"
                className="flex size-10 items-center justify-center rounded-full border text-lg transition-colors hover:bg-accent"
              >
                <Minus className="size-4" />
              </button>
              <span className="flex h-10 min-w-14 items-center justify-center rounded-full border px-3 text-sm font-bold">
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                aria-label="Aumentar quantidade"
                className="flex size-10 items-center justify-center rounded-full border text-lg transition-colors hover:bg-accent"
              >
                <Plus className="size-4" />
              </button>
              <span className="ml-1 text-sm text-muted-foreground">
                {maxQty > 0 && maxQty !== Infinity ? `máx. ${maxQty}` : ""}
              </span>
            </div>

            <div className="mt-4 space-y-2.5">
              <motion.div whileTap={{ scale: 0.99 }}>
                <Button
                  size="lg"
                  disabled={outOfStock}
                  onClick={() => {
                    addToCart();
                    navigate("/checkout");
                  }}
                  className="h-12 w-full rounded-full bg-white text-base font-bold text-zinc-950 shadow-lg shadow-sky-500/20 hover:bg-zinc-200"
                >
                  <ShoppingCart className="mr-2 size-5" /> Comprar agora
                </Button>
              </motion.div>
              <motion.div whileTap={{ scale: 0.99 }}>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full rounded-full border-border bg-card font-semibold"
                  disabled={outOfStock}
                  onClick={addToCart}
                >
                  <Plus className="mr-2 size-5" /> Adicionar ao carrinho
                </Button>
              </motion.div>
            </div>
          </div>

          {/* Vantagens */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-2xl border p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-500">
                <GemIcon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">Compra segura</p>
                <p className="truncate text-xs text-muted-foreground">Dados criptografados</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-500">
                <Zap className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">Envio imediato</p>
                <p className="truncate text-xs text-muted-foreground">
                  {instantDelivery ? "Entrega automática" : "Entrega rápida"}
                </p>
              </div>
            </div>
          </div>

          {(product.benefits ?? []).length > 0 && (
            <ul className="mt-4 space-y-2">
              {(product.benefits as string[]).map((b, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <GemIcon className="size-3.5 text-sky-500" /> {b}
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        {/* Descrição */}
        {product.description && (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-4 rounded-3xl border bg-card p-5 sm:p-6"
          >
            <h2 className="text-xl font-extrabold tracking-tight">Descrição</h2>
            <div className="mt-3 whitespace-pre-wrap text-muted-foreground">{product.description}</div>
          </motion.section>
        )}

        {/* FAQ de pagamento/entrega */}
        <div className="mt-4 space-y-3">
          {[
            {
              t: "Formas de pagamento",
              d: "Aceitamos pagamentos via PIX com confirmação automática pelo Mercado Pago.",
            },
            {
              t: "Como funciona a entrega?",
              d: "Após a confirmação do pagamento, o produto é entregue automaticamente conforme a configuração de cada item (comando no servidor, mensagem, código ou API).",
            },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border bg-card p-5">
              <p className="font-bold">{f.t}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>

        {/* Relacionados */}
        {related && related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-5 text-2xl font-extrabold tracking-tight">Produtos relacionados</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {related.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </StoreLayout>
  );
}
