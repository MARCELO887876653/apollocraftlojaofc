import { useState } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Link, useParams } from "react-router";
import { ArrowLeft, Package } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { Button } from "@/components/ui/button";

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

export default function CategoryPage() {
  const { slug = "" } = useParams();
  const [subSlug, setSubSlug] = useState<string | null>(null);

  const categories = (useQuery(api.categories.listPublic) as Category[] | undefined) ?? [];
  const category = categories.find((c) => c.slug === slug);
  const subs = categories.filter((c) => c.parentId === category?._id);
  const selectedSlug = subSlug ?? slug;
  const selected = categories.find((c) => c.slug === selectedSlug) ?? category;

  const products = useQuery(
    api.products.listActive,
    selected ? { categoryId: selected._id as any, sort: "relevance", limit: 60 } : "skip",
  ) as any[] | undefined;

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-10">
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/categorias" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" /> Categorias
          </Link>
          {category && (
            <>
              <span>/</span>
              <span className="font-medium text-foreground">{category.name}</span>
            </>
          )}
        </nav>

        {!categories ? null : !category ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
            <Package className="size-10 opacity-40" />
            Categoria não encontrada.
          </div>
        ) : (
          <>
            {/* Cabeçalho da categoria */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="relative overflow-hidden rounded-2xl border bg-card"
            >
              {category.image && (
                <>
                  <img src={category.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
                  <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
                </>
              )}
              <div className="relative flex items-center gap-4 p-6">
                <div
                  className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl text-3xl"
                  style={{ backgroundColor: category.color ? `${category.color}22` : undefined }}
                >
                  {category.image ? (
                    <img src={category.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    category.icon ?? "📦"
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">{category.name}</h1>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {category.description ?? `Produtos de ${category.name}`}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Subcategorias (chips) */}
            {subs.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selectedSlug === category.slug ? "default" : "outline"}
                  onClick={() => setSubSlug(null)}
                >
                  Todos
                </Button>
                {subs.map((s) => (
                  <Button
                    key={s._id}
                    size="sm"
                    variant={selectedSlug === s.slug ? "default" : "outline"}
                    onClick={() => setSubSlug(s.slug)}
                  >
                    {s.image ? (
                      <img src={s.image} alt="" className="mr-1.5 inline size-4 rounded-full object-cover" />
                    ) : s.icon ? (
                      <span className="mr-1">{s.icon}</span>
                    ) : null}
                    {s.name}
                  </Button>
                ))}
              </div>
            )}

            {/* Produtos */}
            {products === undefined ? (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
                <Package className="size-10 opacity-40" />
                Nenhum produto nesta categoria ainda.
              </div>
            ) : (
              <motion.div
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                initial="hidden"
                animate="show"
                className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {products.map((p, i) => (
                  <ProductCard key={p._id} product={p} index={i} />
                ))}
              </motion.div>
            )}
          </>
        )}
      </div>
    </StoreLayout>
  );
}
