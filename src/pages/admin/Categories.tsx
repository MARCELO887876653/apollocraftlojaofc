import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, ChevronUp, ChevronDown } from "lucide-react";

type Category = {
  _id: string; name: string; slug: string; description?: string; icon?: string;
  color?: string; parentId?: string; order: number; active: boolean;
};

export default function AdminCategories() {
  const categories = useQuery(api.categories.listAll) as Category[] | undefined;
  const [editing, setEditing] = useState<{ id: string | null; data: any } | null>(null);
  const [saving, setSaving] = useState(false);

  const create = useMutation(api.categories.create);
  const update = useMutation(api.categories.update);
  const remove = useMutation(api.categories.remove);
  const reorder = useMutation(api.categories.reorder);

  const roots = (categories ?? []).filter((c) => !c.parentId);
  const subsOf = (id: string) => (categories ?? []).filter((c) => c.parentId === id);

  const openNew = () => setEditing({ id: null, data: { name: "", description: "", icon: "", color: "", parentId: "", active: true } });
  const openEdit = (c: Category) =>
    setEditing({
      id: c._id,
      data: {
        name: c.name, description: c.description ?? "", icon: c.icon ?? "",
        color: c.color ?? "", parentId: c.parentId ?? "", active: c.active,
      },
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.data.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const data = {
      name: editing.data.name,
      description: editing.data.description || undefined,
      icon: editing.data.icon || undefined,
      color: editing.data.color || undefined,
      parentId: editing.data.parentId ? (editing.data.parentId as any) : undefined,
      order: editing.id ? (categories?.find((c) => c._id === editing.id)?.order ?? 0) : (categories?.length ?? 0),
      active: editing.data.active,
    };
    try {
      if (editing.id) {
        await update({ id: editing.id as any, data });
        toast.success("Categoria atualizada");
      } else {
        await create({ data });
        toast.success("Categoria criada");
      }
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Excluir categoria?")) return;
    try {
      await remove({ id: id as any });
      toast.success("Categoria excluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const move = async (c: Category, dir: -1 | 1) => {
    const siblings = c.parentId ? subsOf(c.parentId) : roots;
    const idx = siblings.findIndex((s) => s._id === c._id);
    const swapWith = siblings[idx + dir];
    if (!swapWith) return;
    const ids = siblings.map((s) => s._id);
    const a = ids.indexOf(c._id);
    const b = ids.indexOf(swapWith._id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    try {
      await reorder({ ids: ids as any[] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reordenar");
    }
  };

  const set = (k: string, v: any) =>
    setEditing((s) => (s ? { ...s, data: { ...s.data, [k]: v } } : s));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
          <p className="text-sm text-muted-foreground">Organize o catálogo com categorias e subcategorias</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 size-4" /> Nova categoria</Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          {categories === undefined && <Loader2 className="mx-auto size-5 animate-spin" />}
          {categories !== undefined && categories.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma categoria criada</p>
          )}
          {roots.map((c) => (
            <div key={c._id}>
              <Row category={c} onEdit={() => openEdit(c)} onDelete={() => del(c._id)} onMove={(d) => move(c, d)} isFirst={roots[0]._id === c._id} isLast={roots[roots.length - 1]._id === c._id} />
              <div className="ml-8 space-y-2 border-l pl-4">
                {subsOf(c._id).map((s) => (
                  <Row key={s._id} category={s} onEdit={() => openEdit(s)} onDelete={() => del(s._id)} onMove={(d) => move(s, d)} isFirst={subsOf(c._id)[0]._id === s._id} isLast={subsOf(c._id)[subsOf(c._id).length - 1]._id === s._id} />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={editing.data.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={editing.data.description} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ícone (emoji)</Label>
                  <Input value={editing.data.icon} onChange={(e) => set("icon", e.target.value)} placeholder="🎮" />
                </div>
                <div>
                  <Label>Cor</Label>
                  <input
                    type="color"
                    value={editing.data.color || "#7c3aed"}
                    onChange={(e) => set("color", e.target.value)}
                    className="h-9 w-full cursor-pointer rounded-md border"
                  />
                </div>
              </div>
              <div>
                <Label>Categoria pai</Label>
                <Select value={editing.data.parentId} onValueChange={(v) => set("parentId", v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma (nível principal)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhuma (nível principal)</SelectItem>
                    {(categories ?? [])
                      .filter((c) => !c.parentId && c._id !== editing.id)
                      .map((c) => (
                        <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between text-sm">
                Ativa <Switch checked={editing.data.active} onCheckedChange={(v) => set("active", v)} />
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

function Row({
  category, onEdit, onDelete, onMove, isFirst, isLast,
}: {
  category: Category; onEdit: () => void; onDelete: () => void;
  onMove: (dir: -1 | 1) => void; isFirst: boolean; isLast: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      {category.icon && <span className="text-lg">{category.icon}</span>}
      {category.color && <span className="size-3 rounded-full" style={{ backgroundColor: category.color }} />}
      <div className="flex-1">
        <p className="text-sm font-medium">{category.name}</p>
        <p className="text-xs text-muted-foreground">/{category.slug}</p>
      </div>
      {!category.active && <Badge variant="outline">Inativa</Badge>}
      <div className="flex items-center">
        <Button variant="ghost" size="icon" className="size-7" disabled={isFirst} onClick={() => onMove(-1)}>
          <ChevronUp className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" disabled={isLast} onClick={() => onMove(1)}>
          <ChevronDown className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}><Pencil className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-7 text-red-600" onClick={onDelete}><Trash2 className="size-3.5" /></Button>
      </div>
    </div>
  );
}
