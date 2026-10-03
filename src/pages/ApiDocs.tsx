import type { ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  KeyRound, ShieldCheck, ListChecks, Send, Clock, HeartPulse, AlertTriangle, ArrowLeft, Zap,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Documentação pública da API de entregas automáticas (v1)
// Rota: /docs/api  (nenhuma chave real aparece nos exemplos)
// ─────────────────────────────────────────────────────────────

function Code({ children, title }: { children: string; title?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-[#0d1420]">
      {title && (
        <div className="border-b border-border/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
      )}
      <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-sky-100/90">{children}</pre>
    </div>
  );
}

function Section({
  id, icon: Icon, title, children,
}: {
  id: string; icon: typeof Zap; title: string; children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <Icon className="size-5 text-sky-400" /> {title}
      </h2>
      <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function Endpoint({ method, path, scope }: { method: string; path: string; scope: string }) {
  const color =
    method === "GET" ? "bg-emerald-500/15 text-emerald-400" :
    method === "POST" ? "bg-sky-500/15 text-sky-400" : "bg-amber-500/15 text-amber-400";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${color}`}>{method}</span>
      <code className="font-mono text-xs text-foreground">{path}</code>
      <span className="ml-auto font-mono text-[11px] text-muted-foreground">{scope}</span>
    </div>
  );
}

const NAV = [
  { id: "visao", label: "Visão geral" },
  { id: "config", label: "Configuração do addon" },
  { id: "auth", label: "Autenticação e scopes" },
  { id: "endpoints", label: "Endpoints" },
  { id: "fila", label: "Fila (queued_commands)" },
  { id: "claim", label: "Claim seguro" },
  { id: "jogador", label: "Fila por jogador / agendamentos" },
  { id: "confirmar", label: "Confirmar entrega" },
  { id: "heartbeat", label: "Heartbeat" },
  { id: "limites", label: "Rate limit e erros" },
  { id: "exemplo", label: "Exemplo de addon (registerHandler)" },
  { id: "bedrock", label: "Exemplo Bedrock" },
  { id: "loja", label: "Gerenciar a loja" },
];

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/25">
            <Zap className="size-4.5 text-sky-950" />
          </span>
          <div>
            <p className="text-sm font-extrabold leading-tight">API de Entregas · Apollo Craft</p>
            <p className="text-[11px] text-muted-foreground">v1 · fila de comandos para addons</p>
          </div>
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link to="/">
              <ArrowLeft className="mr-2 size-3.5" /> Voltar à loja
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        {/* Índice */}
        <aside className="sticky top-24 hidden h-fit w-52 shrink-0 lg:block">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Índice</p>
          <nav className="space-y-1">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="block rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-10">
          <div>
            <Badge className="bg-sky-500/15 text-sky-400 hover:bg-sky-500/15">API v1</Badge>
            <h1 className="mt-3 text-3xl font-black tracking-tight">Entrega automática para addons</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Quando um pagamento é aprovado, o site cria automaticamente uma entrega na fila. Seu addon
              consulta a fila, executa a ação no servidor e confirma o resultado. Todo o sistema roda no
              seu próprio domínio — nenhuma dependência externa.
            </p>
          </div>

          <Section id="visao" icon={ListChecks} title="Visão geral do fluxo">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Cliente compra → pagamento aprovado (confirmado no backend).</li>
              <li>O site cria a(s) entrega(s) com <code className="rounded bg-muted px-1">idempotency_key</code> única.</li>
              <li>O addon consulta <code className="rounded bg-muted px-1">GET /api/v1/app/queued_commands</code>.</li>
              <li>O addon executa a <code className="rounded bg-muted px-1">action</code> no Minecraft.</li>
              <li>O addon confirma com <code className="rounded bg-muted px-1">PATCH /api/v1/app/command/&#123;id&#125;</code>.</li>
              <li>A entrega vira <strong>DONE</strong> e nunca mais aparece na fila.</li>
            </ol>
          </Section>

          <Section id="config" icon={KeyRound} title="Configuração do addon">
            <p>Seu addon precisa apenas de 4 informações (nunca prenda a um domínio fixo):</p>
            <Code title="ambiente (.env do addon)">{`API_BASE_URL=https://SEU-DOMINIO/api/v1
API_KEY=sk_live_SUA_CHAVE_AQUI
SERVER_ID=survival-01
ADDON_ID=economy`}</Code>
            <p>
              Crie a chave no painel em <strong>Integrações → API de entregas automáticas</strong>. Ela é
              exibida <strong>uma única vez</strong>; guarde-a em local seguro. O servidor armazena apenas o hash.
            </p>
          </Section>

          <Section id="auth" icon={ShieldCheck} title="Autenticação e scopes">
            <p>
              Envie a chave no header. <strong>A chave nunca vai pela URL.</strong>
            </p>
            <Code>{`Authorization: Bearer sk_live_SUA_CHAVE_AQUI
# alternativa: X-Api-Key: sk_live_SUA_CHAVE_AQUI`}</Code>
            <p>Cada chave tem permissões (scopes) e pode ser limitada a um servidor e/ou addon:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><code className="rounded bg-muted px-1">deliveries:read</code> — ler entregas</li>
              <li><code className="rounded bg-muted px-1">deliveries:update</code> — atualizar/confirmar entregas</li>
              <li><code className="rounded bg-muted px-1">users:queue</code> — ler entregas de jogadores</li>
              <li><code className="rounded bg-muted px-1">users:schedules</code> — ler agendamentos</li>
              <li><code className="rounded bg-muted px-1">server:heartbeat</code> — enviar heartbeat</li>
              <li><code className="rounded bg-muted px-1">categories:read</code> / <code className="rounded bg-muted px-1">categories:create</code> / <code className="rounded bg-muted px-1">categories:update</code> / <code className="rounded bg-muted px-1">categories:delete</code> — gerenciar categorias</li>
              <li><code className="rounded bg-muted px-1">products:read</code> / <code className="rounded bg-muted px-1">products:create</code> / <code className="rounded bg-muted px-1">products:update</code> / <code className="rounded bg-muted px-1">products:delete</code> — gerenciar produtos</li>
              <li><code className="rounded bg-muted px-1">products:publish</code> — publicar/despublicar</li>
              <li><code className="rounded bg-muted px-1">delivery-recipes:read</code> / <code className="rounded bg-muted px-1">delivery-recipes:write</code> — receita de entrega do produto</li>
            </ul>
          </Section>

          <Section id="endpoints" icon={Zap} title="Endpoints">
            <div className="space-y-2">
              <Endpoint method="GET" path="/api/v1/app/queued_commands" scope="deliveries:read" />
              <Endpoint method="POST" path="/api/v1/app/queued_commands/claim" scope="deliveries:update" />
              <Endpoint method="GET" path="/api/v1/app/user_queue/{user-id}" scope="users:queue" />
              <Endpoint method="GET" path="/api/v1/app/user_schedules/{user-id}" scope="users:schedules" />
              <Endpoint method="PATCH" path="/api/v1/app/command/{command-id}" scope="deliveries:update" />
              <Endpoint method="POST" path="/api/v1/app/heartbeat" scope="server:heartbeat" />
              <Endpoint method="GET" path="/api/v1/app/me" scope="—" />
              <Endpoint method="GET" path="/api/v1/categories" scope="categories:read" />
              <Endpoint method="POST" path="/api/v1/categories" scope="categories:create" />
              <Endpoint method="GET" path="/api/v1/categories/{id}" scope="categories:read" />
              <Endpoint method="PATCH" path="/api/v1/categories/{id}" scope="categories:update" />
              <Endpoint method="DELETE" path="/api/v1/categories/{id}" scope="categories:delete" />
              <Endpoint method="GET" path="/api/v1/products" scope="products:read" />
              <Endpoint method="POST" path="/api/v1/products" scope="products:create" />
              <Endpoint method="GET" path="/api/v1/products/{id}" scope="products:read" />
              <Endpoint method="PATCH" path="/api/v1/products/{id}" scope="products:update" />
              <Endpoint method="DELETE" path="/api/v1/products/{id}" scope="products:delete" />
              <Endpoint method="POST" path="/api/v1/products/{id}/publish" scope="products:publish" />
              <Endpoint method="POST" path="/api/v1/products/{id}/unpublish" scope="products:publish" />
              <Endpoint method="GET" path="/api/v1/products/{id}/delivery-recipe" scope="delivery-recipes:read" />
              <Endpoint method="PUT" path="/api/v1/products/{id}/delivery-recipe" scope="delivery-recipes:write" />
              <Endpoint method="POST" path="/api/v1/files/upload-url" scope="products:create (ou update)" />
              <Endpoint method="POST" path="/api/v1/files/finalize" scope="products:create (ou update)" />
            </div>
          </Section>

          <Section id="fila" icon={ListChecks} title="Fila: GET /queued_commands">
            <p>
              Retorna apenas entregas <strong>PENDING</strong>, com <code className="rounded bg-muted px-1">execute_at</code> no passado
              e pertencentes ao servidor da chave (ou <code className="rounded bg-muted px-1">GLOBAL</code>).
              Nenhum dado pessoal (CPF, endereço, pagamento) é enviado.
            </p>
            <p>Filtros opcionais: <code className="rounded bg-muted px-1">?addon_id=economy</code> e <code className="rounded bg-muted px-1">?limit=50</code>.</p>
            <Code title="Exemplo de resposta">{`[
  {
    "id": "del_m3f8a1b2c9d4",
    "server_id": "survival-01",
    "addon_id": "economy",
    "action": "ADD_MONEY",
    "command": null,
    "payload": { "amount": 10000 },
    "offline_execute": true,
    "execute_at": "2026-10-03T20:00:00.000Z",
    "status": "PENDING",
    "attempts": 0,
    "order": {
      "id": "#ORD-93241",
      "client_identifier": "Steve123",
      "variables": [
        { "name": "nickname", "value": "Steve123" },
        { "name": "quantidade", "value": "1" },
        { "name": "pedido", "value": "#ORD-93241" }
      ]
    }
  }
]`}</Code>
          </Section>

          <Section id="claim" icon={ShieldCheck} title="Claim seguro: POST /queued_commands/claim">
            <p>
              Para evitar que dois processos entreguem a mesma compra, use o claim. O backend reserva
              atomicamente as entregas (status <strong>PROCESSING</strong>) por um período (lease).
              Se o addon cair sem confirmar, o lease expira e a entrega volta para <strong>PENDING</strong>.
            </p>
            <Code title="Requisição">{`POST /api/v1/app/queued_commands/claim
Authorization: Bearer sk_live_...
Content-Type: application/json

{ "limit": 20, "addon_id": "economy" }`}</Code>
            <Code title="Resposta (trecho)">{`{
  "count": 1,
  "data": [
    {
      "id": "del_m3f8a1b2c9d4",
      "action": "ADD_MONEY",
      "status": "PROCESSING",
      "claim_token": "clm_9f2c...",
      "claimed_at": "2026-10-03T20:00:05.000Z",
      "claim_expires_at": "2026-10-03T20:05:05.000Z",
      "payload": { "amount": 10000 },
      "order": { "id": "#ORD-93241", "client_identifier": "Steve123", "variables": [] }
    }
  ]
}`}</Code>
          </Section>

          <Section id="jogador" icon={Clock} title="Fila por jogador e agendamentos">
            <p>
              Quando o jogador entra no servidor, consulte a fila dele e entregue imediatamente:
            </p>
            <Code>{`GET /api/v1/app/user_queue/Steve123      # entregas prontas para agora
GET /api/v1/app/user_schedules/Steve123  # entregas futuras (ex.: REMOVE_RANK em 30 dias)`}</Code>
            <p>
              O <code className="rounded bg-muted px-1">user-id</code> pode ser nickname, XUID, gamertag ou o
              <code className="mx-1 rounded bg-muted px-1">client_identifier</code> usado na compra.
              O addon pode responder <code className="rounded bg-muted px-1">PENDING</code> com
              <code className="mx-1 rounded bg-muted px-1">"PLAYER_OFFLINE"</code> quando o jogador estiver offline e
              <code className="mx-1 rounded bg-muted px-1">offline_execute</code> for false.
            </p>
          </Section>

          <Section id="confirmar" icon={Send} title="Confirmar entrega: PATCH /command/{id}">
            <p>Status aceitos: <strong>DONE</strong>, <strong>FAILED</strong>, <strong>PENDING</strong>, <strong>CANCELED</strong>.</p>
            <Code title="Sucesso">{`PATCH /api/v1/app/command/del_m3f8a1b2c9d4
Authorization: Bearer sk_live_...
Content-Type: application/json

{ "status": "DONE", "response": "10000 moedas adicionadas" }`}</Code>
            <Code title="Erro real (agenda retentativa automática)">{`{ "status": "FAILED", "response": "Não foi possível acessar o banco de economia" }`}</Code>
            <Code title="Ainda pendente (jogador offline)">{`{ "status": "PENDING", "response": "PLAYER_OFFLINE" }`}</Code>
            <Code title="Cancelamento">{`{ "status": "CANCELED", "reason": "Pedido reembolsado" }`}</Code>
            <p>
              Depois de <strong>DONE</strong> a entrega não volta a aparecer em <code className="rounded bg-muted px-1">queued_commands</code>.
            </p>
          </Section>

          <Section id="heartbeat" icon={HeartPulse} title="Heartbeat">
            <Code title="Requisição">{`POST /api/v1/app/heartbeat
Authorization: Bearer sk_live_...

{ "server_id": "survival-01", "version": "1.2.0", "minecraft_version": "1.21.0" }`}</Code>
            <p>O painel mostra o servidor como 🟢 Online enquanto o heartbeat chega.</p>
          </Section>

          <Section id="limites" icon={AlertTriangle} title="Rate limit e erros">
            <ul className="list-disc space-y-1 pl-5">
              <li>GET: <strong>120 req/min</strong> · POST/PATCH: <strong>30 req/min</strong> (por chave).</li>
              <li>Headers: <code className="rounded bg-muted px-1">X-RateLimit-Limit</code>, <code className="rounded bg-muted px-1">X-RateLimit-Remaining</code>, <code className="rounded bg-muted px-1">Retry-After</code> (no 429).</li>
            </ul>
            <p>Todos os erros seguem o mesmo formato:</p>
            <Code>{`{
  "errors": [
    { "message": "Limite de requisições excedido.", "code": "RATE_LIMIT_REACHED" }
  ]
}`}</Code>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <span className="rounded border px-2 py-1">400 · requisição inválida</span>
              <span className="rounded border px-2 py-1">401 · chave ausente/inválida</span>
              <span className="rounded border px-2 py-1">403 · sem permissão</span>
              <span className="rounded border px-2 py-1">404 · não encontrada</span>
              <span className="rounded border px-2 py-1">409 · conflito/idempotência</span>
              <span className="rounded border px-2 py-1">422 · dados inválidos</span>
              <span className="rounded border px-2 py-1">429 · rate limit</span>
              <span className="rounded border px-2 py-1">500 · erro interno</span>
            </div>
          </Section>

          <Section id="exemplo" icon={Zap} title="Exemplo de addon (TypeScript) com registerHandler">
            <p>
              Registre um handler para cada tipo de <code className="rounded bg-muted px-1">action</code> que seu addon
              sabe executar. Nunca processe o mesmo <strong>delivery ID</strong> duas vezes.
            </p>
            <Code title="addon.ts">{`type Delivery = {
  id: string;
  action: string;
  command: string | null;
  payload: any;
  offline_execute: boolean;
  order: { id: string; client_identifier: string; variables: { name: string; value: string }[] };
};

const API_BASE_URL = process.env.API_BASE_URL!; // https://SEU-DOMINIO/api/v1
const API_KEY = process.env.API_KEY!;           // sk_live_...
const SERVER_ID = process.env.SERVER_ID!;
const ADDON_ID = process.env.ADDON_ID!;

const seen = new Set<string>(); // em produção: persistir em disco/banco local

const handlers: Record<string, (d: Delivery) => Promise<void>> = {};
export function registerHandler(action: string, fn: (d: Delivery) => Promise<void>) {
  handlers[action] = fn;
}

// ── handlers de exemplo ──
registerHandler("ADD_MONEY", async (d) => { addMoney(d.order.client_identifier, d.payload.amount); });
registerHandler("ADD_RANK", async (d) => { addRank(d.order.client_identifier, d.payload.rank, d.payload.duration); });

async function fetchQueue(): Promise<Delivery[]> {
  const res = await fetch(\`\${API_BASE_URL}/app/queued_commands?addon_id=\${ADDON_ID}\`, {
    headers: { Authorization: \`Bearer \${API_KEY}\` },
  });
  if (!res.ok) { console.error("API", res.status, await res.text()); return []; }
  return res.json();
}

async function confirm(id: string, status: string, response: string) {
  await fetch(\`\${API_BASE_URL}/app/command/\${id}\`, {
    method: "PATCH",
    headers: { Authorization: \`Bearer \${API_KEY}\`, "Content-Type": "application/json" },
    body: JSON.stringify({ status, response }),
  });
}

export async function tick() {
  const queue = await fetchQueue();
  for (const d of queue) {
    if (seen.has(d.id)) continue; // idempotência local (raro: addon executou, confirmação não chegou)

    const handler = handlers[d.action];
    if (!handler) { await confirm(d.id, "FAILED", \`Sem handler para \${d.action}\`); continue; }

    const online = isPlayerOnline(d.order.client_identifier);
    if (!online && !d.offline_execute) { await confirm(d.id, "PENDING", "PLAYER_OFFLINE"); continue; }

    try {
      await handler(d);
      seen.add(d.id);
      await confirm(d.id, "DONE", "Entregue com sucesso");   // marca ANTES de esquecer o id local
    } catch (e: any) {
      await confirm(d.id, "FAILED", String(e?.message ?? e)); // FAILED agenda retentativa
    }
  }
}`}</Code>
            <p>
              Ao confirmar <strong>DONE</strong>, guarde o ID localmente. Assim, se o servidor cair antes da
              confirmação chegar, você não executa de novo.
            </p>
          </Section>

          <Section id="bedrock" icon={Zap} title="Exemplo Bedrock (Dedicated Server)">
            <Code title="scripts/apollo-delivery.js">{`// Rode no servidor Bedrock com @minecraft/server (Script API)
import { system, world } from "@minecraft/server";

const API_BASE_URL = "https://SEU-DOMINIO/api/v1"; // nunca fixe o domínio no código: use config
const API_KEY = "sk_live_SUA_CHAVE";
const SERVER_ID = "survival-01";
const ADDON_ID = "economy";

const handlers = {}; // { ADD_MONEY: (delivery, player) => {...} }

function registerHandler(action, fn) { handlers[action] = fn; }

async function api(path, options) {
  const res = await fetch(API_BASE_URL + path, {
    ...options,
    headers: { Authorization: "Bearer " + API_KEY, "Content-Type": "application/json" },
  });
  return res;
}

// heartbeat a cada 30s
system.runInterval(async () => {
  await api("/app/heartbeat", {
    method: "POST",
    body: JSON.stringify({ server_id: SERVER_ID }),
  });
}, 600); // 600 ticks = 30s

// consulta a fila a cada 10s
system.runInterval(async () => {
  const res = await api("/app/queued_commands?addon_id=" + ADDON_ID);
  if (!res.ok) return;
  const queue = await res.json();

  for (const d of queue) {
    const nick = d.order.client_identifier;
    const players = world.getPlayers({ name: nick });
    const player = players[0];

    if (!player && !d.offline_execute) {
      await api("/app/command/" + d.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "PENDING", response: "PLAYER_OFFLINE" }),
      });
      continue;
    }

    const handler = handlers[d.action];
    if (!handler) {
      await api("/app/command/" + d.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "FAILED", response: "Sem handler: " + d.action }),
      });
      continue;
    }

    try {
      handler(d, player);
      await api("/app/command/" + d.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "DONE", response: "Entregue com sucesso" }),
      });
    } catch (e) {
      await api("/app/command/" + d.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "FAILED", response: String(e) }),
      });
    }
  }
}, 200); // 200 ticks = 10s

// exemplo de handler
registerHandler("ADD_MONEY", (d, player) => {
  // chame seu banco de economia / scoreboard
  world.scoreboard.getObjective("money")?.setScore(player, d.payload.amount);
});`}</Code>
          </Section>

          <Section id="loja" icon={KeyRound} title="Gerenciando a loja através de addons">
            <p>
              Os endpoints de entrega continuam iguais. Além deles, uma chave com os scopes de
              catálogo pode criar e editar categorias e produtos — que aparecem imediatamente no
              painel, na loja e no catálogo. É o MESMO catálogo: não existe "produto do addon"
              separado de "produto do site".
            </p>

            <p><strong>Criar categoria</strong></p>
            <Code title="POST /api/v1/categories">{`{
  "name": "Kits",
  "slug": "kits",
  "description": "Kits do servidor",
  "server_id": "survival-01",
  "addon_id": "store-manager"
}
→ 201 { "id": "j57...", "name": "Kits", "slug": "kits", "created_at": "..." }`}</Code>

            <p>
              <strong>Listar / obter categoria</strong> — <code className="rounded bg-muted px-1">GET /api/v1/categories</code> e{" "}
              <code className="rounded bg-muted px-1">GET /api/v1/categories/&#123;id&#125;</code> (aceita id, external_id ou slug).
            </p>

            <p><strong>Criar produto (rascunho) com receita de entrega</strong></p>
            <Code title="POST /api/v1/products">{`{
  "name": "Kit Guerreiro",
  "description": "Receba o Kit Guerreiro no servidor.",
  "price": 9.90,
  "category_id": "j57...",
  "external_id": "survival-kit-guerreiro",
  "enabled": false,
  "delivery_recipe": {
    "version": 1,
    "offline_execute": false,
    "actions": [
      { "type": "GIVE_ITEMS", "payload": { "items": [ { "type": "minecraft_item", "format_version": 1, "item": { "type_id": "minecraft:diamond_sword", "amount": 1 } } ] } },
      { "type": "ADD_MONEY", "payload": { "amount": 5000 } }
    ]
  }
}
→ 201 { "id": "j58...", "status": "DRAFT", "external_id": "survival-kit-guerreiro", ... }`}</Code>

            <p>
              <strong>Editar a receita depois</strong> — <code className="rounded bg-muted px-1">PUT /api/v1/products/&#123;id&#125;/delivery-recipe</code>
              (e leia com <code className="rounded bg-muted px-1">GET</code>).
            </p>
            <Code>{`{
  "version": 1,
  "offline_execute": false,
  "actions": [
    { "type": "ADD_RANK", "payload": { "rank": "ouro" },
      "reverse_action": "REMOVE_RANK", "reverse_payload": { "rank": "ouro" },
      "reverse_delay_seconds": 2592000 }
  ]
}`}</Code>

            <p>
              <strong>Publicar / despublicar</strong> — <code className="rounded bg-muted px-1">POST /api/v1/products/&#123;id&#125;/publish</code> e{" "}
              <code className="rounded bg-muted px-1">/unpublish</code>. Um produto em DRAFT não aparece na loja.
            </p>

            <p>
              <strong>Idempotência</strong>: envie <code className="rounded bg-muted px-1">external_id</code> (gerado pelo addon)
              e/ou o header <code className="rounded bg-muted px-1">Idempotency-Key</code>. Repetir a mesma criação devolve o
              mesmo recurso — nunca duplica.
            </p>

            <p>
              <strong>Itens versionados</strong>: o <code className="rounded bg-muted px-1">payload</code> é livre. Para itens, use{" "}
              <code className="rounded bg-muted px-1">&#123; "type": "minecraft_item", "format_version": 1, "item": ... &#125;</code> —
              o addon decide quais campos preservar (nome, lore, encantamentos, durabilidade,
              componentes). A API apenas transporta e guarda a receita.
            </p>

            <p>
              <strong>Imagens</strong>: <code className="rounded bg-muted px-1">POST /api/v1/files/upload-url</code> → poste o
              binário na URL devolvida → <code className="rounded bg-muted px-1">POST /api/v1/files/finalize</code> → use a{" "}
              <code className="rounded bg-muted px-1">url</code> no campo <code className="rounded bg-muted px-1">image</code>.
            </p>

            <p>
              <strong>SDK reutilizável</strong> (importe em qualquer addon — arquivo{" "}
              <code className="rounded bg-muted px-1">src/lib/store-api-client.ts</code>):
            </p>
            <Code title="store-api-client.ts">{`const storeApi = createStoreApi({ baseUrl: "https://SEU-DOMINIO/api/v1", apiKey: "sk_live_..." });

const cat = await storeApi.categories.create({ name: "Kits", external_id: "kits" }, "cat-kits-v1");
const product = await storeApi.products.create({
  name: "Kit Guerreiro",
  price: 9.9,
  category_id: cat.id,
  external_id: "survival-kit-guerreiro",
  delivery_recipe: { version: 1, offline_execute: false, actions: [
    { type: "GIVE_ITEMS", payload: { items: [{ type: "minecraft_item", format_version: 1,
        item: { type_id: "minecraft:diamond_sword", amount: 1 } }] } },
    { type: "ADD_MONEY", payload: { amount: 5000 } },
  ] },
}, "product-survival-kit-guerreiro-v1");

await storeApi.products.publish(product.id);

// a mesma fila de sempre:
const queue = await storeApi.deliveries.getQueue({ addon_id: "store-manager" });
// ... executa no Minecraft ... e confirma:
await storeApi.deliveries.complete(queue[0].id, "DONE", "Kit e moedas entregues");`}</Code>

            <p>Ações registradas na auditoria do painel:</p>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <span className="rounded border px-2 py-1">CATEGORY_CREATED / UPDATED</span>
              <span className="rounded border px-2 py-1">PRODUCT_CREATED / UPDATED</span>
              <span className="rounded border px-2 py-1">PRODUCT_PUBLISHED / UNPUBLISHED</span>
              <span className="rounded border px-2 py-1">DELIVERY_RECIPE_UPDATED</span>
            </div>
          </Section>

          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm">
            <p className="font-semibold text-sky-400">Pronto para conectar</p>
            <p className="mt-1 text-muted-foreground">
              Crie uma chave em <Link to="/painel/integracoes" className="text-primary underline">Integrações</Link>{" "}
              e configure seu addon com <code className="rounded bg-muted px-1">API_BASE_URL</code>,{" "}
              <code className="rounded bg-muted px-1">API_KEY</code>,{" "}
              <code className="rounded bg-muted px-1">SERVER_ID</code> e{" "}
              <code className="rounded bg-muted px-1">ADDON_ID</code>.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
