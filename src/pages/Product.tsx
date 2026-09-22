import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { useCart } from "@/lib/cart";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ProductCard } from "@/components/store/ProductCard";
import { ShoppingBag, ShoppingCart, Check, Zap, ShieldCheck } from "lucide-react";

type Variant = {
  _id: string;
  name: string;
  priceCents: number;
  compareAtPriceCents?: number;
  stock: number;
  unlimitedStock: boolean;
  active: boolean;
};

export default function ProductPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const data = useQuery(api.products.getBySlug, { slug }) as
    | { product: any; variants: Variant[]; category: any }
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

  const related = useQuery(
    api.products.listRelated,
    product ? { productId: product._id, categoryId: product.categoryId, limit: 4 } : "skip",
  ) as any[] | undefined;

  const benefits = product?.benefits ?? [];

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

  if (data === undefined) {
    return (
      <StoreLayout>
        <div className="mx-auto w-full max-w-7xl px-4 py-16">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="aspect-video animate-pulse rounded-xl bg-muted" />
            <div className="space-y-4">
              <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-24 w-full animate-pulse rounded bg-muted" />
            </div>
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
      <div className="mx-auto w-full max-w-7xl px-4 py-10">
        <nav className="mb-6 text-sm text-muted-foreground">
          <Link to="/loja" className="hover:text-foreground">Catálogo</Link>
          {data.category && (
            <>
              {" / "}
              <Link to={`/loja?categoria=${data.category.slug}`} className="hover:text-foreground">
                {data.category.name}
              </Link>
            </>
          )}
          {" / "}
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="overflow-hidden rounded-2xl border bg-muted">
              {mainImage || product.image ? (
                <motion.img
                  key={mainImage ?? product.image}
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  src={mainImage ?? product.image}
                  alt={product.name}
                  loading="eager"
                  decoding="async"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-muted-foreground">
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
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          >
            <div className="flex flex-wrap items-center gap-2">
              {data.category && (
                <Badge variant="secondary">{data.category.name}</Badge>
              )}
              {product.popular && <Badge variant="outline">Mais vendido</Badge>}
              {discount > 0 && <Badge className="bg-red-600 hover:bg-red-600">-{discount}%</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{product.name}</h1>
            {product.shortDescription && (
              <p className="mt-2 text-muted-foreground">{product.shortDescription}</p>
            )}

            <div className="mt-5 flex flex-wrap items-end gap-3">
              <span className="text-4xl font-extrabold text-white">{formatBRL(price)}</span>
              {discount > 0 && (
                <span className="pb-1 text-lg text-muted-foreground line-through">{formatBRL(compareAt!)}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">À vista no Pix</p>

            <p className="mt-2 text-sm">
              {stock === Infinity ? (
                <span className="text-emerald-600">Estoque sempre disponível</span>
              ) : stock > 0 ? (
                <span className="text-emerald-600">{stock} em estoque</span>
              ) : (
                <span className="text-red-600">Esgotado</span>
              )}
            </p>

            {variants.length > 0 && (
              <div className="mt-6">
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
                        className={`rounded-lg border px-4 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
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

            <div className="mt-6 flex items-center gap-3">
              <div className="flex items-center rounded-lg border">
                <Button variant="ghost" size="icon" onClick={() => setQty((q) => Math.max(minQty, q - 1))}>−</Button>
                <Input
                  type="number"
                  min={minQty}
                  max={maxQty}
                  value={qty}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10) || minQty;
                    setQty(Math.min(Math.max(n, minQty), maxQty));
                  }}
                  className="w-14 border-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <Button variant="ghost" size="icon" onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>+</Button>
              </div>
              <span className="text-sm text-muted-foreground">
                {maxQty > 0 ? `máx. ${maxQty}` : ""}
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                <Button
                  size="lg"
                  disabled={outOfStock}
                  onClick={() => {
                    addToCart();
                    navigate("/checkout");
                  }}
                  className="h-12 w-full rounded-xl bg-white text-sm font-bold text-zinc-950 shadow-lg shadow-white/5 hover:bg-zinc-200"
                >
                  <ShoppingCart className="mr-2 size-4" /> Comprar agora
                </Button>
              </motion.div>
              <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full rounded-xl border-border bg-card/60 font-semibold backdrop-blur"
                  disabled={outOfStock}
                  onClick={addToCart}
                >
                  <Zap className="mr-2 size-4" /> Adicionar ao carrinho
                </Button>
              </motion.div>
            </div>

            {benefits.length > 0 && (
              <ul className="mt-6 space-y-2">
                {benefits.map((b: string, i: number) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 text-emerald-600" /> {b}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex items-center gap-4 rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Zap className="size-3.5 text-primary" /> Entrega automática</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-emerald-600" /> Pagamento seguro</span>
            </div>
          </motion.div>
        </div>

        {product.description && (
          <Separator className="my-10" />
        )}

        {product.description && (
          <section className="max-w-3xl">
            <h2 className="mb-3 text-xl font-bold">Sobre o produto</h2>
            <div className="whitespace-pre-wrap text-muted-foreground">{product.description}</div>
          </section>
        )}

        {related && related.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-6 text-2xl font-bold tracking-tight">Produtos relacionados</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          </section>
        )}

        <Accordion type="single" collapsible className="mt-14 max-w-3xl">
          <AccordionItem value="pagamento">
            <AccordionTrigger>Formas de pagamento</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Aceitamos pagamentos via PIX com confirmação automática pelo Mercado Pago.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="entrega">
            <AccordionTrigger>Como funciona a entrega?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Após a confirmação do pagamento, o produto é entregue automaticamente conforme a
              configuração de cada item (comando no servidor, mensagem, código ou API).
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </StoreLayout>
  );
}
