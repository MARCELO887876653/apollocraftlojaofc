import { motion } from "framer-motion";
import { formatBRL } from "@/lib/format";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
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
};

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const categories = useQuery(api.categories.listPublic) as any[] | undefined;
  const category = categories?.find((c) => c._id === product.categoryId);
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
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-[0_0_30px_-6px_rgb(16_185_129/0.35)]"
    >
      {/* brilho neon no hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <Link to={`/produto/${product.slug}`} className="relative block aspect-square overflow-hidden bg-muted">
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
            <ShoppingBag className="size-10 opacity-40" />
          </div>
        )}
        {discount > 0 && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-extrabold text-emerald-950 shadow-[0_0_18px_-2px_rgb(16_185_129/0.7)]">
            <TrendingDown className="size-3" /> -{discount}%
          </span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-bold backdrop-blur-sm">
            Esgotado
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {category && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500/90">
            {category.name}
          </span>
        )}
        <Link
          to={`/produto/${product.slug}`}
          className="line-clamp-1 text-lg font-extrabold tracking-tight transition-colors hover:text-emerald-400"
        >
          {product.name}
        </Link>

        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
          {discount > 0 && (
            <span className="text-sm text-muted-foreground line-through">
              {formatBRL(product.compareAtPriceCents!)}
            </span>
          )}
        </div>

        <p className="text-xl font-extrabold text-white">{formatBRL(product.priceCents)}</p>
        <p className="text-xs text-muted-foreground">À vista no Pix</p>

        <div className="mt-auto pt-3">
          <motion.div whileTap={{ scale: 0.97 }} className="w-full">
            {/* Clicar em comprar abre o produto — de lá, "Comprar agora" vai pro pagamento */}
            <Link
              to={`/produto/${product.slug}`}
              aria-disabled={outOfStock}
              onClick={(e) => outOfStock && e.preventDefault()}
              className={cn(
                "inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200",
                outOfStock && "pointer-events-none opacity-50",
              )}
            >
              <ShoppingCart className="size-4" /> Comprar
            </Link>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
