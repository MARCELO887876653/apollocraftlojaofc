import { useState } from "react";
import { motion } from "framer-motion";
import { useCart } from "@/lib/cart";
import { formatBRL } from "@/lib/format";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { ShoppingBag, ShoppingCart, TrendingDown } from "lucide-react";

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
  const cart = useCart();
  const [loaded, setLoaded] = useState(false);
  const outOfStock = !product.unlimitedStock && product.stock <= 0;
  const discount =
    product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents
      ? Math.round((1 - product.priceCents / product.compareAtPriceCents) * 100)
      : 0;

  const categories = useQuery(api.categories.listPublic) as any[] | undefined;
  const category = categories?.find((c) => c._id === product.categoryId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.3), ease: [0.21, 0.47, 0.32, 0.98] }}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-foreground/25 hover:shadow-xl hover:shadow-black/30"
    >
      <Link to={`/produto/${product.slug}`} className="relative block aspect-square overflow-hidden bg-muted">
        {/* skeleton enquanto carrega */}
        {!loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-accent/40" />}
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-card text-muted-foreground">
            <ShoppingBag className="size-10 opacity-40" />
          </div>
        )}
        {discount > 0 && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/30">
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
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {category.name}
          </span>
        )}
        <Link
          to={`/produto/${product.slug}`}
          className="line-clamp-1 text-lg font-extrabold tracking-tight transition-colors hover:text-primary"
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
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={outOfStock}
            onClick={() =>
              cart.add({
                productId: product._id,
                name: product.name,
                image: product.image,
                unitPriceCents: product.priceCents,
                quantity: product.minQty || 1,
                minQty: product.minQty,
                maxQty: product.maxQty,
              })
            }
            className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
          >
            <ShoppingCart className="size-4" /> Comprar agora
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
