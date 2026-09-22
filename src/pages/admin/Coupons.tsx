import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Ticket } from "lucide-react";

type Coupon = {
  _id: string; code: string; type: "percent" | "fixed"; value: number;
  minSubtotalCents?: number; maxDiscountCents?: number; maxUses?: number;
  maxUsesPerCustomer?: number; endsAt?: number; active: boolean; usesCount: number;
  totalDiscountCents: number;
};

export default function AdminCoupons() {
  const coupons = useQuery(api.coupons.listAll) as Coupon[] | undefined;
  const [editing, setEditing] = useState<{ id: string | null; data: any } | null>(null);
  const [saving, setSaving] = useState(false);

  const create = useMutation(api.coupons.create);
  const update = useMutation(api.coupons.update);
  const remove = useMutation(api.coupons.remove);

  const openNew = () =>
    setEditing({
      id: null,
      data: {
        code: "", type: "percent", value: "10", minSubtotal: "", maxDiscount: "",
        maxUses: "", maxUsesPerCustomer: "", endsAt: "", active: true,
      },
    });

  const openEdit = (c: Coupon) =>
    setEditing({
      id: c._id,
      data: {
        code: c.code, type: c.type, value: c.type === "percent" ? String(c.value) : (c.value / 100).toFixed(2),
        minSubtotal: c.minSubtotalCents ? (c.minSubtotalCents / 100).toFixed(2) : "",
        maxDiscount: c.maxDiscountCents ? (c.maxDiscountCents / 100).toFixed(2) : "",
        maxUses: c.maxUses ? String(c.maxUses) : "",
        maxUsesPerCustomer: c.maxUsesPerCustomer ? String(c.maxUsesPerCustomer) : "",
        endsAt: c.endsAt ? new Date(c.endsAt).toISOString().slice(0, 10) : "",
        active: c.active,
      },
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.data.code.trim()) return toast.error("Código obrigatório");
    setSaving(true);
    const data: any = {
      code: editing.data.code.trim().toUpperCase(),
      type: editing.data.type,
      value:
        editing.data.type === "percent"
          ? parseInt(editing.data.value || "0", 10)
          : Math.round(parseFloat(editing.data.value || "0") * 100),
      minSubtotalCents: editing.data.minSubtotal ? Math.round(parseFloat(editing.data.minSubtotal) * 100) : undefined,
      maxDiscountCents: editing.data.maxDiscount ? Math.round(parseFloat(editing.data.maxDiscount) * 100) : undefined,
      maxUses: editing.data.maxUses ? parseInt(editing.data.maxUses, 10) : undefined,
      maxUsesPerCustomer: editing.data.maxUsesPerCustomer ? parseInt(editing.data.maxUsesPerCustomer, 10) : undefined,
      endsAt: editing.data.endsAt ? new Date(editing.data.endsAt + "T23:59:59").getTime() : undefined,
      active: editing.data.active,
    };
    try {
      if (editing.id) {
        await update({ id: editing.id as any, data });
        toast.success("Cupom atualizado");
      } else {
        await create({ data });
        toast.success("Cupom criado");
      }
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Excluir cupom?")) return;
    try {
      await remove({ id: id as any });
      toast.success("Cupom excluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const set = (k: string, v: any) =>
    setEditing((s) => (s ? { ...s, data: { ...s.data, [k]: v } } : s));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cupons</h1>
          <p className="text-sm text-muted-foreground">Descontos percentuais ou fixos com limites e validade</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 size-4" /> Novo cupom</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Desconto</th>
                <th className="px-4 py-3">Usos</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {coupons === undefined && (
                <tr><td colSpan={6} className="px-4 py-8 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
              )}
              {coupons?.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum cupom</td></tr>
              )}
              {coupons?.map((c) => (
                <tr key={c._id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-mono font-semibold">
                      <Ticket className="size-4 text-primary" /> {c.code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.type === "percent" ? `${c.value}%` : formatBRL(c.value)}
                  </td>
                  <td className="px-4 py-3">
                    {c.usesCount}{c.maxUses ? ` / ${c.maxUses}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.endsAt ? new Date(c.endsAt).toLocaleDateString("pt-BR") : "Sem prazo"}
                  </td>
                  <td className="px-4 py-3">
                    {c.active ? <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-red-600" onClick={() => del(c._id)}><Trash2 className="size-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar cupom" : "Novo cupom"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Código *</Label>
                  <Input
                    value={editing.data.code}
                    onChange={(e) => set("code", e.target.value.toUpperCase())}
                    className="font-mono uppercase"
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={editing.data.type} onValueChange={(v) => set("type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentual (%)</SelectItem>
                      <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{editing.data.type === "percent" ? "Percentual (%)" : "Valor (R$)"}</Label>
                <Input type="number" step="0.01" value={editing.data.value} onChange={(e) => set("value", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Pedido mínimo (R$)</Label>
                  <Input type="number" step="0.01" value={editing.data.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} />
                </div>
                <div>
                  <Label>Desconto máx (R$)</Label>
                  <Input type="number" step="0.01" value={editing.data.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Máx. de usos</Label>
                  <Input type="number" value={editing.data.maxUses} onChange={(e) => set("maxUses", e.target.value)} placeholder="Ilimitado" />
                </div>
                <div>
                  <Label>Máx. por cliente</Label>
                  <Input type="number" value={editing.data.maxUsesPerCustomer} onChange={(e) => set("maxUsesPerCustomer", e.target.value)} placeholder="Ilimitado" />
                </div>
              </div>
              <div>
                <Label>Válido até</Label>
                <Input type="date" value={editing.data.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
              </div>
              <label className="flex items-center justify-between text-sm">
                Ativo <Switch checked={editing.data.active} onCheckedChange={(v) => set("active", v)} />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
