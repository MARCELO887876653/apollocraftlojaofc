import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
  Plus, Trash2, BookMarked, Terminal,
} from "lucide-react";

type Integrations = {
  mercadopago: {
    configured: boolean; publicKey: string;
    hasAccessToken: boolean; hasWebhookSecret: boolean;
  };
  minecraft: { dispatchUrl: string; serverName: string };
};

type ApiKey = {
  _id: string; name: string; prefix: string; active: boolean;
  lastUsedAt?: number; createdAt: number; createdBy?: string;
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

      <ApiKeysSection />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chaves de API para integrações externas (entrega na loja)
// ─────────────────────────────────────────────────────────────

function ApiKeysSection() {
  const keys = useQuery(api.apiKeys.list) as ApiKey[] | undefined;
  const createKey = useMutation(api.apiKeys.create);
  const setActive = useMutation(api.apiKeys.setActive);
  const removeKey = useMutation(api.apiKeys.remove);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return toast.error("Dê um nome para a chave (ex.: Plugin do servidor)");
    setCreating(true);
    try {
      const res = await createKey({ name });
      setNewKey(res.key);
      setName("");
      toast.success("Chave criada — copie agora, ela só é exibida uma vez!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setCreating(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" />
          <CardTitle className="text-base">Chaves de API (integrações externas)</CardTitle>
        </div>
        <CardDescription>
          Sistemas externos (plugin do servidor, bot do Discord, painéis parceiros) usam a chave para
          consultar pedidos pagos e registrar entregas na loja automaticamente — como o MineCraGate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Criar chave */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da integração (ex.: Servidor MinasCraft)"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button onClick={create} disabled={creating} className="shrink-0">
            {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
            Gerar chave
          </Button>
        </div>

        {/* Chave recém-criada */}
        {newKey && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <KeyRound className="size-4" /> Copie sua chave agora — ela não será exibida novamente
            </p>
            <div className="mt-3 flex gap-2">
              <code className="flex-1 truncate rounded-lg border bg-background px-3 py-2 text-xs">{newKey}</code>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(newKey);
                  toast.success("Chave copiada!");
                }}
              >
                <Copy className="mr-1.5 size-3.5" /> Copiar
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Lista de chaves */}
        {keys === undefined ? (
          <Loader2 className="mx-auto size-5 animate-spin" />
        ) : keys.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma chave criada ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k._id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                <Terminal className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {k.prefix}••••••••  ·  criada em {new Date(k.createdAt).toLocaleDateString("pt-BR")}
                    {k.lastUsedAt ? `  ·  último uso ${new Date(k.lastUsedAt).toLocaleDateString("pt-BR")}` : "  ·  nunca usada"}
                  </p>
                </div>
                <Badge
                  className={
                    k.active
                      ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15"
                      : "bg-zinc-500/15 text-zinc-600 hover:bg-zinc-500/15"
                  }
                >
                  {k.active ? "Ativa" : "Inativa"}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch checked={k.active} onCheckedChange={(v) => setActive({ id: k._id as any, active: v }).catch((e) => toast.error(e.message))} />
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-red-600"
                    aria-label="Excluir chave"
                    onClick={async () => {
                      if (!confirm(`Excluir a chave "${k.name}"? Integrações que a usam vão parar de funcionar.`)) return;
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

        <Separator />

        {/* Documentação rápida */}
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BookMarked className="size-4 text-primary" /> Como integrar (documentação rápida)
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Envie a chave no header <code className="rounded bg-muted px-1">Authorization: Bearer SUA_CHAVE</code> (ou{" "}
            <code className="rounded bg-muted px-1">X-Api-Key</code>). Base URL:{" "}
            <code className="rounded bg-muted px-1">{origin}/api/external</code>
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted/40 p-3 text-[11px] leading-relaxed">
{`# 1) Validar a chave
GET  ${origin}/api/external/me

# 2) Listar pedidos pagos com entregas pendentes
GET  ${origin}/api/external/orders/pending
→ [{ orderNumber, minecraftNick, items: [{ productId, productName, quantity, target }] }]

# 3) Registrar entrega (após executar os comandos no servidor)
POST ${origin}/api/external/deliveries
{ "orderNumber": "#ABC123XY", "productId": "j...", "commands": ["lp user ... permission set vip"] }

# 4) Reportar falha (a loja agenda retentativa automática)
POST ${origin}/api/external/deliveries/failed
{ "orderNumber": "#ABC123XY", "productId": "j...", "error": "jogador offline" }`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
