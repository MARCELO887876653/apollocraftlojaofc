import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

type Store = {
  name: string; description: string; logoUrl: string; faviconUrl: string;
  currency: string; email: string; discord: string; whatsapp: string;
  instagram: string; twitter: string; youtube: string;
  maintenance: { enabled: boolean; title: string; message: string; eta: string };
  checkoutFields: Array<{ key: string; label: string; enabled: boolean; required: boolean }>;
  seo: { title: string; description: string; ogImage: string; canonical: string };
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nome completo",
  email: "E-mail",
  discord: "Discord",
  minecraftNick: "Nickname do Minecraft",
  phone: "Telefone",
  uuid: "UUID do Minecraft",
};

export default function AdminSettings() {
  const store = useQuery(api.settings.getStoreConfig) as Store | undefined;
  const save = useMutation(api.settings.updateStore);
  const [form, setForm] = useState<Store | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (store && !form) setForm(store);
  }, [store, form]);

  if (!form) return <Loader2 className="mx-auto size-5 animate-spin" />;

  const set = (k: keyof Store, v: any) => setForm((s) => (s ? { ...s, [k]: v } : s));
  const setField = (i: number, patch: any) =>
    set("checkoutFields", form.checkoutFields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const saveAll = async () => {
    setSaving(true);
    try {
      await save({
        patch: {
        name: form.name,
        description: form.description,
        logoUrl: form.logoUrl,
        faviconUrl: form.faviconUrl,
        email: form.email,
        discord: form.discord,
        whatsapp: form.whatsapp,
        instagram: form.instagram,
        twitter: form.twitter,
        youtube: form.youtube,
        maintenance: form.maintenance,
        checkoutFields: form.checkoutFields,
        seo: { ...form.seo, ogImage: form.seo.ogImage || undefined, canonical: form.seo.canonical || undefined },
        },
      });
      toast.success("Configurações salvas!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Identidade, checkout, SEO e manutenção</p>
        </div>
        <Button onClick={saveAll} disabled={saving}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar tudo
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Identidade da loja</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nome da loja</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div>
            <Label>URL do logo</Label>
            <Input value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>URL do favicon</Label>
            <Input value={form.faviconUrl} onChange={(e) => set("faviconUrl", e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>E-mail de contato</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>Moeda</Label>
            <Input value={form.currency} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Redes sociais e comunidade</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Convite do Discord</Label>
            <Input value={form.discord} onChange={(e) => set("discord", e.target.value)} placeholder="https://discord.gg/..." />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="https://wa.me/55..." />
          </div>
          <div>
            <Label>Instagram</Label>
            <Input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />
          </div>
          <div>
            <Label>YouTube</Label>
            <Input value={form.youtube} onChange={(e) => set("youtube", e.target.value)} />
          </div>
          <div>
            <Label>Twitter/X</Label>
            <Input value={form.twitter} onChange={(e) => set("twitter", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos do checkout</CardTitle>
          <p className="text-sm text-muted-foreground">
            Escolha quais dados o cliente informa na finalização e quais são obrigatórios.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {form.checkoutFields.map((f, i) => (
            <div key={f.key} className="flex flex-wrap items-center gap-4 rounded-lg border px-4 py-3">
              <span className="w-48 text-sm font-medium">{FIELD_LABELS[f.key] ?? f.label}</span>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={f.enabled} onCheckedChange={(v) => setField(i, { enabled: v })} />
                Visível
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={f.required}
                  onCheckedChange={(v) => setField(i, { required: v, enabled: v ? true : f.enabled })}
                  disabled={!f.enabled}
                />
                Obrigatório
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">SEO</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Título (title tag)</Label>
            <Input value={form.seo.title} onChange={(e) => set("seo", { ...form.seo, title: e.target.value })} />
          </div>
          <div>
            <Label>Imagem Open Graph (URL)</Label>
            <Input value={form.seo.ogImage ?? ""} onChange={(e) => set("seo", { ...form.seo, ogImage: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Meta description</Label>
            <Input value={form.seo.description} onChange={(e) => set("seo", { ...form.seo, description: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Modo manutenção</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between text-sm">
            Ativar manutenção (loja fechada para clientes)
            <Switch checked={form.maintenance.enabled} onCheckedChange={(v) => set("maintenance", { ...form.maintenance, enabled: v })} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Título</Label>
              <Input value={form.maintenance.title} onChange={(e) => set("maintenance", { ...form.maintenance, title: e.target.value })} />
            </div>
            <div>
              <Label>Previsão de retorno</Label>
              <Input value={form.maintenance.eta} onChange={(e) => set("maintenance", { ...form.maintenance, eta: e.target.value })} placeholder="em 2 horas" />
            </div>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Input value={form.maintenance.message} onChange={(e) => set("maintenance", { ...form.maintenance, message: e.target.value })} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
