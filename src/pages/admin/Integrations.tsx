import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, XCircle, CreditCard, Gamepad2, KeyRound, Copy,
  Plus, Trash2, RefreshCw, Server, ShieldCheck, Ban, Activity, Plug,
  Webhook, Send, Pencil,
} from "lucide-react";

type Integrations = {
  mercadopago: {
    configured: boolean; publicKey: string;
    hasAccessToken: boolean; hasWebhookSecret: boolean;
  };
  minecraft: { dispatchUrl: string; serverName: string };
};

export default function AdminIntegrations() {
  const data = useQuery(api.integrations.list) as Integrations | undefined;
  const [mp, setMp] = useState({ accessToken: "", publicKey: "", webhookSecret: "" });
  const [mc, setMc] = useState({ dispatchUrl: "", serverName: "" });
  const [saving, setSaving] = useState(false);

  const saveMP = useMutation(api.integrations.saveMercadoPago);
  const saveMC = useMutation(api.integrations.saveMinecraft);

  useEffect(() => {
    if (data) {
      setMp((s) => ({ ...s, publicKey: data.mercadopago.publicKey }));
      setMc({ dispatchUrl: data.minecraft.dispatchUrl, serverName: data.minecraft.serverName });
    }
  }, [data]);

  if (!data) return <Loader2 className="mx-auto size-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground">Gateways de pagamento e serviços externos</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              <CardTitle className="text-base">Mercado Pago (PIX)</CardTitle>
            </div>
            {data.mercadopago.configured ? (
              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">
                <CheckCircle2 className="mr-1 size-3.5" /> Configurado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-yellow-700">
                <XCircle className="mr-1 size-3.5" /> Não configurado
              </Badge>
            )}
          </div>
          <CardDescription>
            Gere suas credenciais em developers.mercadopago.com → Suas integrações → Credenciais de produção.
            Para confirmação automática, configure o webhook para{" "}
            <code className="rounded bg-muted px-1">{`${window.location.origin}/api/convex/webhooks/mercadopago`}</code>{" "}
            (evento <em>payment</em>). Alternativamente, defina <code className="rounded bg-muted px-1">MERCADO_PAGO_ACCESS_TOKEN</code> nas variáveis de ambiente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Access Token (produção)</Label>
            <Input
              type="password"
              value={mp.accessToken}
              onChange={(e) => setMp({ ...mp, accessToken: e.target.value })}
              placeholder={data.mercadopago.hasAccessToken ? "•••••••••• (salvo — deixe vazio para manter)" : "APP_USR-..."}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Public Key (opcional)</Label>
              <Input value={mp.publicKey} onChange={(e) => setMp({ ...mp, publicKey: e.target.value })} placeholder="APP_USR-..." />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Só é usada para checkout com cartão no navegador. Para PIX, deixe em branco.
              </p>
            </div>
            <div>
              <Label>Webhook Secret (opcional, assinatura)</Label>
              <Input
                type="password"
                value={mp.webhookSecret}
                onChange={(e) => setMp({ ...mp, webhookSecret: e.target.value })}
                placeholder={data.mercadopago.hasWebhookSecret ? "•••••••• (salvo)" : "opcional"}
              />
            </div>
          </div>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await saveMP({
                  accessToken: mp.accessToken || undefined,
                  publicKey: mp.publicKey || undefined,
                  webhookSecret: mp.webhookSecret || undefined,
                });
                setMp({ accessToken: "", publicKey: mp.publicKey, webhookSecret: "" });
                toast.success("Mercado Pago salvo");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar credenciais
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gamepad2 className="size-5 text-primary" />
            <CardTitle className="text-base">Servidor Minecraft (despacho de comandos)</CardTitle>
          </div>
          <CardDescription>
            Endpoint que recebe <code className="rounded bg-muted px-1">{`{ "commands": [...] }`}</code> e executa no servidor
            (ex.: plugin RCON HTTP). Usado por produtos com entrega tipo "Comando de servidor".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>URL de despacho</Label>
              <Input value={mc.dispatchUrl} onChange={(e) => setMc({ ...mc, dispatchUrl: e.target.value })} placeholder="https://mc.seuservidor.com/exec" />
            </div>
            <div>
              <Label>Nome do servidor (opcional)</Label>
              <Input value={mc.serverName} onChange={(e) => setMc({ ...mc, serverName: e.target.value })} />
            </div>
          </div>
          <Button
            onClick={async () => {
              try {
                await saveMC({ dispatchUrl: mc.dispatchUrl, serverName: mc.serverName || undefined });
                toast.success("Integração Minecraft salva");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro");
              }
            }}
          >
            Salvar
          </Button>
        </CardContent>
      </Card>

      <WebhooksSection />

      <ApiV1Section />

      <ApiV1Diagnostics />

    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Webhooks de saída (notificações para Discord e outros sistemas)
// ─────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS: Array<{ value: string; label: string }> = [
  { value: "order.created", label: "Pedido criado" },
  { value: "order.paid", label: "Pedido aprovado" },
  { value: "order.delivered", label: "Pedido entregue" },
  { value: "order.cancelled", label: "Pedido cancelado" },
  { value: "delivery.failed", label: "Falha na entrega" },
  { value: "test", label: "Teste" },
];

const ALL_EVENTS = "*";

const eventLabel = (value: string) =>
  value === ALL_EVENTS
    ? "Todos os eventos"
    : WEBHOOK_EVENTS.find((e) => e.value === value)?.label ?? value;

type WebhookRow = {
  _id: string; name?: string; url: string; events: string[];
  active: boolean; failureCount: number; createdAt: number;
};

type WebhookLogRow = {
  _id: string; event: string; url: string; statusCode?: number;
  error?: string; attempt: number; createdAt: number;
};

type WebhookAdminData = {
  hooks: WebhookRow[];
  logs: WebhookLogRow[];
  stats: { deliveries24h: number; successRate: number | null };
};

function StatusBadge({ log }: { log: WebhookLogRow }) {
  if (log.error) {
    return <Badge variant="outline" className="border-red-500/40 text-red-600">Erro</Badge>;
  }
  const ok = typeof log.statusCode === "number" && log.statusCode >= 200 && log.statusCode < 300;
  return (
    <Badge
      className={
        ok
          ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15"
          : "bg-red-500/15 text-red-700 hover:bg-red-500/15"
      }
    >
      {log.statusCode ?? "—"}
    </Badge>
  );
}

function WebhooksSection() {
  const data = useQuery(api.webhooksOutData.adminList) as WebhookAdminData | undefined;
  const save = useMutation(api.webhooksOutData.save);
  const remove = useMutation(api.webhooksOutData.remove);
  const test = useAction(api.webhooksTest.test);

  const [editing, setEditing] = useState<
    { id: string | null; name: string; url: string; events: string[] } | null
  >(null);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const openNew = () => setEditing({ id: null, name: "", url: "", events: [] });
  const openEdit = (hook: WebhookRow) =>
    setEditing({ id: hook._id, name: hook.name ?? "", url: hook.url, events: hook.events });

  const toggleEvent = (value: string) => {
    setEditing((cur) => {
      if (!cur) return cur;
      const on = cur.events.includes(value);
      return { ...cur, events: on ? cur.events.filter((e) => e !== value) : [...cur.events, value] };
    });
  };

  const canCreate =
    !!editing && editing.name.trim().length > 0 && /^https:\/\/\S+/i.test(editing.url.trim());

  const submit = async () => {
    if (!editing || !canCreate) return;
    setSaving(true);
    try {
      await save({
        id: (editing.id as any) ?? undefined,
        data: {
          name: editing.name.trim(),
          url: editing.url.trim(),
          secret: editing.id ? undefined : crypto.randomUUID(),
          events: editing.events.length ? editing.events : [ALL_EVENTS],
          active: true,
        },
      });
      toast.success(editing.id ? "Webhook atualizado" : "Webhook criado");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (hook: WebhookRow) => {
    setTestingId(hook._id);
    try {
      const res = await test({ id: hook._id as any });
      if (res.ok) toast.success(`Entrega OK (${res.status})`);
      else toast.error(`O endpoint respondeu ${res.status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao testar");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Webhook className="size-5 text-primary" />
          <CardTitle className="text-base">Webhooks</CardTitle>
        </div>
        <CardDescription>
          Gerencie os webhooks da sua loja. Ao informar a URL de um webhook do Discord
          (discord.com/api/webhooks/...), os eventos são enviados como embed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowDeliveries(true)}>
            <Activity className="mr-2 size-4" /> Ver entregas
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-2 size-4" /> Novo webhook
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Entregas (24h)</p>
              <Activity className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-3xl font-extrabold tracking-tight">
              {data ? data.stats.deliveries24h : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Envios feitos nas últimas 24 horas.</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Taxa de sucesso</p>
              <ShieldCheck className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-3xl font-extrabold tracking-tight">
              {data?.stats.successRate == null ? "—" : `${data.stats.successRate}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Respostas 2xx nas entregas de 24h.</p>
          </div>
        </div>

        <Separator />

        {data === undefined ? (
          <Loader2 className="mx-auto size-5 animate-spin" />
        ) : data.hooks.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum webhook configurado. Clique em “Novo webhook” para começar.
          </p>
        ) : (
          <div className="space-y-2">
            {data.hooks.map((hook) => (
              <div key={hook._id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                <Webhook className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{hook.name || hook.url}</p>
                  <p className="truncate text-xs text-muted-foreground">{hook.url}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(hook.events.length ? hook.events : [ALL_EVENTS]).map((e) => (
                      <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {eventLabel(e)}
                      </span>
                    ))}
                    {hook.failureCount > 0 && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700">
                        {hook.failureCount} falha(s)
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testingId === hook._id}
                  onClick={() => runTest(hook)}
                >
                  {testingId === hook._id ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 size-3.5" />
                  )}
                  Testar
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Editar webhook" onClick={() => openEdit(hook)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Switch
                  checked={hook.active}
                  onCheckedChange={(v) =>
                    save({
                      id: hook._id as any,
                      data: { name: hook.name, url: hook.url, events: hook.events, active: v },
                    }).catch((e) => toast.error(e.message))
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-red-600"
                  aria-label="Excluir webhook"
                  onClick={async () => {
                    if (!confirm("Excluir este webhook?")) return;
                    try {
                      await remove({ id: hook._id as any });
                      toast.success("Webhook excluído");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Erro");
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Criar/editar webhook */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar webhook" : "Criar webhook"}</DialogTitle>
            <DialogDescription>
              Configure um novo webhook para receber notificações.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex: Meu servidor"
                />
              </div>
              <div className="space-y-2">
                <Label>URL (HTTPS)</Label>
                <Input
                  value={editing.url}
                  onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                  placeholder="https://exemplo.com/webhook"
                  inputMode="url"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Eventos</Label>
                <div className="space-y-2">
                  {[...WEBHOOK_EVENTS].map((ev) => (
                    <div
                      key={ev.value}
                      className="flex items-center justify-between rounded-xl border bg-card px-4 py-3"
                    >
                      <span className="text-sm font-medium">{ev.label}</span>
                      <Switch
                        checked={editing.events.includes(ev.value)}
                        onCheckedChange={() => toggleEvent(ev.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={!canCreate || saving}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {editing.id ? "Salvar" : "Criar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Entregas recentes */}
      <Dialog open={showDeliveries} onOpenChange={setShowDeliveries}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Entregas</DialogTitle>
            <DialogDescription>Últimas chamadas feitas aos seus webhooks.</DialogDescription>
          </DialogHeader>
          {!data ? (
            <Loader2 className="mx-auto size-5 animate-spin" />
          ) : data.logs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma entrega registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.logs.map((log) => (
                <div key={log._id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{eventLabel(log.event)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {log.url} · {new Date(log.createdAt).toLocaleString("pt-BR")}
                    </p>
                    {log.error && (
                      <p className="truncate text-xs text-red-600">{log.error}</p>
                    )}
                  </div>
                  <StatusBadge log={log} />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// API v1 — chaves com permissões (scopes), servidor e token 1x
// ─────────────────────────────────────────────────────────────

const V1_SCOPES: Array<{ value: string; label: string }> = [
  { value: "deliveries:read", label: "Ler entregas" },
  { value: "deliveries:claim", label: "Reservar entregas (claim)" },
  { value: "deliveries:update", label: "Confirmar/atualizar entregas" },
  { value: "users:queue", label: "Ler entregas de jogadores" },
  { value: "users:schedules", label: "Ler agendamentos" },
  { value: "server:heartbeat", label: "Heartbeat do servidor" },
  { value: "categories:read", label: "Ler categorias" },
  { value: "categories:create", label: "Criar categorias" },
  { value: "categories:update", label: "Editar categorias" },
  { value: "categories:delete", label: "Arquivar categorias" },
  { value: "products:read", label: "Ler produtos" },
  { value: "products:create", label: "Criar produtos" },
  { value: "products:update", label: "Editar produtos" },
  { value: "products:delete", label: "Arquivar produtos" },
  { value: "products:publish", label: "Publicar/despublicar" },
  { value: "delivery-recipes:read", label: "Ler receita de entrega" },
  { value: "delivery-recipes:write", label: "Editar receita de entrega" },
];

type ApiKeyV1 = {
  _id: string; name: string; description: string; prefix: string; lastFour: string;
  scopes: string[]; serverId: string; addonId: string; active: boolean; revoked: boolean;
  lastUsedAt?: number; createdAt: number; createdBy: string;
};

function ApiV1Section() {
  const keys = useQuery(api.apiKeysV1.list) as ApiKeyV1[] | undefined;
  const createKey = useMutation(api.apiKeysV1.create);
  const regenerate = useMutation(api.apiKeysV1.regenerate);
  const setActive = useMutation(api.apiKeysV1.setActive);
  const removeKey = useMutation(api.apiKeysV1.remove);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serverId, setServerId] = useState("");
  const [addonId, setAddonId] = useState("");
  const [scopes, setScopes] = useState<string[]>(["deliveries:read", "deliveries:update"]);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const toggleScope = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const create = async () => {
    if (!name.trim()) return toast.error("Dê um nome para a chave (ex.: Servidor Survival)");
    if (scopes.length === 0) return toast.error("Selecione pelo menos uma permissão");
    setCreating(true);
    try {
      const res = await createKey({
        name,
        description: description || undefined,
        scopes: scopes as any,
        serverId: serverId || undefined,
        addonId: addonId || undefined,
      });
      setNewToken(res.token);
      setName("");
      setDescription("");
      setServerId("");
      setAddonId("");
      toast.success("Chave criada — copie agora, ela não será exibida novamente!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <CardTitle className="text-base">API de entregas automáticas (v1)</CardTitle>
        </div>
        <CardDescription>
          A fila de entregas automáticas que seus addons consomem. Cada chave pode ser limitada a um
          servidor e a um addon, com permissões (scopes) específicas. Base URL:{" "}
          <code className="rounded bg-muted px-1">{origin}/api/v1</code>. Token armazenado apenas como hash.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Servidor Survival" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Addon principal do servidor" />
            </div>
            <div>
              <Label>Servidor (server_id)</Label>
              <Input value={serverId} onChange={(e) => setServerId(e.target.value)} placeholder="survival-01 (vazio = GLOBAL)" />
            </div>
            <div>
              <Label>Addon (addon_id, opcional)</Label>
              <Input value={addonId} onChange={(e) => setAddonId(e.target.value)} placeholder="economy (vazio = todos)" />
            </div>
          </div>
          <div>
            <Label>Permissões</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {V1_SCOPES.map((s) => {
                const on = scopes.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleScope(s.value)}
                    className={
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                      (on
                        ? "border-sky-500/50 bg-sky-500/15 text-sky-400"
                        : "border-border bg-background text-muted-foreground hover:text-foreground")
                    }
                  >
                    {s.label} <code className="ml-1 opacity-70">{s.value}</code>
                  </button>
                );
              })}
            </div>
          </div>
          <Button onClick={create} disabled={creating}>
            {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
            Gerar chave de API
          </Button>
        </div>

        {newToken && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <KeyRound className="size-4" /> Copie sua chave agora — ela não será exibida novamente
            </p>
            <div className="mt-3 flex gap-2">
              <code className="flex-1 truncate rounded-lg border bg-background px-3 py-2 text-xs">{newToken}</code>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(newToken);
                  toast.success("Chave copiada!");
                }}
              >
                <Copy className="mr-1.5 size-3.5" /> Copiar
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {keys === undefined ? (
          <Loader2 className="mx-auto size-5 animate-spin" />
        ) : keys.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma chave v1 criada ainda. Crie uma para conectar seu addon.
          </p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k._id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                <Server className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {k.name}
                    <Badge variant="outline" className="font-mono text-[10px]">{k.serverId}</Badge>
                    {k.addonId && <Badge variant="outline" className="font-mono text-[10px]">{k.addonId}</Badge>}
                  </p>
                  {k.description && <p className="truncate text-xs text-muted-foreground">{k.description}</p>}
                  <p className="text-xs text-muted-foreground">
                    <code className="font-mono">{k.prefix}…{k.lastFour}</code> · criada em{" "}
                    {new Date(k.createdAt).toLocaleDateString("pt-BR")}
                    {k.lastUsedAt ? ` · último uso ${new Date(k.lastUsedAt).toLocaleString("pt-BR")}` : " · nunca usada"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{s}</span>
                    ))}
                  </div>
                </div>
                <Badge
                  className={
                    k.active && !k.revoked
                      ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15"
                      : "bg-zinc-500/15 text-zinc-600 hover:bg-zinc-500/15"
                  }
                >
                  {k.active && !k.revoked ? "Ativa" : "Revogada"}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="Regenerar chave"
                    aria-label="Regenerar chave"
                    onClick={async () => {
                      if (!confirm(`Regenerar a chave "${k.name}"? A chave atual deixará de funcionar.`)) return;
                      try {
                        const res = await regenerate({ id: k._id as any });
                        setNewToken(res.token);
                        toast.success("Nova chave gerada — copie agora!");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro");
                      }
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                  <Switch
                    checked={k.active}
                    onCheckedChange={(v) =>
                      setActive({ id: k._id as any, active: v }).catch((e) => toast.error(e.message))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-red-600"
                    aria-label="Excluir chave"
                    onClick={async () => {
                      if (!confirm(`Excluir a chave "${k.name}"?`)) return;
                      try {
                        await removeKey({ id: k._id as any });
                        toast.success("Chave excluída");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro");
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Ban className="size-4 text-primary" /> Nada de chave pela URL
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            A autenticação é sempre por header <code className="rounded bg-muted px-1">Authorization: Bearer SUA_CHAVE</code>.
            Documentação completa com exemplos (JS/TS/Bedrock + registerHandler) em{" "}
            <a href="/docs/api" target="_blank" rel="noreferrer" className="text-primary underline">/docs/api</a>.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Diagnóstico das integrações: chaves, servidores e "Testar integração"
// ─────────────────────────────────────────────────────────────

type KeyDiag = {
  id: string; name: string; prefix: string; lastFour: string; scopes: string[];
  serverId: string; addonId: string; active: boolean; revoked: boolean; lastUsedAt: number | null;
  heartbeat: {
    online: boolean; lastSeenAt: number; version: string;
    minecraftVersion: string; apiClientVersion: string; lastErrorCode: string;
  } | null;
};

type ServerDiag = {
  serverId: string; addonId: string; online: boolean; lastSeenAt: number;
  version: string; minecraftVersion: string; apiClientVersion: string; lastErrorCode: string;
};

type Diagnostics = { keys: KeyDiag[]; servers: ServerDiag[] };

function ApiV1Diagnostics() {
  const diag = useQuery(api.apiKeysV1.adminDiagnostics) as Diagnostics | undefined;
  const [testKeyId, setTestKeyId] = useState<string | null>(null);

  if (!diag) {
    return (
      <Card>
        <CardContent className="py-8">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <CardTitle className="text-base">Diagnóstico das integrações</CardTitle>
        </div>
        <CardDescription>
          Status dos servidores/addons conectados via API v1. Nenhum segredo (chave/hash) é exibido aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Servidores</p>
          {diag.servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum heartbeat recebido ainda.</p>
          ) : (
            <div className="space-y-2">
              {diag.servers.map((s) => (
                <div key={`${s.serverId}:${s.addonId}`} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <span className={s.online ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-zinc-500"} />
                  <span className="font-medium">{s.serverId}</span>
                  {s.addonId && <Badge variant="outline" className="font-mono text-[10px]">{s.addonId}</Badge>}
                  <span className="text-xs text-muted-foreground">{s.online ? "Online" : "Offline"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    addon {s.version || "—"} · MC {s.minecraftVersion || "—"} · último contato {new Date(s.lastSeenAt).toLocaleString("pt-BR")}
                  </span>
                  {s.lastErrorCode && (
                    <Badge variant="outline" className="font-mono text-[10px] text-amber-700">{s.lastErrorCode}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Chaves de API</p>
          {diag.keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma chave criada ainda.</p>
          ) : (
            <div className="space-y-2">
              {diag.keys.map((k) => (
                <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                  <Server className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {k.name}
                      <Badge variant="outline" className="font-mono text-[10px]">{k.serverId}</Badge>
                      {k.addonId && <Badge variant="outline" className="font-mono text-[10px]">{k.addonId}</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <code className="font-mono">{k.prefix}…{k.lastFour}</code> · {k.scopes.length} permissões
                      {k.lastUsedAt ? ` · último uso ${new Date(k.lastUsedAt).toLocaleString("pt-BR")}` : " · nunca usada"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {k.heartbeat
                        ? `Heartbeat: ${k.heartbeat.online ? "online" : "offline"} (${new Date(k.heartbeat.lastSeenAt).toLocaleString("pt-BR")}) · addon ${k.heartbeat.version || "—"} · MC ${k.heartbeat.minecraftVersion || "—"}${k.heartbeat.lastErrorCode ? ` · erro ${k.heartbeat.lastErrorCode}` : ""}`
                        : "Sem heartbeat deste servidor"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setTestKeyId(k.id)}>
                    <Plug className="mr-1.5 size-3.5" /> Testar integração
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {testKeyId && <KeyTestDialog keyId={testKeyId} onClose={() => setTestKeyId(null)} />}
    </Card>
  );
}

function KeyTestDialog({ keyId, onClose }: { keyId: string; onClose: () => void }) {
  const res = useQuery(api.apiKeysV1.adminTestKey, { id: keyId as any }) as
    | { ok: boolean; checks: { label: string; ok: boolean }[] }
    | undefined;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Testar integração</DialogTitle>
          <DialogDescription>
            Valida se a chave está ativa, com escopos, com vínculo definido e com heartbeat recente.
            O segredo nunca é exibido.
          </DialogDescription>
        </DialogHeader>
        {res === undefined ? (
          <Loader2 className="mx-auto size-5 animate-spin" />
        ) : (
          <div className="space-y-2">
            {res.checks.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <XCircle className="size-4 text-red-600" />
                )}
                {c.label}
              </div>
            ))}
            <p className={res.ok ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-amber-700"}>
              {res.ok ? "Integração OK" : "Há pendências — confira os itens acima"}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
