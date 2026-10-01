import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import { List, ArrowRight, Package } from "lucide-react";
import { StoreLayout } from "@/components/store/StoreLayout";

type Category = {
  _id: string;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  image?: string;
  description?: string;
};

export default function CategoriesPage() {
  const categories = useQuery(api.categories.listPublic) as Category[] | undefined;

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-12">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="neon-border mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm font-semibold text-muted-foreground"
        >
          <List className="size-4 text-red-500" /> Navegue por categoria
        </motion.span>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Categorias da loja
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Escolha uma categoria para ver todos os produtos disponíveis nela.
        </p>

        {categories === undefined ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
            <Package className="size-10 opacity-40" />
            Nenhuma categoria cadastrada ainda.
          </div>
        ) : (
          <motion.div
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
            initial="hidden"
            animate="show"
            className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {categories.map((c) => (
              <motion.div key={c._id} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } }} whileHover={{ y: -4 }}>
                <Link
                  to={`/categoria/${c.slug}`}
                  className="group flex h-full items-center gap-4 rounded-2xl border bg-card p-4 transition-all duration-300 hover:border-red-500/40 hover:shadow-[0_0_28px_-8px_rgb(225_29_29/0.4)]"
                >
                  <div
                    className="relative size-20 shrink-0 overflow-hidden rounded-xl transition-transform duration-300 group-hover:scale-105"
                    style={c.color ? { boxShadow: `0 0 42px -8px ${c.color}` } : undefined}
                  >
                    {c.image ? (
                      <img src={c.image} alt={c.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-3xl"
                        style={{ backgroundColor: c.color ? `${c.color}22` : undefined }}
                      >
                        {c.icon ?? "📦"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 py-1">
                    <p className="truncate text-base font-extrabold uppercase tracking-tight sm:text-lg">{c.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {c.description ?? `Veja os itens disponíveis de ${c.name}.`}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-red-400 transition-colors group-hover:text-red-300">
                      Ver produtos <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </StoreLayout>
  );
}
