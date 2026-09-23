import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { formatBRL } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Megaphone, Pencil, Tag } from "lucide-react";

type Product = {
  _id: string; name: string; slug: string; image?: string; active: boolean;
  priceCents: number; compareAtPriceCents?: number; salesCount: number;
};

export default function AdminPromotions() {
  const products = useQuery(api.products.adminList, {}) as Product[] | undefined;

  const promos = (products ?? []).filter(
    (p) => p.compareAtPriceCents && p.compareAtPriceCents > p.priceCents,
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          Promoções
          <span className="rounded-md bg-violet-500 px-2 py-0.5 text-[11px] font-extrabold uppercase text-white">
            novo
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Produtos com preço promocional ativo na loja.
        </p>
      </div>

      {products === undefined && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {products !== undefined && promos.length === 0 && (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
              <Megaphone className="size-6" />
            </span>
            <p className="font-bold">Nenhuma promoção ativa</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Para criar uma promoção, edite um produto e preencha o{" "}
              <strong>preço original</strong> maior que o preço atual — o desconto aparece
              automaticamente na loja.
            </p>
            <Button variant="white" className="mt-2 rounded-full font-bold" asChild>
              <Link to="/painel/produtos">
                <Tag className="size-4" /> Gerenciar pacotes
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card">
        {promos.map((p, i) => {
          const off = Math.round((1 - p.priceCents / p.compareAtPriceCents!) * 100);
          return (
            <div key={p._id} className={"flex items-center gap-4 px-5 py-4 " + (i > 0 ? "border-t" : "")}>
              <div className="size-11 shrink-0 overflow-hidden rounded-xl bg-muted">
                {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="line-through">{formatBRL(p.compareAtPriceCents!)}</span>{" "}
                  <span className="font-bold text-foreground">{formatBRL(p.priceCents)}</span>
                </p>
              </div>
              <Badge className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" variant="secondary">
                -{off}%
              </Badge>
              <Button variant="outline" size="icon" asChild className="rounded-lg">
                <Link to="/painel/produtos" aria-label="Editar">
                  <Pencil className="size-4" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
