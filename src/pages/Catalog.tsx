import { useMemo, useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

type Category = { _id: string; name: string; slug: string; parentId?: string; order: number; active: boolean; description?: string; icon?: string };

export default function Catalog() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("relevance");
  const initialCat = searchParams.get("categoria") ?? "";
  const [catSlug, setCatSlug] = useState(initialCat);

  useEffect(() => setCatSlug(searchParams.get("categoria") ?? ""), [searchParams]);

  const categories = (useQuery(api.categories.listPublic) as Category[] | undefined) ?? [];
  const category = categories.find((c) => c.slug === catSlug);

  const products = useQuery(api.products.listActive, {
    categoryId: (category?._id as any) || undefined,
    search: search || undefined,
    sort: sort as any,
    limit: 60,
  }) as any[] | undefined;

  const subcategories = useMemo(
    () => (category ? categories.filter((c) => c.parentId === category._id) : categories.filter((c) => !c.parentId)),
    [categories, category],
  );

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{category?.name ?? "Catálogo"}</h1>
          <p className="mt-1 text-muted-foreground">
            {category?.description ?? "Todos os produtos disponíveis na loja"}
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produtos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevância</SelectItem>
              <SelectItem value="newest">Novidades</SelectItem>
              <SelectItem value="price_asc">Menor preço</SelectItem>
              <SelectItem value="price_desc">Maior preço</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {subcategories.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <Button
              variant={catSlug === "" ? "default" : "outline"}
              size="sm"
              onClick={() => setCatSlug("")}
            >
              Todos
            </Button>
            {subcategories.map((c) => (
              <Button
                key={c._id}
                variant={catSlug === c.slug ? "default" : "outline"}
                size="sm"
                onClick={() => setCatSlug(c.slug)}
              >
                {c.icon ? `${c.icon} ` : ""}{c.name}
              </Button>
            ))}
          </div>
        )}

        {products === undefined ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed p-16 text-center text-muted-foreground">
            Nenhum produto encontrado.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
