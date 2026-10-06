import { motion } from "framer-motion";
import { formatBRL } from "@/lib/format";
import { Link } from "react-router";
import { ShoppingBag, ShoppingCart, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Product = {
  _id: string;
  slug: string;
  name: string;
  image?: string;
  shortDescription?: string;
  priceCents: number;
  compareAtPriceCents?: number;
  stock: number;
  unlimitedStock: boolean;
  minQty: number;
  maxQty: number;
  categoryId?: string;
  /** Já vem resolvido pelas consultas de vitrine (products.list*) — antes cada
   *  card abria a sua própria assinatura de categorias no cliente. */
  categoryName?: string;
};

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const outOfStock = !product.unlimitedStock && product.stock <= 0;
  const discount =
    product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents
      ? Math.round((1 - product.priceCents / product.compareAtPriceCents) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.3), ease: [0.21, 0.47, 0.32, 0.98] }}
      className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-sky-500/40 hover:shadow-[0_0_30px_-6px_rgb(56_189_248/0.4)]"
    >
      {/* brilho neon no hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Layout horizontal compacto: thumb pequeno à esquerda + info */}
      <div className="flex gap-3 p-3">
        <Link
          to={`/produto/${product.slug}`}
          className="relative block size-20 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-24"
        >
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-all duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-card text-muted-foreground">
              <ShoppingBag className="size-5 opacity-30" />
            </div>
          )}
          {discount > 0 && (
            <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-[0_0_14px_-2px_rgb(56_189_248/0.7)]">
              <TrendingDown className="size-2.5" /> -{discount}%
            </span>
          )}
          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-[11px] font-bold backdrop-blur-sm">
              Esgotado
            </div>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          {product.categoryName && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-500/90">
              {product.categoryName}
            </span>
          )}
          <Link
            to={`/produto/${product.slug}`}
            className="line-clamp-1 text-base font-extrabold tracking-tight transition-colors hover:text-sky-400"
          >
            {product.name}
          </Link>

          <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
            <span className="text-lg font-extrabold text-white">{formatBRL(product.priceCents)}</span>
            {discount > 0 && (
              <span className="text-xs text-muted-foreground line-through">
                {formatBRL(product.compareAtPriceCents!)}
              </span>
            )}
          </div>

          <div className="mt-auto pt-1.5">
            <motion.div whileTap={{ scale: 0.97 }}>
              {/* Clicar em comprar abre o produto — de lá, "Comprar agora" vai pro pagamento */}
              <Link
                to={`/produto/${product.slug}`}
                aria-disabled={outOfStock}
                onClick={(e) => outOfStock && e.preventDefault()}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 text-xs font-bold text-zinc-950 transition-colors hover:bg-zinc-200",
                  outOfStock && "pointer-events-none opacity-50",
                )}
              >
                <ShoppingCart className="size-3.5" /> Comprar
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
