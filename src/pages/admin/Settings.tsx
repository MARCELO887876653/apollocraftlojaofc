import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { LinkPreviewCard } from "@/components/admin/LinkPreviewCard";
import { PublishedShareStatus } from "@/components/admin/PublishedShareStatus";
import { buildShareMeta } from "@/convex/lib/seo";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

/**
 * Tamanho real da imagem da capa, para avisar quando ela é pequena/quadrada —
 * o Discord mostra a imagem de ponta a ponta apenas com capas largas.
 */
function useImageSize(url?: string) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!url) {
      setSize(null);
      return;
    }
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (alive) setSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (alive) setSize(null);
    };
    image.src = url;
    return () => {
      alive = false;
    };
  }, [url]);

  return size;
}

type Store = {
  name: string; description: string; logoUrl: string; faviconUrl: string;
  currency: string; email: string; serverIp?: string; discord: string; whatsapp: string;
  instagram: string; twitter: string; youtube: string;
  maintenance: { enabled: boolean; title: string; message: string; eta: string };
  checkoutFields: Array<{ key: string; label: string; enabled: boolean; required: boolean }>;
  seo: {
    title: string;
    description: string;
    ogImage: string;
    ogImageAnimated?: boolean;
    siteName?: string;
    themeColor?: string;
    canonical: string;
  };
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

  // A MESMA função que o servidor usa para montar a bio do link: a prévia do
  // painel não pode divergir do que sai publicado.
  const previewMeta = useMemo(
    () =>
      buildShareMeta(
        form
          ? {
              name: form.name,
              description: form.description,
              logoUrl: form.logoUrl,
              seo: form.seo,
            }
          : null,
      ),
    [form],
  );

  // Bio que está SALVA no servidor (não a do formulário): é o que o build vai
  // gravar no HTML publicado, então é com ela que a verificação compara.
  const savedMeta = useMemo(
    () =>
      buildShareMeta(
        store
          ? {
              name: store.name,
              description: store.description,
              logoUrl: store.logoUrl,
              seo: store.seo,
            }
          : null,
      ),
    [store],
  );

  const coverSize = useImageSize(form?.seo.ogImage);

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
        seo: {
          title: form.seo.title,
          description: form.seo.description,
          ogImage: form.seo.ogImage || undefined,
          ogImageAnimated: Boolean(form.seo.ogImageAnimated),
          siteName: form.seo.siteName || undefined,
          themeColor: form.seo.themeColor || undefined,
          canonical: form.seo.canonical || undefined,
        },
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
        <CardHeader>
          <CardTitle className="text-base">Bio do link</CardTitle>
          <p className="text-sm text-muted-foreground">
            O card que aparece quando alguém cola o endereço da loja no Discord, WhatsApp ou
            Telegram — aceita imagem e GIF animado.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label>Título do link</Label>
              <Input
                maxLength={70}
                value={form.seo.title}
                onChange={(e) => set("seo", { ...form.seo, title: e.target.value })}
                placeholder="Apollo Craft — Loja Oficial"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {form.seo.title.length}/70 · aparece em negrito, como link.
              </p>
            </div>

            <div>
              <Label>Descrição</Label>
              <Input
                maxLength={200}
                value={form.seo.description}
                onChange={(e) => set("seo", { ...form.seo, description: e.target.value })}
                placeholder="Compre VIPs, cash e upgrades com entrega automática…"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {form.seo.description.length}/200 · duas ou três linhas do que a loja entrega.
              </p>
            </div>

            <ImageUpload
              label="Capa do link (imagem ou GIF)"
              aspect="wide"
              value={form.seo.ogImage || undefined}
              onChange={(v) =>
                set("seo", {
                  ...form.seo,
                  ogImage: v ?? "",
                  ogImageAnimated: v ? form.seo.ogImageAnimated : false,
                })
              }
              onFileType={(mime) =>
                set("seo", { ...form.seo, ogImageAnimated: mime === "image/gif" })
              }
            />

            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">A capa é um GIF animado</span>
                <span className="block text-xs text-muted-foreground">
                  O Discord anima o card; WhatsApp e Google mostram o primeiro quadro.
                </span>
              </span>
              <Switch
                checked={Boolean(form.seo.ogImageAnimated)}
                onCheckedChange={(v) => set("seo", { ...form.seo, ogImageAnimated: v })}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nome do site</Label>
                <Input
                  value={form.seo.siteName ?? ""}
                  onChange={(e) => set("seo", { ...form.seo, siteName: e.target.value })}
                  placeholder={form.name || "Apollo Craft"}
                />
              </div>
              <div>
                <Label>Endereço oficial (opcional)</Label>
                <Input
                  value={form.seo.canonical ?? ""}
                  onChange={(e) => set("seo", { ...form.seo, canonical: e.target.value })}
                  placeholder="https://apollocraft.online"
                />
              </div>
              <div>
                <Label>Cor da barra do celular</Label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="color"
                    aria-label="Cor da barra do celular"
                    value={/^#[0-9a-f]{6}$/i.test(form.seo.themeColor ?? "") ? form.seo.themeColor! : "#0b1017"}
                    onChange={(e) => set("seo", { ...form.seo, themeColor: e.target.value })}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-md border"
                  />
                  <Input
                    value={form.seo.themeColor ?? ""}
                    onChange={(e) => set("seo", { ...form.seo, themeColor: e.target.value })}
                    placeholder="#0b1017"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <p className="text-xs text-muted-foreground">
                  Sem capa própria, usamos a logo da loja.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prévia no Discord
            </p>
            <LinkPreviewCard meta={previewMeta} />
            <p className="text-xs text-muted-foreground">
              Capa ideal: 1200×630 (JPG/PNG) ou um GIF curto de até 8 MB. A prévia acima usa o que
              está no formulário — clique em <strong>Salvar tudo</strong> para gravar.
            </p>
            {coverSize && (coverSize.width < 600 || coverSize.width / coverSize.height < 1.4) && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                <span>
                  A capa enviada tem {" "}
                  <strong>
                    {coverSize.width}×{coverSize.height}
                  </strong>
                  . O Discord mostra a imagem de ponta a ponta quando a capa é larga (≈1200×630);
                  quadrada ou pequena costuma virar só uma miniatura ao lado do texto.
                </span>
              </p>
            )}
            <PublishedShareStatus meta={savedMeta} />
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
