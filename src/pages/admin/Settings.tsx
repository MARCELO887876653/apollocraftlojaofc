import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

type Store = {
  name: string; description: string; logoUrl: string; faviconUrl: string;
  currency: string; email: string; serverIp?: string; discord: string; whatsapp: string;
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
  const subscribers = useQuery(api.maintenance.stats);
  const save = useMutation(api.settings.updateStore);
  const removeSubscriber = useMutation(api.maintenance.remove);
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
        serverIp: form.serverIp ?? "",
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
          <ImageUpload
            label="Logo da loja"
            value={form.logoUrl || undefined}
            onChange={(v) => set("logoUrl", v ?? "")}
          />
          <ImageUpload
            label="Favicon"
            value={form.faviconUrl || undefined}
            onChange={(v) => set("faviconUrl", v ?? "")}
          />
          <div>
            <Label>E-mail de contato</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>IP do servidor Minecraft</Label>
            <Input
              value={form.serverIp ?? ""}
              onChange={(e) => set("serverIp", e.target.value)}
              placeholder="apollo.srvmc.com:19132"
            />
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
          <ImageUpload
            label="Imagem Open Graph (compartilhamento)"
            value={form.seo.ogImage || undefined}
            onChange={(v) => set("seo", { ...form.seo, ogImage: v ?? "" })}
          />
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
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-bold">Avisos de retorno por e-mail</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscribers
                ? `${subscribers.pending} e-mail(s) aguardando o aviso · ${subscribers.total} cadastrado(s) no total.`
                : "Carregando..."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Ao desativar a manutenção, quem deixou o e-mail na loja recebe automaticamente o aviso de que ela voltou.
            </p>
            {subscribers && subscribers.subscribers.length > 0 && (
              <div className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {subscribers.subscribers.map((s) => (
                  <div key={s.email} className="flex items-center justify-between gap-2">
                    <span className="truncate">{s.email}</span>
                    <span className={s.notifiedAt ? "text-emerald-500" : "text-amber-400"}>
                      {s.notifiedAt ? "avisado" : "aguardando"}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover ${s.email}`}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-red-400"
                      onClick={async () => {
                        try {
                          await removeSubscriber({ email: s.email });
                          toast.success("E-mail removido da lista.");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Não foi possível remover");
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
