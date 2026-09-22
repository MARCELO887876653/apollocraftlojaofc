import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatBRL, DELIVERY_TYPE_LABEL } from "@/lib/format";
import { slugifyClient } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search, Package } from "lucide-react";

type Product = {
  _id: string; name: string; slug: string; image?: string;
  priceCents: number; compareAtPriceCents?: number; stock: number; unlimitedStock: boolean;
  active: boolean; featured: boolean; popular: boolean; hidden: boolean;
  salesCount: number; categoryId?: string; delivery: { type: string };
};

type Variant = {
  _id: string; name: string; priceCents: number; compareAtPriceCents?: number;
  stock: number; unlimitedStock: boolean; order: number; active: boolean; sku?: string;
};

const EMPTY_DELIVERY = { type: "none", showToCustomer: true };

function emptyForm() {
  return {
    name: "", shortDescription: "", description: "", image: "", images: [] as string[],
    categoryId: "", tags: [] as string[], price: "0", compareAt: "", stock: "0",
    unlimitedStock: false, active: true, featured: false, popular: false, hidden: false,
    minQty: "1", maxQty: "99", order: "0", benefits: [] as string[],
    delivery: EMPTY_DELIVERY as any, seoTitle: "", seoDescription: "",
  };
}

function toForm(p: Product & any): any {
  return {
    name: p.name, shortDescription: p.shortDescription ?? "", description: p.description ?? "",
    image: p.image ?? "", images: p.images ?? [], categoryId: p.categoryId ?? "",
    tags: p.tags ?? [], price: (p.priceCents / 100).toFixed(2), compareAt: p.compareAtPriceCents ? (p.compareAtPriceCents / 100).toFixed(2) : "",
    stock: String(p.stock), unlimitedStock: p.unlimitedStock, active: p.active,
    featured: p.featured, popular: p.popular, hidden: p.hidden,
    minQty: String(p.minQty), maxQty: String(p.maxQty), order: String(p.order),
    benefits: p.benefits ?? [], delivery: { ...EMPTY_DELIVERY, ...p.delivery },
    seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "",
  };
}

function formToData(form: any) {
  return {
    name: form.name,
    shortDescription: form.shortDescription || undefined,
    description: form.description || undefined,
    image: form.image || undefined,
    images: form.images.filter(Boolean),
    categoryId: form.categoryId ? (form.categoryId as any) : undefined,
    tags: form.tags.filter(Boolean),
    priceCents: Math.round(parseFloat(form.price || "0") * 100),
    compareAtPriceCents: form.compareAt ? Math.round(parseFloat(form.compareAt) * 100) : undefined,
    stock: parseInt(form.stock || "0", 10),
    unlimitedStock: form.unlimitedStock,
    active: form.active,
    featured: form.featured,
    popular: form.popular,
    hidden: form.hidden,
    minQty: parseInt(form.minQty || "1", 10),
    maxQty: parseInt(form.maxQty || "99", 10),
    order: parseInt(form.order || "0", 10),
    benefits: form.benefits.filter(Boolean),
    delivery: { ...form.delivery, showToCustomer: form.delivery.showToCustomer ?? true },
    seoTitle: form.seoTitle || undefined,
    seoDescription: form.seoDescription || undefined,
  };
}

export default function AdminProducts() {
  const [search, setSearch] = useState("");
  const products = useQuery(api.products.adminList, { search: search || undefined }) as Product[] | undefined;
  const categories = useQuery(api.categories.listAll) as any[] | undefined;
  const [editing, setEditing] = useState<string | null>(null); // null = fechado, "new" = novo, id = editar
  const [form, setForm] = useState<any>(emptyForm());
  const [saving, setSaving] = useState(false);

  const detail = useQuery(
    api.products.adminGet,
    editing && editing !== "new" ? { id: editing as any } : "skip",
  ) as { product: any; variants: Variant[] } | undefined;
  const detailLoading = editing && editing !== "new" && detail === undefined;

  useEffect(() => {
    if (detail && editing && editing !== "new") setForm(toForm(detail.product));
  }, [detail, editing]);

  const create = useMutation(api.products.create);
  const update = useMutation(api.products.update);
  const remove = useMutation(api.products.remove);
  const createVariant = useMutation(api.products.createVariant);
  const updateVariant = useMutation(api.products.updateVariant);
  const removeVariant = useMutation(api.products.removeVariant);

  const openNew = () => { setForm(emptyForm()); setEditing("new"); };
  const openEdit = (id: string) => { setForm(emptyForm()); setEditing(id); };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Nome é obrigatório");
    setSaving(true);
    const data = formToData(form);
    try {
      if (editing === "new") {
        await create({ data });
        toast.success("Produto criado");
      } else if (editing) {
        await update({ id: editing as any, data });
        toast.success("Produto atualizado");
      }
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Excluir este produto? Variantes também serão removidas.")) return;
    try {
      await remove({ id: id as any });
      toast.success("Produto excluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const filtered = (products ?? []).filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const set = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));

  const addVariant = async () => {
    if (!editing || editing === "new") return;
    try {
      await createVariant({
        productId: editing as any,
        data: { name: "Nova variante", priceCents: 0, stock: 0, unlimitedStock: false, order: detail?.variants.length ?? 0, active: true },
      });
      toast.success("Variante adicionada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">Catálogo, preços, estoque e entrega automática</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 size-4" /> Novo produto</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Preço</th>
                  <th className="px-4 py-3">Estoque</th>
                  <th className="px-4 py-3">Vendas</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products === undefined && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
                )}
                {filtered.length === 0 && products !== undefined && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum produto</td></tr>
                )}
                {filtered.map((p) => (
                  <tr key={p._id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                          {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">/{p.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatBRL(p.priceCents)}</td>
                    <td className="px-4 py-3">{p.unlimitedStock ? "∞" : p.stock}</td>
                    <td className="px-4 py-3">{p.salesCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.active ? <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                        {p.featured && <Badge variant="secondary">Destaque</Badge>}
                        {p.popular && <Badge variant="secondary">Popular</Badge>}
                        {p.hidden && <Badge variant="outline">Oculto</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p._id)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-600" onClick={() => del(p._id)}><Trash2 className="size-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo produto" : "Editar produto"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="VIP 30 dias" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                  <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem categoria</SelectItem>
                    {(categories ?? []).map((c: any) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descrição curta</Label>
              <Input value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} />
            </div>

            <div>
              <Label>Descrição completa</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Imagem principal (URL)</Label>
                <Input value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Galeria (URLs separadas por vírgula)</Label>
                <Input
                  value={form.images.join(", ")}
                  onChange={(e) => set("images", e.target.value.split(",").map((s: string) => s.trim()))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Preço (R$) *</Label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} />
              </div>
              <div>
                <Label>Preço original (R$)</Label>
                <Input type="number" step="0.01" value={form.compareAt} onChange={(e) => set("compareAt", e.target.value)} placeholder="Para desconto" />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={form.order} onChange={(e) => set("order", e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Estoque</Label>
                <Input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} disabled={form.unlimitedStock} />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.unlimitedStock} onCheckedChange={(v) => set("unlimitedStock", v)} />
                  Estoque ilimitado
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Qtd. mín</Label>
                  <Input type="number" value={form.minQty} onChange={(e) => set("minQty", e.target.value)} />
                </div>
                <div>
                  <Label>Qtd. máx</Label>
                  <Input type="number" value={form.maxQty} onChange={(e) => set("maxQty", e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <Label>Benefícios (um por linha)</Label>
              <Textarea
                rows={3}
                value={form.benefits.join("\n")}
                onChange={(e) => set("benefits", e.target.value.split("\n"))}
              />
            </div>

            <div>
              <Label>Tags (separadas por vírgula)</Label>
              <Input
                value={form.tags.join(", ")}
                onChange={(e) => set("tags", e.target.value.split(",").map((s: string) => s.trim()))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-semibold">Exibição</p>
                <label className="flex items-center justify-between text-sm">
                  Ativo <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
                </label>
                <label className="flex items-center justify-between text-sm">
                  Destaque <Switch checked={form.featured} onCheckedChange={(v) => set("featured", v)} />
                </label>
                <label className="flex items-center justify-between text-sm">
                  Popular <Switch checked={form.popular} onCheckedChange={(v) => set("popular", v)} />
                </label>
                <label className="flex items-center justify-between text-sm">
                  Oculto <Switch checked={form.hidden} onCheckedChange={(v) => set("hidden", v)} />
                </label>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-semibold">Entrega automática</p>
                <Select value={form.delivery.type} onValueChange={(v) => set("delivery", { ...form.delivery, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DELIVERY_TYPE_LABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {["api", "webhook"].includes(form.delivery.type) && (
                  <Input
                    placeholder="URL do endpoint"
                    value={form.delivery.apiUrl ?? ""}
                    onChange={(e) => set("delivery", { ...form.delivery, apiUrl: e.target.value })}
                  />
                )}
                {form.delivery.type === "command" && (
                  <Textarea
                    rows={2}
                    placeholder="Comandos, um por linha (use {nick} e {produto})"
                    value={(form.delivery.commands ?? []).join("\n")}
                    onChange={(e) => set("delivery", { ...form.delivery, commands: e.target.value.split("\n") })}
                  />
                )}
                {form.delivery.type === "message" && (
                  <Textarea
                    rows={2}
                    placeholder="Mensagem entregue ao cliente"
                    value={form.delivery.message ?? ""}
                    onChange={(e) => set("delivery", { ...form.delivery, message: e.target.value })}
                  />
                )}
                {form.delivery.type === "code" && (
                  <Textarea
                    rows={2}
                    placeholder="Códigos disponíveis, um por linha"
                    value={(form.delivery.codes ?? []).join("\n")}
                    onChange={(e) => set("delivery", { ...form.delivery, codes: e.target.value.split("\n") })}
                  />
                )}
                <label className="flex items-center justify-between text-sm">
                  Mostrar entrega ao cliente
                  <Switch
                    checked={form.delivery.showToCustomer ?? true}
                    onCheckedChange={(v) => set("delivery", { ...form.delivery, showToCustomer: v })}
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>SEO Title</Label>
                <Input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} />
              </div>
              <div>
                <Label>SEO Description</Label>
                <Input value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} />
              </div>
            </div>

            {/* Variantes (somente edição) */}
            {editing && editing !== "new" && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Package className="size-4" /> Variantes
                  </p>
                  <Button size="sm" variant="outline" onClick={addVariant}>
                    <Plus className="mr-1 size-3.5" /> Adicionar
                  </Button>
                </div>
                {!detail && <Loader2 className="size-4 animate-spin" />}
                {detail && detail.variants.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma variante. O produto usa preço/estoque próprios.</p>
                )}
                <div className="space-y-3">
                  {detail?.variants.map((v) => (
                    <VariantRow
                      key={v._id}
                      variant={v}
                      onSave={async (data) => {
                        await updateVariant({ id: v._id as any, data });
                      }}
                      onRemove={async () => {
                        await removeVariant({ id: v._id as any });
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar produto
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VariantRow({
  variant, onSave, onRemove,
}: {
  variant: Variant;
  onSave: (data: any) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [name, setName] = useState(variant.name);
  const [price, setPrice] = useState((variant.priceCents / 100).toFixed(2));
  const [stock, setStock] = useState(String(variant.stock));
  const [unlimited, setUnlimited] = useState(variant.unlimitedStock);
  const [active, setActive] = useState(variant.active);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        name,
        priceCents: Math.round(parseFloat(price || "0") * 100),
        compareAtPriceCents: undefined,
        stock: parseInt(stock || "0", 10),
        unlimitedStock: unlimited,
        order: variant.order,
        active,
        sku: variant.sku,
      });
      toast.success("Variante salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_110px_90px_auto] items-end gap-2 rounded-md border p-3">
      <div>
        <Label className="text-xs">Nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Preço</Label>
        <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Estoque</Label>
        <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} disabled={unlimited} />
      </div>
      <div className="flex items-center gap-1 pb-1">
        <label className="flex items-center gap-1 text-xs" title="Ilimitado">
          <Switch checked={unlimited} onCheckedChange={setUnlimited} /> ∞
        </label>
        <label className="flex items-center gap-1 text-xs" title="Ativa">
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
        <Button size="icon" variant="ghost" onClick={save} disabled={busy}><Pencil className="size-3.5" /></Button>
        <Button size="icon" variant="ghost" className="text-red-600" onClick={onRemove}><Trash2 className="size-3.5" /></Button>
      </div>
    </div>
  );
}
