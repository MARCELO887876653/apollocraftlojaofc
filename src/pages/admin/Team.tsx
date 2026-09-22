import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Pencil, Loader2, ShieldCheck, Trash2 } from "lucide-react";

type Member = {
  _id: string; email: string; name: string; role: string;
  permissions: string[]; active: boolean; createdAt: number; lastLoginAt?: number;
};

const PERMISSION_LABELS: Record<string, string> = {
  "orders.view": "Ver pedidos",
  "orders.manage": "Gerenciar pedidos",
  "products.manage": "Gerenciar produtos",
  "categories.manage": "Gerenciar categorias",
  "customers.view": "Ver clientes",
  "coupons.manage": "Gerenciar cupons",
  "content.manage": "Gerenciar conteúdo",
  "appearance.manage": "Gerenciar aparência",
  "settings.manage": "Configurações da loja",
  "integrations.manage": "Gerenciar integrações",
  "deliveries.view": "Ver entregas",
  "deliveries.manage": "Gerenciar entregas",
  "team.manage": "Gerenciar equipe",
  "logs.view": "Ver auditoria",
  "finance.view": "Ver finanças",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Administrador",
  manager: "Gerente",
  support: "Suporte",
  custom: "Personalizado",
};

export default function AdminTeam() {
  const members = useQuery(api.team.list) as Member[] | undefined;
  const [editing, setEditing] = useState<{ id: string | null; email: string; name: string; role: string; permissions: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const upsert = useMutation(api.team.upsert);
  const setActive = useMutation(api.team.setActive);
  const remove = useMutation(api.team.remove);

  const openNew = () => setEditing({ id: null, email: "", name: "", role: "support", permissions: [] });
  const openEdit = (m: Member) =>
    setEditing({ id: m._id, email: m.email, name: m.name, role: m.role === "owner" ? "owner" : ROLE_LABELS[m.role] ? m.role : "custom", permissions: m.permissions });

  const save = async () => {
    if (!editing) return;
    if (!editing.email.trim() || !editing.name.trim()) return toast.error("Nome e e-mail obrigatórios");
    setSaving(true);
    try {
      await upsert({
        email: editing.email,
        name: editing.name,
        role: editing.role,
        permissions: editing.role === "custom" ? editing.permissions : undefined,
      });
      toast.success("Membro salvo. Ele deve entrar na plataforma com este e-mail para ganhar acesso.");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: Member) => {
    try {
      await setActive({ id: m._id as any, active: !m.active });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const del = async (m: Member) => {
    if (!confirm(`Remover ${m.name}?`)) return;
    try {
      await remove({ id: m._id as any });
      toast.success("Membro removido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
          <p className="text-sm text-muted-foreground">Papéis e permissões da administração</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 size-4" /> Convidar</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Membro</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Permissões</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members === undefined && (
                <tr><td colSpan={5} className="px-4 py-8 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
              )}
              {members?.map((m) => (
                <tr key={m._id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {m.role === "owner" ? "Todas" : `${m.permissions.length} permissões`}
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch checked={m.active} onCheckedChange={() => toggleActive(m)} disabled={m.role === "owner"} />
                      {m.active ? "Ativo" : "Inativo"}
                    </label>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.role !== "owner" && (
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-600" onClick={() => del(m)}><Trash2 className="size-4" /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        O membro precisa criar conta (ou entrar) na plataforma usando o e-mail cadastrado para acessar o painel.
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar membro" : "Convidar membro"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail *</Label>
                  <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Papel</Label>
                <Select value={editing.role} onValueChange={(v) => setEditing({ ...editing, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editing.role === "custom" && (
                <div className="rounded-lg border p-3">
                  <Label className="mb-2 block">Permissões</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PERMISSION_LABELS).map(([perm, label]) => (
                      <label key={perm} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={editing.permissions.includes(perm)}
                          onCheckedChange={(checked) =>
                            setEditing({
                              ...editing,
                              permissions: checked
                                ? [...editing.permissions, perm]
                                : editing.permissions.filter((p) => p !== perm),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
