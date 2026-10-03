import { useEffect, useRef, useState } from "react";
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
import { ImageUpload } from "@/components/admin/ImageUpload";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search, Package, ImagePlus, X, MoreVertical, GripVertical, ChevronDown, Terminal, Plug } from "lucide-react";

type Product = {
  _id: string; name: string; slug: string; image?: string;
  priceCents: number; compareAtPriceCents?: number; stock: number; unlimitedStock: boolean;
  active: boolean; featured: boolean; popular: boolean; hidden: boolean;
  salesCount: number; categoryId?: string; delivery: { type: string };
  status?: string; externalId?: string;
  createdSource?: string; sourceServerId?: string; sourceAddonId?: string;
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
    delivery: EMPTY_DELIVERY as any,
    deliveryV1: { enabled: false, actions: [] as any[] },
    seoTitle: "", seoDescription: "",
  };
}

/** Atualiza uma ação da entrega automática v1 no formulário. */
function updateV1Action(setForm: any, index: number, patch: any) {
  setForm((s: any) => ({
    ...s,
    deliveryV1: {
      ...s.deliveryV1,
      actions: s.deliveryV1.actions.map((a: any, j: number) =>
        j === index ? { ...a, ...patch } : a,
      ),
    },
  }));
}

/** Converte um texto JSON em objeto (vazio → undefined). Lança em JSON inválido. */
function parseJsonField(text?: string): any {
  if (!text || !text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON inválido no payload de uma ação de entrega automática");
  }
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
    deliveryV1: p.deliveryV1
      ? {
          enabled: p.deliveryV1.enabled,
          actions: (p.deliveryV1.actions ?? []).map((a: any) => ({
            action: a.action ?? "",
            command: a.command ?? "",
            addonId: a.addonId ?? "",
            serverId: a.serverId ?? "",
            offlineExecute: a.offlineExecute ?? true,
            delaySeconds: a.delaySeconds != null ? String(a.delaySeconds) : "",
            payloadText: a.payload != null ? JSON.stringify(a.payload, null, 2) : "",
            reverseAction: a.reverseAction ?? "",
            reversePayloadText: a.reversePayload != null ? JSON.stringify(a.reversePayload, null, 2) : "",
            reverseDelaySeconds: a.reverseDelaySeconds != null ? String(a.reverseDelaySeconds) : "",
          })),
        }
      : { enabled: false, actions: [] },
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
    delivery: {
      ...form.delivery,
      showToCustomer: form.delivery.showToCustomer ?? true,
      commands: form.delivery.type === "command"
        ? (form.delivery.commands ?? []).map((s: string) => s.trim()).filter(Boolean)
        : form.delivery.commands,
    },
    deliveryV1: form.deliveryV1?.enabled
      ? {
          enabled: true,
          actions: (form.deliveryV1.actions ?? [])
            .map((a: any) => ({
              action: (a.action ?? "").trim(),
              command: a.command?.trim() || undefined,
              payload: parseJsonField(a.payloadText),
              serverId: a.serverId?.trim() || undefined,
              addonId: a.addonId?.trim() || undefined,
              offlineExecute: a.offlineExecute ?? true,
              delaySeconds: a.delaySeconds ? Number(a.delaySeconds) : undefined,
              reverseAction: a.reverseAction?.trim() || undefined,
              reversePayload: parseJsonField(a.reversePayloadText),
              reverseDelaySeconds: a.reverseDelaySeconds ? Number(a.reverseDelaySeconds) : undefined,
            }))
            .filter((a: any) => a.action),
        }
      : { enabled: false, actions: [] },
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

  // Agrupa produtos por categoria (estilo CentralCart)
  const groups: Array<{ key: string; name: string; items: Product[] }> = [];
  if (products !== undefined) {
    const byId = new Map<string, Product[]>();
    for (const p of filtered) {
      const key = p.categoryId ?? "none";
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key)!.push(p);
    }
    for (const c of categories ?? []) {
      const items = byId.get(c._id);
      if (items?.length) {
        groups.push({ key: c._id, name: c.name, items });
        byId.delete(c._id);
      }
    }
    for (const [key, items] of byId) {
      groups.push({ key, name: "Sem categoria", items });
    }
  }

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Pacotes</h1>
        <p className="text-sm text-muted-foreground">Crie ou altere os produtos que deseja vender na sua loja.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openNew} variant="white" className="rounded-full font-bold">
          <Plus className="size-4" /> Novo pacote
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar pacote" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl pl-9" />
        </div>
      </div>

      {products === undefined && (
        <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      )}

      {products !== undefined && filtered.length === 0 && (
        <div className="rounded-2xl border bg-card py-12 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado.
        </div>
      )}

      <div className="space-y-4">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.key];
          return (
            <div key={g.key} className="overflow-hidden rounded-2xl border bg-card">
              <button
                className="flex w-full items-center gap-3 border-b bg-muted/40 px-4 py-3.5 text-left"
                onClick={() => setCollapsed((s) => ({ ...s, [g.key]: !s[g.key] }))}
              >
                <GripVertical className="size-4.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-lg font-extrabold uppercase tracking-tight">{g.name}</span>
                <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-xs font-bold text-sky-500">Categoria</span>
                <ChevronDown className={"size-4.5 text-muted-foreground transition-transform " + (isCollapsed ? "" : "rotate-180")} />
              </button>
              {!isCollapsed && (
                <div>
                  {g.items.map((p, i) => (
                    <div
                      key={p._id}
                      className={"flex items-center gap-3 px-4 py-3 " + (i > 0 ? "border-t" : "")}
                    >
                      <GripVertical className="size-4 shrink-0 text-muted-foreground/60" />
                      <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <button
                        className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold hover:underline"
                        onClick={() => openEdit(p._id)}
                      >
                        {p.name} - <span className="font-extrabold">{formatBRL(p.priceCents)}</span>
                        {!p.active && <Badge variant="outline" className="ml-2">Inativo</Badge>}
                        {p.featured && <Badge variant="secondary" className="ml-2">Destaque</Badge>}
                        {p.hidden && <Badge variant="outline" className="ml-2">Oculto</Badge>}
                        {p.createdSource === "MINECRAFT_ADDON" && (
                          <Badge variant="outline" className="ml-2 border-sky-500/40 text-sky-400">
                            Addon
                          </Badge>
                        )}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" aria-label="Opções" className="rounded-lg">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p._id)}>
                            <Pencil className="size-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => del(p._id)} className="text-red-500">
                            <Trash2 className="size-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo produto" : "Editar produto"}</DialogTitle>
          </DialogHeader>

          {editing !== "new" && detail?.product?.createdSource && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Origem:{" "}
              <strong>
                {detail.product.createdSource === "MINECRAFT_ADDON"
                  ? "Minecraft Addon"
                  : detail.product.createdSource === "API"
                    ? "API"
                    : "Painel"}
              </strong>
              {detail.product.sourceServerId ? ` · Servidor: ${detail.product.sourceServerId}` : ""}
              {detail.product.sourceAddonId ? ` · Addon: ${detail.product.sourceAddonId}` : ""}
              {detail.product.status ? ` · Status: ${detail.product.status}` : ""}
            </div>
          )}

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
              <ImageUpload
                label="Imagem principal"
                value={form.image || undefined}
                onChange={(v) => set("image", v ?? "")}
              />
              <GalleryField images={form.images} onChange={(imgs) => set("images", imgs)} />
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
                  <p className="text-xs text-muted-foreground">
                    Os comandos são enviados ao servidor via Integrações → Minecraft quando o pagamento confirma.
                  </p>
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

            {form.delivery.type === "command" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Terminal className="size-4 text-sky-400" /> Comandos
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Configure os comandos que serão executados neste pacote.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(form.delivery.commands ?? []).length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
                      <span className="flex size-14 items-center justify-center rounded-full bg-muted">
                        <Terminal className="size-6 text-muted-foreground" />
                      </span>
                      <div>
                        <p className="font-bold">Nenhum comando configurado</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Adicione comandos automáticos após a confirmação da compra.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => set("delivery", { ...form.delivery, commands: ["/kit {nick}"] })}
                      >
                        <Plus className="mr-2 size-4" /> Novo comando
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {(form.delivery.commands ?? []).map((cmd: string, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                              <Terminal className="size-4" />
                            </span>
                            <Input
                              className="font-mono text-sm"
                              placeholder="/kit {nick}"
                              value={cmd}
                              onChange={(e) =>
                                set("delivery", {
                                  ...form.delivery,
                                  commands: (form.delivery.commands ?? []).map((c: string, j: number) => (j === i ? e.target.value : c)),
                                })
                              }
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="shrink-0 text-red-600"
                              aria-label="Remover comando"
                              onClick={() =>
                                set("delivery", {
                                  ...form.delivery,
                                  commands: (form.delivery.commands ?? []).filter((_: string, j: number) => j !== i),
                                })
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => set("delivery", { ...form.delivery, commands: [...(form.delivery.commands ?? []), ""] })}
                      >
                        <Plus className="mr-2 size-4" /> Novo comando
                      </Button>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Variáveis: <code className="rounded bg-muted px-1 font-mono">{"{nick}"}</code>{" "}
                    <code className="rounded bg-muted px-1 font-mono">{"{produto}"}</code>{" "}
                    <code className="rounded bg-muted px-1 font-mono">{"{quantidade}"}</code>{" "}
                    <code className="rounded bg-muted px-1 font-mono">{"{pedido}"}</code> — executados no servidor quando o jogador estiver online.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plug className="size-4 text-sky-400" /> Entrega automática (API v1)
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Cria entregas na fila da sua API quando o pagamento é aprovado. Use qualquer{" "}
                  <code className="rounded bg-muted px-1 font-mono">action</code> + payload JSON.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center justify-between text-sm">
                  Ativar entrega automática
                  <Switch
                    checked={form.deliveryV1?.enabled ?? false}
                    onCheckedChange={(v) =>
                      setForm((s: any) => ({ ...s, deliveryV1: { ...s.deliveryV1, enabled: v } }))
                    }
                  />
                </label>

                {form.deliveryV1?.enabled && (
                  <>
                    {(form.deliveryV1.actions ?? []).map((a: any, i: number) => (
                      <div key={i} className="space-y-3 rounded-xl border p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase text-muted-foreground">
                            Ação {i + 1}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-red-600"
                            aria-label="Remover ação"
                            onClick={() =>
                              setForm((s: any) => ({
                                ...s,
                                deliveryV1: {
                                  ...s.deliveryV1,
                                  actions: s.deliveryV1.actions.filter((_: any, j: number) => j !== i),
                                },
                              }))
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <Label className="text-xs">Ação *</Label>
                            <Input
                              className="font-mono text-sm"
                              placeholder="ADD_MONEY"
                              value={a.action}
                              onChange={(e) => updateV1Action(setForm, i, { action: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Addon</Label>
                            <Input
                              placeholder="economy"
                              value={a.addonId}
                              onChange={(e) => updateV1Action(setForm, i, { addonId: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Servidor</Label>
                            <Input
                              placeholder="GLOBAL"
                              value={a.serverId}
                              onChange={(e) => updateV1Action(setForm, i, { serverId: e.target.value })}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Payload (JSON)</Label>
                          <Textarea
                            rows={3}
                            className="font-mono text-sm"
                            placeholder={'{ "amount": 10000 }'}
                            value={a.payloadText}
                            onChange={(e) => updateV1Action(setForm, i, { payloadText: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Comando (opcional)</Label>
                          <Input
                            className="font-mono text-sm"
                            placeholder="money add {nickname} 10000"
                            value={a.command}
                            onChange={(e) => updateV1Action(setForm, i, { command: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs">Executar após (segundos)</Label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={a.delaySeconds}
                              onChange={(e) => updateV1Action(setForm, i, { delaySeconds: e.target.value })}
                            />
                          </div>
                          <label className="flex items-end gap-2 pb-2 text-sm">
                            <Switch
                              checked={a.offlineExecute}
                              onCheckedChange={(v) => updateV1Action(setForm, i, { offlineExecute: v })}
                            />
                            Executar com jogador offline
                          </label>
                        </div>
                        <div className="grid gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-3">
                          <div>
                            <Label className="text-xs">Ação de reversão</Label>
                            <Input
                              className="font-mono text-sm"
                              placeholder="REMOVE_RANK"
                              value={a.reverseAction}
                              onChange={(e) => updateV1Action(setForm, i, { reverseAction: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Payload da reversão</Label>
                            <Input
                              className="font-mono text-sm"
                              placeholder='{ "rank": "ouro" }'
                              value={a.reversePayloadText}
                              onChange={(e) => updateV1Action(setForm, i, { reversePayloadText: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Reverter após (seg)</Label>
                            <Input
                              type="number"
                              placeholder="2592000"
                              value={a.reverseDelaySeconds}
                              onChange={(e) => updateV1Action(setForm, i, { reverseDelaySeconds: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setForm((s: any) => ({
                          ...s,
                          deliveryV1: {
                            ...s.deliveryV1,
                            actions: [
                              ...s.deliveryV1.actions,
                              {
                                action: "",
                                command: "",
                                addonId: "",
                                serverId: "",
                                offlineExecute: true,
                                delaySeconds: "",
                                payloadText: "",
                                reverseAction: "",
                                reversePayloadText: "",
                                reverseDelaySeconds: "",
                              },
                            ],
                          },
                        }))
                      }
                    >
                      <Plus className="mr-2 size-4" /> Nova ação
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

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

function GalleryField({
  images, onChange,
}: {
  images: string[];
  onChange: (imgs: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const finalizeUpload = useMutation(api.files.finalizeUpload);

  const upload = async (files: FileList) => {
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`"${file.name}" passa de 5 MB e foi ignorada`);
          continue;
        }
        const postUrl = await generateUploadUrl();
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Falha no envio da imagem");
        const { storageId } = (await res.json()) as { storageId: string };
        const { url } = await finalizeUpload({ storageId: storageId as any });
        uploaded.push(url);
      }
      if (uploaded.length) {
        onChange([...images.filter(Boolean), ...uploaded]);
        toast.success(`${uploaded.length} foto(s) adicionada(s)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Galeria de fotos</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        {images.filter(Boolean).map((url, i) => (
          <div key={i} className="group relative size-16 overflow-hidden rounded-md border bg-muted">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Remover foto"
              className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => onChange(images.filter((_, idx) => idx !== i))}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex size-16 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          aria-label="Adicionar fotos"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        </button>
      </div>
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => {
          const url = prompt("URL da imagem:");
          if (url) onChange([...images.filter(Boolean), url.trim()]);
        }}
      >
        + URL manual
      </button>
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
