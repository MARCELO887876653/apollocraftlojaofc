import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, CreditCard, Gamepad2 } from "lucide-react";

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
    </div>
  );
}
