import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { discordRedirectUri } from "@/convex/lib/discord";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, PlugZap, Save,
  ShieldCheck, Trash2, XCircle,
} from "lucide-react";

type DiscordConfig = {
  enabled: boolean;
  clientId: string;
  hasSecret: boolean;
  status: "off" | "incomplete" | "ready";
  updatedAt: number | null;
};

type TestResult = { ok: boolean; message: string } | null;

const PORTAL_URL = "https://discord.com/developers/applications";

function StatusBadge({ status }: { status: DiscordConfig["status"] }) {
  if (status === "ready") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
        <CheckCircle2 className="mr-1 size-3.5" /> Ativo
      </Badge>
    );
  }
  if (status === "incomplete") {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-600">
        <AlertTriangle className="mr-1 size-3.5" /> Falta configurar
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <XCircle className="mr-1 size-3.5" /> Desligado
    </Badge>
  );
}

/**
 * Aba Discord do painel: onde o dono da loja configura o "Entrar com Discord"
 * (Client ID/Client Secret do próprio aplicativo Discord) sem tocar em código
 * nem em variáveis de ambiente. O segredo é guardado no servidor e nunca volta
 * para o navegador — só o informamos se ele já está salvo.
 */
export default function AdminDiscord() {
  const config = useQuery(api.discordAuth.adminGet) as DiscordConfig | undefined;
  const store = useQuery(api.settings.getStore) as
    | { seo?: { canonical?: string }; discord?: string }
    | undefined;

  const save = useMutation(api.discordAuth.adminSave);
  const clear = useMutation(api.discordAuth.adminClear);
  const test = useAction(api.discordAuth.testCredentials);

  const [form, setForm] = useState({ enabled: false, clientId: "", clientSecret: "" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  useEffect(() => {
    if (config) {
      setForm({ enabled: config.enabled, clientId: config.clientId, clientSecret: "" });
    }
  }, [config]);

  // O Discord exige registrar CADA endereço de retorno usado. Mostramos o
  // domínio publicado (se houver) e o endereço atual, que é o que aparece no
  // navegador de quem está configurando.
  const origins = useMemo(() => {
    const list: string[] = [];
    if (store?.seo?.canonical) {
      try {
        list.push(new URL(store.seo.canonical).origin);
      } catch {
        // canonical inválido: ignoramos
      }
    }
    if (!list.includes(window.location.origin)) list.push(window.location.origin);
    return list;
  }, [store?.seo?.canonical]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado!`);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      await save({
        enabled: form.enabled,
        clientId: form.clientId || undefined,
        clientSecret: form.clientSecret || undefined,
      });
      setForm((f) => ({ ...f, clientSecret: "" }));
      toast.success(form.enabled ? "Login com Discord ativado!" : "Configuração salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      // Passa a origem real: o teste confere também se o endereço de retorno
      // desta loja abre (o Discord não expõe a lista de redirects registrados).
      const response = await test({ origin: window.location.origin });
      setResult({ ok: response.ok, message: response.message });
    } catch (e) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : "Não foi possível testar agora.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setResult(null);
    try {
      await clear({});
      setForm({ enabled: false, clientId: "", clientSecret: "" });
      toast.success("Credenciais do Discord removidas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover.");
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return <Loader2 className="mx-auto size-5 animate-spin" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <DiscordIcon className="size-6 text-[#5865F2]" />
            Discord
          </h1>
          <p className="text-sm text-muted-foreground">
            Permita que seus clientes entrem na loja com a conta do Discord
          </p>
        </div>
        <StatusBadge status={config.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Crie o aplicativo no Discord</CardTitle>
          <CardDescription>
            Abra{" "}
            <a
              href={PORTAL_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
            >
              discord.com/developers/applications <ExternalLink className="size-3" />
            </a>{" "}
            → <strong>New Application</strong> (pode usar o nome e o ícone da sua loja).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">
              2. Registre os endereços de retorno (OAuth2 → Redirects)
            </p>
            <p className="text-xs text-muted-foreground">
              Cole exatamente estes endereços e clique em <strong>Add Redirect</strong>. Se a loja
              abre em mais de um domínio, registre todos — o Discord recusa endereços não
              registrados.
            </p>
            <div className="space-y-2">
              {origins.map((origin) => {
                const uri = discordRedirectUri(origin);
                return (
                  <div
                    key={uri}
                    className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2"
                  >
                    <code className="min-w-0 flex-1 truncate font-mono text-xs">{uri}</code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copy(uri, "Endereço de retorno")}
                    >
                      <Copy className="mr-1.5 size-3.5" />
                      Copiar
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">3. Copie as credenciais e cole aqui</p>
            <p className="text-xs text-muted-foreground">
              Em <strong>OAuth2 → General</strong> você encontra o <strong>Client ID</strong> e o{" "}
              <strong>Client Secret</strong> (use <em>Reset Secret</em> se precisar ver de novo).
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Client ID</Label>
                <Input
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  placeholder="1304504761076404225"
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label>Client Secret</Label>
                <Input
                  type="password"
                  value={form.clientSecret}
                  onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                  placeholder={
                    config.hasSecret ? "•••••••••• (salvo — deixe vazio para manter)" : "cole o secret aqui"
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
              <div className="pr-4">
                <p className="text-sm font-semibold">Permitir entrar com Discord</p>
                <p className="text-xs text-muted-foreground">
                  Mostra o botão “Entrar com Discord” na tela de login da loja.
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
              />
            </div>

            {result && (
              <p
                className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                  result.ok
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                {result.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                )}
                {result.message}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Salvar
              </Button>
              <Button variant="outline" onClick={() => void handleTest()} disabled={testing}>
                {testing ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <PlugZap className="mr-2 size-4" />
                )}
                Testar credenciais
              </Button>
              {(config.clientId || config.hasSecret) && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleClear()}
                  disabled={saving}
                >
                  <Trash2 className="mr-2 size-4" />
                  Remover credenciais
                </Button>
              )}
            </div>

            {config.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Última alteração: {new Date(config.updatedAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-emerald-500" /> O que o login com Discord faz
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • Quem entrar pelo Discord tem o <strong>nome</strong> e a <strong>foto</strong> do
            perfil preenchidos automaticamente (e pode trocar depois em Minha Conta).
          </p>
          <p>
            • Se o e-mail do Discord for o mesmo de um cliente que já comprou por aqui, a conta é{" "}
            <strong>vinculada</strong> — o histórico de pedidos continua o mesmo.
          </p>
          <p>
            • Seu <strong>Client Secret fica só no servidor</strong>: a loja mostra apenas se ele
            está salvo, nunca o valor.
          </p>
          <p>
            • Convite do seu servidor (aquele botão “Entrar no Discord” da loja) é configurado em{" "}
            <Link to="/painel/configuracoes" className="font-medium text-primary hover:underline">
              Configurações → Loja → Redes sociais
            </Link>
            .
          </p>
          {store?.discord ? (
            <p className="text-xs">
              Convite atual:{" "}
              <a
                href={store.discord}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
              >
                {store.discord} <ExternalLink className="size-3" />
              </a>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
