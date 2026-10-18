import { useState } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Link, useParams } from "react-router";
import { ArrowLeft, Package, ShoppingBasket } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

type Category = {
  _id: string;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  image?: string;
  description?: string;
  parentId?: string;
};

type Product = {
  _id: string;
  slug: string;
  name: string;
  image?: string;
  priceCents: number;
  compareAtPriceCents?: number;
  stock: number;
  unlimitedStock: boolean;
};

/** Card vertical estilo CentralCart: imagem grande, preço, desconto e "Comprar agora". */
function CategoryProductCard({ product, index }: { product: Product; index: number }) {
  const outOfStock = !product.unlimitedStock && product.stock <= 0;
  const discount =
    product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents
      ? Math.round((1 - product.priceCents / product.compareAtPriceCents) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3) }}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-sky-500/40 hover:shadow-[0_0_30px_-6px_rgb(56_189_248/0.4)]"
    >
      <Link
        to={`/produto/${product.slug}`}
        className="relative block aspect-square w-full overflow-hidden bg-muted"
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-card">
            <Package className="size-10 opacity-30" />
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-bold backdrop-blur-sm">
            Esgotado
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link
          to={`/produto/${product.slug}`}
          className="line-clamp-1 text-base font-extrabold uppercase tracking-tight transition-colors hover:text-sky-400"
        >
          {product.name}
        </Link>

        <div className="mt-2 flex items-center gap-2">
          {discount > 0 ? (
            <>
              <span className="text-sm text-muted-foreground line-through">
                {formatBRL(product.compareAtPriceCents!)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-1.5 py-0.5 text-xs font-bold text-foreground">
                <TrendingDownIcon /> -{discount}%
              </span>
              <span className="ml-auto flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-500">
                <GemIcon />
              </span>
            </>
          ) : (
            <span className="ml-auto flex size-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-400">
              <GemIcon />
            </span>
          )}
        </div>

        <p className="mt-1 text-xl font-extrabold tracking-tight">{formatBRL(product.priceCents)}</p>
        <p className="text-sm text-muted-foreground">À vista no Pix</p>

        <div className="mt-auto pt-4">
          <Link
            to={`/produto/${product.slug}`}
            aria-disabled={outOfStock}
            onClick={(e) => outOfStock && e.preventDefault()}
            className={cn(
              "flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200",
              outOfStock && "pointer-events-none opacity-50",
            )}
          >
            <ShoppingBasket className="size-4.5" /> Comprar agora
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function TrendingDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3">
      <path d="m3 7 6 6 4-4 8 8" />
      <path d="M21 11v6h-6" />
    </svg>
  );
}

function GemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
      <path d="M6 3h12l4 6-10 12L2 9l4-6Zm2.4 2L6 8.4 12 15l6-6.6L15.6 5H8.4Z" />
    </svg>
  );
}

export default function CategoryPage() {
  const { slug = "" } = useParams();
  const [subSlug, setSubSlug] = useState<string | null>(null);

  // UMA chamada traz a categoria, as subcategorias (chips) e os produtos dela.
  // Antes eram duas: todas as categorias + os produtos.
  const data = useQuery(api.storefront.getCategoryPage, {
    slug,
    subSlug: subSlug ?? undefined,
  }) as
    | {
        category: Category | null;
        subs: Category[];
        selectedSlug: string;
        products: Product[];
      }
    | undefined;

  const category = data?.category ?? null;
  const subs = data?.subs ?? [];
  const selectedSlug = data?.selectedSlug ?? slug;
  const products = data?.products;

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-12">
        {data === undefined ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : !category ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
            <Package className="size-10 opacity-40" />
            Categoria não encontrada.
          </div>
        ) : (
          <>
            {/* Cabeçalho: botão voltar + título gigante */}
            <div className="mb-7 flex items-center gap-4">
              <Link
                to="/categorias"
                aria-label="Voltar para categorias"
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card text-foreground transition-colors hover:bg-accent"
              >
                <ArrowLeft className="size-5" />
              </Link>
              <h1 className="text-4xl font-extrabold uppercase tracking-tight sm:text-5xl">
                {category.name}
              </h1>
            </div>

            {/* Subcategorias (chips) */}
            {subs.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  onClick={() => setSubSlug(null)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                    selectedSlug === category.slug
                      ? "border-transparent bg-sky-500/15 text-sky-400"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  Todos
                </button>
                {subs.map((s) => (
                  <button
                    key={s._id}
                    onClick={() => setSubSlug(s.slug)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                      selectedSlug === s.slug
                        ? "border-transparent bg-sky-500/15 text-sky-400"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {s.image ? (
                      <img src={s.image} alt="" className="mr-1.5 inline size-4 rounded-full object-cover" />
                    ) : s.icon ? (
                      <span className="mr-1">{s.icon}</span>
                    ) : null}
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            {/* Produtos */}
            {products === undefined ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted/60" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
                <Package className="size-10 opacity-40" />
                Nenhum produto nesta categoria ainda.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((p, i) => (
                  <CategoryProductCard key={p._id} product={p} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </StoreLayout>
  );
}
