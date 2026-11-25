import type { ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  KeyRound, ShieldCheck, ListChecks, Send, Clock, HeartPulse, AlertTriangle, ArrowLeft, Zap,
  Download, Boxes, ShieldAlert, History, Wrench,
} from "lucide-react";
import docsMarkdown from "@/content/apollo-api-v1.md?raw";

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
  { id: "kits", label: "Kits e shulkers (parts)" },
  { id: "duplicadas", label: "Duplicidade e falhas" },
  { id: "compat", label: "Pedidos antigos / recuperação" },
  { id: "addon218", label: "Addon v2.1.8 → 2.2.0" },
  { id: "heartbeat", label: "Heartbeat" },
  { id: "erros", label: "Status e códigos de erro" },
  { id: "limites", label: "Rate limit e payloads" },
  { id: "exemplo", label: "Exemplo de addon (registerHandler)" },
  { id: "bedrock", label: "Bedrock Dedicated Server" },
  { id: "localref", label: "LOCAL_REFERENCE (kits/itens)" },
  { id: "upsert", label: "Upsert, revisão e sync" },
  { id: "openapi", label: "OpenAPI e Markdown" },
  { id: "loja", label: "Gerenciar a loja" },
];

/** Baixa a documentação completa em Markdown (mesmo conteúdo desta página). */
function downloadDocs() {
  const blob = new Blob([docsMarkdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "apollo-api-v1.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadDocs}>
              <Download className="mr-2 size-3.5" /> Baixar .md
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-2 size-3.5" /> Voltar à loja
              </Link>
            </Button>
          </div>
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
              Quando um pagamento é aprovado, o site enfileira as entregas por <strong>unidade × ação ×
              shulker</strong>. Seu addon reserva (claim), entrega somente a parte indicada e confirma cada
              shulker individualmente. A API roda nas HTTP actions do Convex que servem esta loja — um
              endereço próprio, sem depender de proxy no front-end. O documento completo também está
              disponível em <strong>Baixar .md</strong>.
            </p>
          </div>

          <Section id="visao" icon={ListChecks} title="Visão geral do fluxo">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Cliente compra → pagamento aprovado (confirmado no backend).</li>
              <li>O site enfileira <strong>um comando por unidade × ação × shulker</strong>, com
                <code className="mx-1 rounded bg-muted px-1">idempotency_key</code> única por parte.</li>
              <li>O addon reserva (claim) as entregas disponíveis; cada comando fica
                <code className="mx-1 rounded bg-muted px-1">PROCESSING</code> por 5 min.</li>
              <li>O addon executa <strong>somente a shulker indicada</strong> por
                <code className="mx-1 rounded bg-muted px-1">part_index</code>/<code className="mx-1 rounded bg-muted px-1">payload.kit_part</code>.</li>
              <li>O addon confirma aquele comando com <code className="rounded bg-muted px-1">PATCH /api/v1/app/command/&#123;id&#125;</code> + <code className="rounded bg-muted px-1">claim_token</code>.</li>
              <li>Quando todas as partes de todas as unidades estão <strong>DONE</strong>, o pedido vira
                <strong>delivered</strong> e os comandos nunca voltam à fila.</li>
            </ol>
          </Section>

          <Section id="config" icon={KeyRound} title="Configuração do addon">
            <p>
              Seu addon precisa apenas de 4 informações. O{" "}
              <code className="rounded bg-muted px-1">API_BASE_URL</code> é o endereço das HTTP actions
              do Convex (o backend de produção da loja):
            </p>
            <Code title="ambiente (.env do addon)">{`API_BASE_URL=https://capable-akita-865.convex.site/api/v1
API_KEY=sk_live_SUA_CHAVE_AQUI
SERVER_ID=survival-01
ADDON_ID=economy`}</Code>
            <p>
              Crie a chave no painel em <strong>Integrações → API de entregas automáticas</strong>. Ela é
              exibida <strong>uma única vez</strong>; guarde-a em local seguro. O servidor armazena apenas o hash.
            </p>

            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-200/90">
              <strong>HTTP 500 em todas as chamadas (inclusive no teste de autenticação)?</strong> Então a
              requisição não chegou nesta API — o problema é o <code className="rounded bg-muted px-1">API_BASE_URL</code>,
              não a chave. Trocar a chave não resolve. Como distinguir pelo corpo da resposta:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code className="rounded bg-muted px-1">500</code> com{" "}
                <code className="rounded bg-muted px-1">{"{ \"code\": \"[Request ID: …] Server Error\" }"}</code> — erro cru do Convex
                antes de executar o código da loja: o endereço aponta para outro deployment (tipicamente um criado
                pelo <code className="rounded bg-muted px-1">convex dev</code>, que expira) ou para um backend fora do ar.
              </li>
              <li>
                <code className="rounded bg-muted px-1">401</code> com{" "}
                <code className="rounded bg-muted px-1">{"{ \"errors\": [{ \"code\": \"MISSING_API_KEY\" }] }"}</code> — endereço{" "}
                <strong>certo</strong> e API no ar (é a resposta esperada numa chamada sem chave).
              </li>
              <li><code className="rounded bg-muted px-1">403 FORBIDDEN_SCOPE</code> — endereço certo, faltou permissão na chave.</li>
              <li><code className="rounded bg-muted px-1">404</code> — o endereço existe, mas não tem a API v1 (confira <code className="rounded bg-muted px-1">/api/v1</code> no fim).</li>
              <li><code className="rounded bg-muted px-1">500 INTERNAL_ERROR</code> em JSON no padrão da loja — aí sim é defeito interno: veja os logs do deployment e informe o <em>Request ID</em>.</li>
            </ul>
            <p>
              Para conferir em um clique, o painel faz a chamada pelo servidor:{" "}
              <strong>Integrações → API de entregas automáticas → Verificar o endereço configurado no addon</strong>.
              Ela não envia chave nenhuma e diz se o endereço responde como esta API.
            </p>
          </Section>

          <Section id="auth" icon={ShieldCheck} title="Autenticação e scopes">
            <p>
              Envie a chave no header. <strong>A chave nunca vai pela URL (query string é recusada).</strong>
            </p>
            <Code>{`Authorization: Bearer sk_live_SUA_CHAVE_AQUI
# alternativa oficial para BDS (SecretString):
X-Api-Key: sk_live_SUA_CHAVE_AQUI`}</Code>
            <p>
              Se os dois cabeçalhos forem enviados com valores diferentes, a requisição é recusada com
              <code className="mx-1 rounded bg-muted px-1">AMBIGUOUS_AUTH</code>. O scope sozinho não basta:
              uma chave ligada a um servidor/addon só acessa os recursos daquele servidor/addon.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><code className="rounded bg-muted px-1">deliveries:read</code> — ler entregas</li>
              <li><code className="rounded bg-muted px-1">deliveries:claim</code> — reservar entregas (claim atômico)</li>
              <li><code className="rounded bg-muted px-1">deliveries:update</code> — confirmar/atualizar entregas</li>
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
              <Endpoint method="POST" path="/api/v1/app/queued_commands/claim" scope="deliveries:claim" />
              <Endpoint method="GET" path="/api/v1/app/user_queue/{user-id}" scope="users:queue" />
              <Endpoint method="GET" path="/api/v1/app/user_schedules/{user-id}" scope="users:schedules" />
              <Endpoint method="PATCH" path="/api/v1/app/command/{command-id}" scope="deliveries:update" />
              <Endpoint method="POST" path="/api/v1/app/heartbeat" scope="server:heartbeat" />
              <Endpoint method="GET" path="/api/v1/app/me" scope="—" />
              <Endpoint method="GET" path="/api/v1/categories" scope="categories:read" />
              <Endpoint method="POST" path="/api/v1/categories" scope="categories:create" />
              <Endpoint method="POST" path="/api/v1/categories/upsert" scope="categories:create" />
              <Endpoint method="GET" path="/api/v1/categories/{id}" scope="categories:read" />
              <Endpoint method="PATCH" path="/api/v1/categories/{id}" scope="categories:update" />
              <Endpoint method="DELETE" path="/api/v1/categories/{id}" scope="categories:delete" />
              <Endpoint method="GET" path="/api/v1/products" scope="products:read" />
              <Endpoint method="POST" path="/api/v1/products" scope="products:create" />
              <Endpoint method="POST" path="/api/v1/products/upsert" scope="products:create" />
              <Endpoint method="GET" path="/api/v1/products/{id}" scope="products:read" />
              <Endpoint method="PATCH" path="/api/v1/products/{id}" scope="products:update" />
              <Endpoint method="DELETE" path="/api/v1/products/{id}" scope="products:delete" />
              <Endpoint method="POST" path="/api/v1/products/{id}/publish" scope="products:publish" />
              <Endpoint method="POST" path="/api/v1/products/{id}/unpublish" scope="products:publish" />
              <Endpoint method="GET" path="/api/v1/products/{id}/delivery-recipe" scope="delivery-recipes:read" />
              <Endpoint method="PUT" path="/api/v1/products/{id}/delivery-recipe" scope="delivery-recipes:write" />
              <Endpoint method="GET" path="/api/v1/sync/changes?cursor=" scope="products:read" />
              <Endpoint method="POST" path="/api/v1/files/upload-url" scope="products:create (ou update)" />
              <Endpoint method="POST" path="/api/v1/files/finalize" scope="products:create (ou update)" />
            </div>
          </Section>

          <Section id="fila" icon={ListChecks} title="Fila: GET /queued_commands">
            <p>
              Retorna apenas entregas <strong>PENDING</strong>, com <code className="rounded bg-muted px-1">execute_at</code> no passado
              e pertencentes ao servidor da chave (ou <code className="rounded bg-muted px-1">GLOBAL</code>).
              Nenhum dado pessoal (CPF, endereço, pagamento) é enviado. Com{" "}
              <code className="rounded bg-muted px-1">parts</code>, a fila devolve
              <strong>uma linha por shulker</strong>, já com{" "}
              <code className="rounded bg-muted px-1">unit_index</code> e os campos de parte.
            </p>
            <p>Filtros opcionais: <code className="rounded bg-muted px-1">?addon_id=apollo-store</code> e <code className="rounded bg-muted px-1">?limit=50</code> (até 200).</p>
            <Code title="Exemplo de resposta (2ª shulker de um kit)">{`[
  {
    "id": "del_m3f8a1b2c9d4",
    "server_id": "survival-01",
    "addon_id": "apollo-store",
    "action": "GIVE_KIT",
    "action_id": "give-kit",
    "step_index": 1,
    "delivery_group_id": "grp_7c1e...",
    "mode": "LOCAL_REFERENCE",
    "reference_id": "kit:kit_god",
    "reference_revision": 1,
    "unit_index": 0,
    "part_index": 1,
    "part_total": 3,
    "part_id": "armas",
    "part_label": "Armas 2/3",
    "command": null,
    "payload": {
      "kit_part": {
        "index": 1,
        "total": 3,
        "id": "armas",
        "label": "Armas 2/3",
        "contents": [{ "type_id": "minecraft:netherite_sword", "name": "Espada", "amount": 1 }]
      }
    },
    "offline_execute": false,
    "execute_at": "2026-11-25T18:00:00.000Z",
    "status": "PENDING",
    "attempts": 0,
    "max_attempts": 5,
    "error_code": null,
    "retryable": null,
    "next_attempt_at": null,
    "requires_manual_intervention": false,
    "resent": null,
    "console_log": "[apollocraft] pedido #GXFZV8NH | GIVE_KIT KIT GOD -> AdrianoMaester | survival-01/apollo-store | shulker 2/3 (Armas) | entrega del_m3f8a1b2c9d4 | tentativa 0/5",
    "order": {
      "id": "#GXFZV8NH",
      "client_identifier": "AdrianoMaester",
      "variables": [
        { "name": "nickname", "value": "AdrianoMaester" },
        { "name": "quantidade", "value": "2" },
        { "name": "parte", "value": "2/3" },
        { "name": "parte_id", "value": "armas" },
        { "name": "parte_nome", "value": "Armas 2/3" },
        { "name": "pedido", "value": "#GXFZV8NH" }
      ]
    }
  }
]`}</Code>
            <p>
              Sem <code className="rounded bg-muted px-1">parts</code>, os campos de parte vêm{" "}
              <code className="mx-1 rounded bg-muted px-1">null</code> e a semântica é a antiga (uma
              entrega por unidade).
            </p>
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

{ "limit": 20, "addon_id": "apollo-store" }`}</Code>
            <Code title="Resposta completa (shulker 2/3 do KIT GOD)">{`{
  "count": 1,
  "data": [
    {
      "id": "del_m3f8a1b2c9d4",
      "server_id": "survival-01",
      "addon_id": "apollo-store",
      "action": "GIVE_KIT",
      "action_id": "give-kit",
      "step_index": 1,
      "delivery_group_id": "grp_7c1e...",
      "mode": "LOCAL_REFERENCE",
      "reference_id": "kit:kit_god",
      "reference_revision": 1,
      "unit_index": 0,
      "part_index": 1,
      "part_total": 3,
      "part_id": "armas",
      "part_label": "Armas 2/3",
      "payload": {
        "kit_part": { "index": 1, "total": 3, "id": "armas", "label": "Armas 2/3", "contents": [] }
      },
      "status": "PROCESSING",
      "attempts": 1,
      "max_attempts": 5,
      "claim_token": "clm_9f2c...",
      "claimed_at": "2026-11-25T18:00:05.000Z",
      "claimed_by": "api_key_id",
      "claim_expires_at": "2026-11-25T18:05:05.000Z",
      "resent": null,
      "console_log": "[apollocraft] pedido #GXFZV8NH | GIVE_KIT KIT GOD -> AdrianoMaester | survival-01/apollo-store | shulker 2/3 (Armas) | entrega del_m3f8a1b2c9d4 | tentativa 1/5",
      "order": {
        "id": "#GXFZV8NH",
        "client_identifier": "AdrianoMaester",
        "variables": [
          { "name": "nickname", "value": "AdrianoMaester" },
          { "name": "quantidade", "value": "2" },
          { "name": "parte", "value": "2/3" },
          { "name": "parte_id", "value": "armas" },
          { "name": "parte_nome", "value": "Armas 2/3" },
          { "name": "pedido", "value": "#GXFZV8NH" }
        ]
      }
    }
  ]
}`}</Code>
            <p>
              <strong>Entregue apenas esta parte.</strong> Um comando com
              <code className="mx-1 rounded bg-muted px-1">part_total &gt; 1</code> representa UMA shulker,
              não o kit inteiro. A próxima shulker vem em outro comando/claim, com outro
              <code className="mx-1 rounded bg-muted px-1">claim_token</code>.
            </p>
            <p>
              <strong>O claim é atômico.</strong> Uma entrega PENDING passa para PROCESSING uma única vez,
              mesmo com dois workers chamando ao mesmo tempo (transação do banco). Guarde o
              <code className="mx-1 rounded bg-muted px-1">claim_token</code> e envie-o ao confirmar.
              Se o lease expirar sem confirmação, a entrega volta para PENDING automaticamente.
            </p>
            <p>
              <strong>Reenvio pelo painel:</strong> quando o operador usa “Reenviar (dar de novo)”, a
              entrega volta para a fila com as tentativas zeradas e o próximo claim traz o bloco
              <code className="mx-1 rounded bg-muted px-1">resent</code> (quantas vezes, quem e quando) junto com
              <code className="mx-1 rounded bg-muted px-1">console_log</code> — uma linha pronta para imprimir no
              console do servidor (<code className="rounded bg-muted px-1">console.log(console_log)</code> ou{" "}
              <code className="rounded bg-muted px-1">tellraw</code>), provando no console que a entrega foi enviada
              de novo e por quem. O histórico completo (criação, cada reenvio, cada claim, respostas e falhas) fica
              no painel em Pedidos → entrega → “Ver log completo”.
            </p>
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
              <code className="mx-1 rounded bg-muted px-1">error_code: "PLAYER_OFFLINE"</code> quando o jogador estiver offline e
              <code className="mx-1 rounded bg-muted px-1">offline_execute</code> for false.
            </p>
          </Section>

          <Section id="confirmar" icon={Send} title="Confirmar entrega: PATCH /command/{id}">
            <p>Status aceitos: <strong>DONE</strong>, <strong>FAILED</strong>, <strong>PENDING</strong>, <strong>CANCELED</strong>.</p>
            <p>
              Quando a entrega foi obtida por <strong>claim</strong>, envie o
              <code className="mx-1 rounded bg-muted px-1">claim_token</code>. Sem ele (ou com token antigo/expirado) a
              confirmação é recusada com <code className="rounded bg-muted px-1">CLAIM_INVALID</code> /{" "}
              <code className="rounded bg-muted px-1">CLAIM_EXPIRED</code>.
            </p>
            <Code title="Sucesso">{`PATCH /api/v1/app/command/del_m3f8a1b2c9d4
Authorization: Bearer sk_live_...
Content-Type: application/json

{ "status": "DONE", "claim_token": "clm_9f2c...", "response": "10000 moedas adicionadas" }`}</Code>
            <Code title="Falha temporária (FAILED + retry com backoff)">{`{
  "status": "FAILED",
  "error_code": "TEMPORARY_STORAGE_ERROR",
  "retryable": true,
  "response": "Chunk não carregou"
}
// backoff: 60s → 5min → 15min → 1h → 2h (máx. 5 tentativas)`}</Code>
            <Code title="Falha definitiva (não repete; exige ação manual)">{`{
  "status": "FAILED",
  "error_code": "REFERENCE_NOT_FOUND",
  "retryable": false,
  "response": "O kit vip_diamante não existe mais neste addon"
}`}</Code>
            <Code title="Jogador offline (não consome tentativa · volta em 2 min)">{`{ "status": "PENDING", "claim_token": "clm_9f2c...", "error_code": "PLAYER_OFFLINE" }`}</Code>
            <Code title="Inventário cheio (não consome tentativa · volta em 60s)">{`{ "status": "PENDING", "claim_token": "clm_9f2c...", "error_code": "INVENTORY_FULL" }`}</Code>
            <Code title="Cancelamento">{`{ "status": "CANCELED", "claim_token": "clm_9f2c...", "reason": "Pedido reembolsado" }`}</Code>
            <p>
              Depois de <strong>DONE</strong> a entrega não volta a aparecer em <code className="rounded bg-muted px-1">queued_commands</code>.
              Cada <strong>shulker</strong> tem seu próprio comando e token: se a 3ª
              shulker falhar, as anteriores NÃO são executadas de novo. Confirmar <strong>DONE</strong> duas
              vezes é idempotente — não duplica a entrega.
            </p>
            <p>
              <strong>Regra do pedido:</strong> ele só é marcado como <code className="rounded bg-muted px-1">delivered</code>{" "}
              quando todos os comandos de todas as unidades × shulkers estiverem <strong>DONE</strong>.
              Enquanto uma parte estiver pendente, o pedido continua <code className="rounded bg-muted px-1">pending</code>.
            </p>
          </Section>

          <Section id="kits" icon={Boxes} title="Kits com várias shulkers (parts)">
            <p>
              Um kit fisicamente distribuído em shulkers declara <code className="rounded bg-muted px-1">parts</code>{" "}
              — uma entrada por shulker. O site cria <strong>um comando por unidade × shulker</strong> e
              cada comando carrega os campos abaixo. <code className="rounded bg-muted px-1">parts</code> é
              opcional: sem ele a ação continua sendo uma entrega única.
            </p>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <span className="rounded border px-2 py-1"><code>part_index</code> · índice da shulker (0 = primeira)</span>
              <span className="rounded border px-2 py-1"><code>part_total</code> · total de shulkers da ação</span>
              <span className="rounded border px-2 py-1"><code>part_id</code> · id estável da parte</span>
              <span className="rounded border px-2 py-1"><code>part_label</code> · nome exibido</span>
              <span className="rounded border px-2 py-1"><code>unit_index</code> · unidade comprada (0 = primeira)</span>
              <span className="rounded bg-muted/40 px-2 py-1"><code>step_index</code> · com várias partes, é o índice da shulker</span>
              <span className="rounded border px-2 py-1"><code>payload.kit_part.index/total/id/label</code></span>
              <span className="rounded border px-2 py-1"><code>payload.kit_part.contents</code> · prévia da parte</span>
            </div>
            <p>
              <code className="rounded bg-muted px-1">payload.kit_part</code> repete os campos de propósito:
              addons que só leem o payload não precisam mudar o parser. O addon deve entregar{" "}
              <strong>somente a shulker de <code className="rounded bg-muted px-1">part_index</code></strong> — nunca o kit inteiro quando{" "}
              <code className="mx-1 rounded bg-muted px-1">part_total &gt; 1</code>.
            </p>
            <p className="font-semibold text-foreground">Exemplo completo — KIT GOD (3 shulkers)</p>
            <Code title="POST /api/v1/products/upsert">{`{
  "external_id": "apollo:kit:kit_god",
  "name": "KIT GOD",
  "price": 24.99,
  "category_id": "apollo:kits",
  "server_id": "survival-01",
  "addon_id": "apollo-store",
  "delivery_recipe": {
    "version": 1,
    "offline_execute": false,
    "actions": [
      {
        "id": "give-kit",
        "type": "GIVE_KIT",
        "mode": "LOCAL_REFERENCE",
        "reference_id": "kit:kit_god",
        "reference_revision": 1,
        "server_id": "survival-01",
        "addon_id": "apollo-store",
        "offline_execute": false,
        "parts": [
          { "id": "armaduras", "label": "Armaduras 1/3" },
          { "id": "armas", "label": "Armas 2/3" },
          { "id": "blocos", "label": "Blocos 3/3" }
        ]
      }
    ]
  }
}`}</Code>
            <p className="font-semibold text-foreground">Exemplo completo — KIT GUERREIRO (3 shulkers)</p>
            <Code title="POST /api/v1/products/upsert">{`{
  "external_id": "apollo:kit:kit_guerreiro",
  "name": "KIT GUERREIRO",
  "price": 24.99,
  "category_id": "apollo:kits",
  "server_id": "survival-01",
  "addon_id": "apollo-store",
  "delivery_recipe": {
    "version": 1,
    "offline_execute": false,
    "actions": [
      {
        "id": "give-kit",
        "type": "GIVE_KIT",
        "mode": "LOCAL_REFERENCE",
        "reference_id": "kit:kit_guerreiro",
        "reference_revision": 1,
        "server_id": "survival-01",
        "addon_id": "apollo-store",
        "offline_execute": false,
        "parts": [
          { "id": "armaduras", "label": "Armaduras 1/3" },
          { "id": "armas", "label": "Armas 2/3" },
          { "id": "blocos", "label": "Blocos 3/3" }
        ]
      }
    ]
  }
}`}</Code>
            <p>
              <strong>Múltiplas unidades:</strong> 2× KIT GUERREIRO gera 6 comandos — chaves{" "}
              <code className="rounded bg-muted px-1">&lt;orderId&gt;:0:0</code>,{" "}
              <code className="rounded bg-muted px-1">…:p2</code>,{" "}
              <code className="rounded bg-muted px-1">…:p3</code>,{" "}
              <code className="rounded bg-muted px-1">…:u2</code>,{" "}
              <code className="rounded bg-muted px-1">…:u2:p2</code>,{" "}
              <code className="rounded bg-muted px-1">…:u2:p3</code>. O pedido só fecha quando as 6
              shulkers estiverem <strong>DONE</strong>.
            </p>
            <p>
              <strong>Quantidade:</strong> com <code className="rounded bg-muted px-1">parts</code>,{" "}
              <code className="mx-1 rounded bg-muted px-1">MULTIPLY</code> gera 1 comando por shulker (payload já
              multiplicado); <code className="mx-1 rounded bg-muted px-1">REPEAT</code> e o padrão geram 1 por
              unidade × shulker; <code className="mx-1 rounded bg-muted px-1">IGNORE</code> gera 1 por shulker,
              sem multiplicar pela quantidade.
            </p>
            <p className="font-semibold text-foreground">Ler e atualizar a receita do produto</p>
            <Code title="GET /api/v1/products/{id}/delivery-recipe">{`{
  "product_id": "j57abc123",
  "delivery_recipe": {
    "version": 1,
    "offline_execute": false,
    "actions": [
      {
        "id": "give-kit",
        "type": "GIVE_KIT",
        "mode": "LOCAL_REFERENCE",
        "reference_id": "kit:kit_god",
        "reference_revision": 1,
        "parts": [
          { "id": "armaduras", "label": "Armaduras 1/3" },
          { "id": "armas", "label": "Armas 2/3" },
          { "id": "blocos", "label": "Blocos 3/3" }
        ]
      }
    ]
  }
}`}</Code>
            <Code title="PUT /api/v1/products/{id}/delivery-recipe">{`{
  "delivery_recipe": {
    "version": 1,
    "expected_revision": 2,
    "actions": [
      {
        "id": "give-kit",
        "type": "GIVE_KIT",
        "mode": "LOCAL_REFERENCE",
        "reference_id": "kit:kit_guerreiro",
        "reference_revision": 1,
        "parts": [
          { "id": "armaduras", "label": "Armaduras 1/3" },
          { "id": "armas", "label": "Armas 2/3" },
          { "id": "blocos", "label": "Blocos 3/3" }
        ]
      }
    ]
  }
}
→ 200 { "product_id": "...", "revision": 3, "delivery_recipe": { ... } }
→ 409 { "errors": [{ "code": "SYNC_CONFLICT" }], "current_revision": 4 }`}</Code>
            <p>
              O mesmo conteúdo pode ir em <code className="rounded bg-muted px-1">delivery_recipe</code> no
              <code className="mx-1 rounded bg-muted px-1">POST /products/upsert</code> ou no
              <code className="mx-1 rounded bg-muted px-1">PATCH /products/&#123;id&#125;</code>. Produtos publicados
              pelo addon usam <code className="rounded bg-muted px-1">expected_revision</code> para evitar
              sobrescrita silenciosa.
            </p>
          </Section>

          <Section id="duplicadas" icon={ShieldAlert} title="Duplicidade, offline, inventário cheio e rede">
            <p>
              O sistema foi desenhado para que uma falha de rede ou um reinício do addon nunca virem duas
              entregas da mesma shulker:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Idempotência por parte:</strong> unidade × ação × shulker tem chave única; recriar não duplica.</li>
              <li><strong>Claim atômico:</strong> dois workers não reservam o mesmo comando.</li>
              <li><strong>Lease de 5 min:</strong> se o addon cair, o comando volta para PENDING após expirar.</li>
              <li><strong>DONE é final:</strong> não retorna à fila; confirmação repetida é idempotente.</li>
              <li><strong>Confirmação por shulker:</strong> confirmar a parte 2 não conclui as partes 3+ nem outras unidades.</li>
              <li><strong>Reenvio só pelo painel:</strong> cria nova tentativa, com autor, data e auditoria.</li>
            </ul>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-xs">
                <thead>
                  <tr className="border-b text-left text-foreground">
                    <th className="py-1.5 pr-3">Situação</th>
                    <th className="py-1.5 pr-3">Addon envia</th>
                    <th className="py-1.5">Site faz</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:border-b [&_td]:py-1.5 [&_td]:pr-3">
                  <tr><td>Jogador offline e <code>offline_execute=false</code></td><td><code>PENDING</code> + <code>PLAYER_OFFLINE</code></td><td>volta em 2 min, sem consumir tentativa</td></tr>
                  <tr><td>Inventário cheio</td><td><code>PENDING</code> + <code>INVENTORY_FULL</code></td><td>volta em 60 s, sem consumir tentativa</td></tr>
                  <tr><td>Timeout ao confirmar</td><td>repete o PATCH com o mesmo <code>claim_token</code></td><td><code>DONE</code> repetido é idempotente</td></tr>
                  <tr><td>Timeout no claim</td><td>repete o claim</td><td>lease impede entrega simultânea</td></tr>
                  <tr><td>Addon reiniciou no meio</td><td>reclama após o lease</td><td>comando volta a <code>PENDING</code></td></tr>
                  <tr><td>Chunk/mundo indisponível</td><td><code>FAILED</code> + <code>TEMPORARY_STORAGE_ERROR</code> + <code>retryable:true</code></td><td>backoff 60s → 5min → 15min → 1h → 2h</td></tr>
                  <tr><td>Kit/revisão inexistente</td><td><code>FAILED</code> + código próprio + <code>retryable:false</code></td><td>falha definitiva, sinalizada no painel</td></tr>
                  <tr><td>Rate limit</td><td>respeita <code>Retry-After</code></td><td>headers <code>X-RateLimit-*</code></td></tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong>Nunca confirme DONE antes de executar o give/spawn.</strong> Para inventário cheio não use{" "}
              <code className="rounded bg-muted px-1">FAILED</code>: isso encerraria a entrega como falha definitiva.
              Use <code className="rounded bg-muted px-1">PENDING</code> + <code className="rounded bg-muted px-1">INVENTORY_FULL</code>.
            </p>
          </Section>

          <Section id="compat" icon={History} title="Pedidos antigos, auditoria e recuperação">
            <p>
              <strong>Compatibilidade:</strong> receitas antigas (sem <code className="rounded bg-muted px-1">parts</code>)
              continuam válidas e geram 1 comando por unidade. Compras antigas usam o snapshot da receita da
              época; alterar o produto agora não muda pedidos já pagos. Pedidos de item único (sem{" "}
              <code className="mx-1 rounded bg-muted px-1">GIVE_KIT</code>) fecham normalmente quando todos os
              comandos ficam <code className="mx-1 rounded bg-muted px-1">DONE</code>.
            </p>
            <p>
              <strong>Kits antigos sem composição:</strong> o site não sabe quantas shulkers faltam, então NÃO
              fecha o pedido automaticamente. Esses pedidos aparecem em{" "}
              <strong>Entregas automáticas → Auditoria de entregas</strong> com o selo{" "}
              <em>kit sem composição de shulkers</em>. Na auditoria de novembro/2026 eram <strong>34 pedidos</strong>,
              incluindo <code className="rounded bg-muted px-1">#GXFZV8NH</code> (2× KIT GUERREIRO) e{" "}
              <code className="rounded bg-muted px-1">#97NP4ZFD</code> (1× KIT GOD).
            </p>
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-red-200/90">
              <strong>Não reenvie esses pedidos agora.</strong> Com o addon 2.1.8, reenviar pode entregar de
              novo o conteúdo que o jogador já recebeu e continuar sem as shulkers restantes. A recuperação só
              é segura depois que o addon entrega por <code className="rounded bg-muted px-1">part_index</code>{" "}
              e é validado em teste.
            </p>
            <p className="font-semibold text-foreground">Procedimento seguro</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Atualize o addon (seção seguinte) e valide em ambiente de teste.</li>
              <li>Publique KIT GOD e KIT GUERREIRO com 3 <code className="rounded bg-muted px-1">parts</code> cada (seção Kits).</li>
              <li>Faça um pedido de teste: 2× kit de 3 shulkers → 6 comandos, 6 confirmações, pedido só fecha na última.</li>
              <li>No painel, abra cada pedido pendente e use <strong>“Entregar shulkers faltantes”</strong>.</li>
              <li>A operação cria somente as partes ausentes, com a mesma chave idempotente; nunca recria parte <code className="rounded bg-muted px-1">DONE</code>.</li>
              <li>Confira a entrega em jogo; o pedido fecha automaticamente ao confirmar todas as partes.</li>
            </ol>
            <p>
              Para <code className="rounded bg-muted px-1">#GXFZV8NH</code> serão 4 comandos (partes 2 e 3 de
              cada uma das 2 unidades) e para <code className="rounded bg-muted px-1">#97NP4ZFD</code> serão 2
              comandos (partes 2 e 3) — total <strong>6 comandos</strong>, sem tocar nas shulkers já recebidas.
              Se a entrega for feita em jogo pela equipe, use a <strong>entrega manual</strong> com observação;
              não reenvie a fila.
            </p>
          </Section>

          <Section id="addon218" icon={Wrench} title="Alterações necessárias no addon v2.1.8">
            <p>
              O addon atual entrega uma shulker por comando. Para compatibilidade total com a API atualizada,
              aplique os itens abaixo e suba a versão para <strong>2.2.0</strong>:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li><strong>Publicar a composição:</strong> envie <code className="rounded bg-muted px-1">parts</code> no
                <code className="mx-1 rounded bg-muted px-1">POST/PATCH /products</code> (GOD e GUERREIRO: 3 partes).</li>
              <li><strong>Ler os campos do claim:</strong> <code className="rounded bg-muted px-1">unit_index</code>,
                <code className="mx-1 rounded bg-muted px-1">part_index</code>,
                <code className="mx-1 rounded bg-muted px-1">part_total</code>,
                <code className="mx-1 rounded bg-muted px-1">part_id</code>,
                <code className="mx-1 rounded bg-muted px-1">part_label</code> e
                <code className="mx-1 rounded bg-muted px-1">payload.kit_part</code>.</li>
              <li><strong>Entregar só a parte:</strong> selecione a shulker por <code className="rounded bg-muted px-1">part_index</code>;
                nunca dê o kit inteiro em um comando com <code className="rounded bg-muted px-1">part_total &gt; 1</code>.</li>
              <li><strong>Confirmar cada comando:</strong> use o <code className="rounded bg-muted px-1">claim_token</code> daquele
                comando; não reuse token de outra shulker.</li>
              <li><strong>Inventário cheio:</strong> devolva <code className="rounded bg-muted px-1">PENDING</code> +
                <code className="mx-1 rounded bg-muted px-1">INVENTORY_FULL</code>.</li>
              <li><strong>Offline:</strong> devolva <code className="rounded bg-muted px-1">PENDING</code> +
                <code className="mx-1 rounded bg-muted px-1">PLAYER_OFFLINE</code> quando
                <code className="mx-1 rounded bg-muted px-1">offline_execute=false</code>.</li>
              <li><strong>Falha de rede:</strong> repita a requisição com o mesmo token; não marque FAILED por timeout local.</li>
              <li><strong>Idempotência local:</strong> persista IDs executados em Dynamic Properties.</li>
              <li><strong>Heartbeat:</strong> anuncie <code className="rounded bg-muted px-1">capabilities: &#123; "local_reference": true, "claim": true, "kit_parts": true &#125;</code>
                e <code className="rounded bg-muted px-1">addon_version: "2.2.0"</code>.</li>
            </ol>
            <Code title="Handler com partes (server-net)">{`async function giveKitPart(d, kit) {
  const total = d.part_total ?? 1;
  const index = d.part_index ?? 0;
  // Cada parte é UMA shulker local. Sem parts (total 1), entrega o kit inteiro.
  const shulkers = total > 1 ? [kit.shulkers[index]] : kit.shulkers;
  for (const shulker of shulkers) {
    const ok = giveShulker(d.order.client_identifier, shulker);
    if (!ok) throw new InventoryFullError("INVENTORY_FULL");
  }
}

// no loop do tick:
try {
  await handler(d);
  await done(d.id, d.claim_token, "Shulker " + ((d.part_index ?? 0) + 1) + "/" + (d.part_total ?? 1) + " entregue");
} catch (e) {
  if (e.code === "INVENTORY_FULL") await pending(d.id, d.claim_token, "INVENTORY_FULL");
  else if (e.code === "PLAYER_OFFLINE") await pending(d.id, d.claim_token, "PLAYER_OFFLINE");
  else await failed(d.id, d.claim_token, "TEMPORARY_STORAGE_ERROR", true, String(e));
}`}</Code>
            <p>
              <strong>Teste obrigatório antes de recuperar pedidos reais:</strong> 2× kit de 3 shulkers → 6
              comandos; confirmar 5 → pedido <code className="rounded bg-muted px-1">pending</code>; confirmar a 6ª
              → <code className="rounded bg-muted px-1">delivered</code>; repetir a confirmação → idempotente;
              inventário cheio → volta em 60s sem consumir tentativa.
            </p>
          </Section>

          <Section id="heartbeat" icon={HeartPulse} title="Heartbeat">
            <Code title="Requisição">{`POST /api/v1/app/heartbeat
Authorization: Bearer sk_live_...

{
  "server_id": "survival-01",
  "addon_version": "2.2.0",
  "minecraft_version": "1.21.0",
  "api_client_version": "1.0.0",
  "capabilities": { "local_reference": true, "claim": true, "kit_parts": true }
}`}</Code>
            <p>
              <code className="rounded bg-muted px-1">kit_parts: true</code> indica que o addon respeita{" "}
              <code className="mx-1 rounded bg-muted px-1">part_index</code> e confirma cada shulker
              individualmente. Versões antigas continuam aparecendo no painel, mas não devem receber
              pedidos com <code className="rounded bg-muted px-1">parts</code> até serem atualizadas.
            </p>
            <p>
              O painel mostra o servidor como 🟢 Online enquanto o heartbeat chega, além da versão do
              addon, versão do Minecraft e o último erro de integração reportado.
            </p>
          </Section>

          <Section id="erros" icon={AlertTriangle} title="Status e códigos de erro">
            <p>
              Todos os erros seguem o mesmo formato. Nunca devolvemos stack trace, caminho de arquivo,
              SQL ou segredo.
            </p>
            <Code>{`{
  "errors": [
    { "message": "Limite de requisições excedido.", "code": "RATE_LIMIT_REACHED" }
  ]
}`}</Code>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <span className="rounded border px-2 py-1"><code>PLAYER_OFFLINE</code> · jogador fora (volta em 2 min)</span>
              <span className="rounded border px-2 py-1"><code>INVENTORY_FULL</code> · inventário cheio (volta em 60 s)</span>
              <span className="rounded border px-2 py-1"><code>HANDLER_NOT_FOUND</code> · addon não conhece a ação</span>
              <span className="rounded border px-2 py-1"><code>REFERENCE_NOT_FOUND</code> · kit/item local removido</span>
              <span className="rounded border px-2 py-1"><code>REFERENCE_REVISION_NOT_FOUND</code> · revisão do kit mudou</span>
              <span className="rounded border px-2 py-1"><code>INVALID_PAYLOAD</code> · dados inválidos</span>
              <span className="rounded border px-2 py-1"><code>TEMPORARY_STORAGE_ERROR</code> · falha temporária</span>
              <span className="rounded border px-2 py-1"><code>CLAIM_EXPIRED</code> · lease expirou</span>
              <span className="rounded border px-2 py-1"><code>CLAIM_INVALID</code> · token inválido/antigo</span>
              <span className="rounded border px-2 py-1"><code>MAX_ATTEMPTS_REACHED</code> · tentativas esgotadas</span>
              <span className="rounded border px-2 py-1"><code>SYNC_CONFLICT</code> · revisão desatualizada</span>
              <span className="rounded border px-2 py-1"><code>IDEMPOTENCY_KEY_REUSED</code> · key reusada com corpo diferente</span>
              <span className="rounded border px-2 py-1"><code>FORBIDDEN_OBJECT</code> · recurso de outro servidor/addon</span>
            </div>
          </Section>

          <Section id="limites" icon={AlertTriangle} title="Rate limit e payloads">
            <ul className="list-disc space-y-1 pl-5">
              <li>GET: <strong>120 req/min</strong> · POST/PATCH/DELETE: <strong>30 req/min</strong> (por chave).</li>
              <li>Headers: <code className="rounded bg-muted px-1">X-RateLimit-Limit</code>, <code className="rounded bg-muted px-1">X-RateLimit-Remaining</code>, <code className="rounded bg-muted px-1">Retry-After</code> (no 429).</li>
              <li>O SDK respeita <code className="rounded bg-muted px-1">Retry-After</code>; caso contrário faz backoff exponencial com jitter.</li>
              <li>Limites de payload: até <strong>25</strong> ações por receita, <strong>12</strong> shulkers por ação (<code className="rounded bg-muted px-1">parts</code>), <strong>64</strong> itens em <code className="rounded bg-muted px-1">contents_preview</code>, ≤ 20&nbsp;000 caracteres por <code className="rounded bg-muted px-1">payload</code>, nome ≤ 120, descrição ≤ 5000, <code className="rounded bg-muted px-1">external_id</code>/<code className="rounded bg-muted px-1">reference_id</code> ≤ 160.</li>
              <li>Fila: até <strong>200</strong> comandos por chamada (padrão 50) · claim: até <strong>100</strong> (padrão 20) · lease de <strong>5 min</strong>.</li>
            </ul>
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
              sabe executar. Ação desconhecida nunca é executada: devolva <code className="rounded bg-muted px-1">HANDLER_NOT_FOUND</code>.
            </p>
            <Code title="addon.ts">{`type Delivery = {
  id: string;
  action: string;
  action_id: string | null;
  step_index: number | null;
  mode: "SERVER" | "LOCAL_REFERENCE";
  reference_id: string | null;
  reference_revision: number | null;
  // Kits com várias shulkers: entregue SOMENTE a parte indicada.
  unit_index: number | null;
  part_index: number | null;
  part_total: number | null;
  part_id: string | null;
  part_label: string | null;
  payload: { kit_part?: { index: number; total: number; id: string; label: string; contents: any[] } } & Record<string, any>;
  offline_execute: boolean;
  claim_token: string;
  order: { id: string; client_identifier: string; variables: { name: string; value: string }[] };
};

const handlers: Record<string, (d: Delivery) => Promise<void>> = {};
export function registerHandler(action: string, fn: (d: Delivery) => Promise<void>) {
  handlers[action] = fn;
}

registerHandler("ADD_MONEY", async (d) => { addMoney(d.order.client_identifier, d.payload.amount); });
registerHandler("ADD_RANK", async (d) => { addRank(d.order.client_identifier, d.payload.rank); });
registerHandler("GIVE_KIT", async (d) => {
  const kit = loadKit(d.reference_id);
  const parts = d.part_total ?? 1;
  const shulkers = parts > 1 ? [kit.shulkers[d.part_index ?? 0]] : kit.shulkers;
  for (const shulker of shulkers) giveShulker(d.order.client_identifier, shulker);
});
// Ação desconhecida → HANDLER_NOT_FOUND (veja o loop abaixo).`}</Code>
            <p>
              Persistência local: guarde os IDs já concluídos em <strong>Dynamic Properties</strong> (pequenos
              metadados), não em um <code className="rounded bg-muted px-1">new Set()</code> em memória — um
              reinício do servidor perderia a idempotência local.
            </p>
          </Section>

          <Section id="bedrock" icon={Zap} title="Bedrock Dedicated Server (o jeito oficial)">
            <p>
              No <strong>Bedrock Dedicated Server (BDS)</strong> o <code className="rounded bg-muted px-1">fetch()</code>{" "}
              <strong>não existe</strong>. A integração HTTP oficial usa os módulos{" "}
              <code className="rounded bg-muted px-1">@minecraft/server-net</code> (requisições) e{" "}
              <code className="rounded bg-muted px-1">@minecraft/server-admin</code> (variáveis e secrets).
            </p>
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-200/90">
              <strong>Realms:</strong> essa integração NÃO funciona em Realms. O módulo{" "}
              <code className="rounded bg-muted px-1">@minecraft/server-net</code> só é suportado em{" "}
              <strong>Bedrock Dedicated Server</strong>.
            </p>

            <p className="font-semibold text-foreground">1) Autorize os módulos no BDS — permissions.json</p>
            <p>
              Copie para <code className="rounded bg-muted px-1">config/&lt;SCRIPT_MODULE_UUID&gt;/permissions.json</code>.
              Um módulo de comportamento tem um UUID próprio — use o mesmo que aparece no{" "}
              <code className="rounded bg-muted px-1">manifest.json</code>.
            </p>
            <Code title="config/<SCRIPT_MODULE_UUID>/permissions.json">{`{
  "allowed_modules": [
    "@minecraft/server",
    "@minecraft/server-ui",
    "@minecraft/server-admin",
    "@minecraft/server-net"
  ],
  "module_permissions": {
    "@minecraft/server-net": {
      "allowed_uris": [
        "https://capable-akita-865.convex.site/api/v1/",
        "https://capable-akita-865.convex.site/api/v1"
      ]
    }
  }
}`}</Code>
            <p>
              <strong>allowed_uris</strong> precisa conter o endereço da API (HTTP actions do Convex). Se ele mudar,
              atualize este arquivo e reinicie o BDS. Há também{" "}
              <code className="rounded bg-muted px-1">force_https</code> e limites de{" "}
              <code className="rounded bg-muted px-1">body</code>/<code className="rounded bg-muted px-1">concurrency</code>{" "}
              suportados pelo <code className="rounded bg-muted px-1">@minecraft/server-net</code>:
            </p>
            <Code title="exemplo com limites (opcional)">{`{
  "allowed_modules": ["@minecraft/server", "@minecraft/server-admin", "@minecraft/server-net"],
  "module_permissions": {
    "@minecraft/server-net": {
      "allowed_uris": ["https://capable-akita-865.convex.site/api/v1"],
      "force_https": true,
      "max_body_bytes": 262144,
      "max_concurrent_requests": 2
    }
  }
}`}</Code>

            <p className="font-semibold text-foreground">2) variables.json (não secreto)</p>
            <Code title="config/<SCRIPT_MODULE_UUID>/variables.json">{`{
  "API_BASE_URL": "https://capable-akita-865.convex.site/api/v1",
  "SERVER_ID": "survival-01",
  "ADDON_ID": "apollo-store",
  "POLL_INTERVAL": 10,
  "HEARTBEAT_INTERVAL": 30
}`}</Code>

            <p className="font-semibold text-foreground">3) secrets.json (a API Key vive aqui)</p>
            <Code title="config/<SCRIPT_MODULE_UUID>/secrets.json">{`{
  "APOLLO_API_KEY": "sk_live_SUA_CHAVE_AQUI"
}`}</Code>
            <p>
              O <code className="rounded bg-muted px-1">SecretString</code> do{" "}
              <code className="rounded bg-muted px-1">@minecraft/server-admin</code> deve permanecer secreto.
              Não converta, não imprima, não faça <code className="rounded bg-muted px-1">console.warn</code> do conteúdo.
              Passe o secret direto para o <code className="rounded bg-muted px-1">HttpHeader</code>.
            </p>

            <p className="font-semibold text-foreground">4) Cliente HTTP (server-net) — scripts/apollo-client.js</p>
            <Code title="scripts/apollo-client.js">{`import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";
import { variables, secrets } from "@minecraft/server-admin";

const BASE = variables.get("API_BASE_URL");      // https://capable-akita-865.convex.site/api/v1
const SERVER_ID = variables.get("SERVER_ID");
const ADDON_ID = variables.get("ADDON_ID");
const POLL_INTERVAL = Number(variables.get("POLL_INTERVAL") ?? 10);       // 5-10s
const HEARTBEAT_INTERVAL = Number(variables.get("HEARTBEAT_INTERVAL") ?? 30); // ~30s
const API_KEY = secrets.get("APOLLO_API_KEY");   // SecretString — nunca expor

// ── Utilitário: requisição autenticada com X-Api-Key ──
async function api(method, path, body) {
  const url = BASE.replace(/\\/+$/, "") + path;
  const req = new HttpRequest(url);
  req.method = method;                                   // HttpRequestMethod.Get / Post / Patch
  // O SecretString é usado direto no header: o JS nunca precisa ler o valor.
  req.headers = [new HttpHeader("X-Api-Key", API_KEY), new HttpHeader("Content-Type", "application/json")];
  if (body !== undefined) req.body = JSON.stringify(body);

  const res = await http.request(req);
  const text = res.body ?? "";
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, retryAfter: Number(res.headers?.find?.((h) => h.name === "Retry-After")?.value ?? 0) };
}

// ── Handshake: botão "Testar conexão" ──
export async function testConnection() {
  const r = await api(HttpRequestMethod.Get, "/app/me");
  if (r.status !== 200) return { ok: false, status: r.status, error: r.json?.errors?.[0]?.code };
  return { ok: true, key: r.json.key, binding: r.json.binding, capabilities: r.json.capabilities };
}

// ── Heartbeat ──
export async function sendHeartbeat(capabilities) {
  return api(HttpRequestMethod.Post, "/app/heartbeat", {
    server_id: SERVER_ID,
    addon_version: "1.0.0",
    minecraft_version: "1.21.0",
    api_client_version: "1.0.0",
    capabilities,
  });
}

// ── Claim de entregas ──
export async function claimDeliveries(limit = 10) {
  const r = await api(HttpRequestMethod.Post, "/app/queued_commands/claim", { limit, addon_id: ADDON_ID });
  if (r.status === 429 && r.retryAfter) throw new Error("rate-limited:" + r.retryAfter);
  if (r.status !== 200) throw new Error("claim-failed:" + r.status);
  return r.json.data; // cada item traz claim_token
}

// ── Confirmações ──
const done = (id, token, response) =>
  api(HttpRequestMethod.Patch, "/app/command/" + id, { status: "DONE", claim_token: token, response });
const offline = (id, token) =>
  api(HttpRequestMethod.Patch, "/app/command/" + id, { status: "PENDING", claim_token: token, error_code: "PLAYER_OFFLINE" });
const failed = (id, token, code, retryable, response) =>
  api(HttpRequestMethod.Patch, "/app/command/" + id, { status: "FAILED", claim_token: token, error_code: code, retryable, response });

// ── Handlers (só executa o que conhece) ──
const handlers = {};
export function registerHandler(action, fn) { handlers[action] = fn; }

export async function tick(isPlayerOnline) {
  let queue;
  try { queue = await claimDeliveries(); }
  catch (e) { if (String(e).includes("rate-limited")) return; throw e; } // respeita 429

  for (const d of queue) {
    const handler = handlers[d.action];
    if (!handler) { await failed(d.id, d.claim_token, "HANDLER_NOT_FOUND", false, "Sem handler"); continue; }
    if (!isPlayerOnline(d.order.client_identifier) && !d.offline_execute) {
      await offline(d.id, d.claim_token);            // NÃO consome max_attempts
      continue;
    }
    try {
      await handler(d);                              // executa no Minecraft
      await done(d.id, d.claim_token, "Entregue");   // confirma com o claim_token
    } catch (e) {
      await failed(d.id, d.claim_token, "TEMPORARY_STORAGE_ERROR", true, String(e));
    }
  }
}

// ── Polling configurável (nunca por tick!) ──
export function start() {
  system.runInterval(() => tick((nick) => world.getAllPlayers().some((p) => p.name === nick)), POLL_INTERVAL * 20);
  system.runInterval(() => sendHeartbeat({ local_reference: true, claim: true }), HEARTBEAT_INTERVAL * 20);
}`}</Code>
            <p>
              Observação: as versões dos módulos (<code className="rounded bg-muted px-1">@minecraft/server</code>,{" "}
              <code className="rounded bg-muted px-1">@minecraft/server-net</code>, etc.) devem ser as
              compatíveis com o seu BDS. Não troque a versão às cegas — ajuste pelo{" "}
              <code className="rounded bg-muted px-1">manifest.json</code> do seu addon.
            </p>
          </Section>

          <Section id="localref" icon={KeyRound} title="LOCAL_REFERENCE — kits e itens complexos">
            <p>
              Para <strong>itens/kits complexos</strong> (shulkers, itens encantados, lore, componentes,
              NBT que muda por versão), o item permanece armazenado <strong>no Minecraft</strong>. O site
              guarda apenas a <strong>referência</strong> e uma prévia para exibição.
            </p>
            <Code title="Ação de entrega LOCAL_REFERENCE">{`{
  "id": "give-kit",
  "type": "GIVE_KIT",
  "mode": "LOCAL_REFERENCE",
  "reference_id": "kit:vip_diamante",
  "reference_revision": 3,
  "contents_preview": [
    { "type_id": "minecraft:diamond_sword", "name": "Espada", "amount": 1 }
  ],
  "parts": [
    { "id": "armaduras", "label": "Armaduras" },
    { "id": "armas", "label": "Armas" },
    { "id": "blocos", "label": "Blocos" }
  ]
}`}</Code>
            <p>
              <strong>contents_preview serve SOMENTE para exibição/documentação.</strong> O site NUNCA
              reconstrói o item a partir da prévia — quem entrega é o addon, resolvendo{" "}
              <code className="rounded bg-muted px-1">reference_id</code> (e{" "}
              <code className="rounded bg-muted px-1">reference_revision</code>) localmente.
            </p>
            <p>
              <strong>Kits com várias shulkers:</strong> declare <code className="rounded bg-muted px-1">parts</code>{" "}
              com uma entrada por shulker. O site cria <strong>um comando por unidade × shulker</strong> e cada
              comando traz <code className="rounded bg-muted px-1">part_index</code>,{" "}
              <code className="rounded bg-muted px-1">part_total</code>,{" "}
              <code className="rounded bg-muted px-1">part_id</code>,{" "}
              <code className="rounded bg-muted px-1">part_label</code> e{" "}
              <code className="rounded bg-muted px-1">payload.kit_part</code> (também refletidos em{" "}
              <code className="rounded bg-muted px-1">step_index</code>). Entregue <strong>somente aquela shulker</strong>{" "}
              e confirme aquele comando com <code className="rounded bg-muted px-1">claim_token</code>. O pedido só é
              marcado como entregue quando todas as partes de todas as unidades estiverem DONE. Sem{" "}
              <code className="rounded bg-muted px-1">parts</code>, a ação continua sendo uma entrega única.
            </p>
            <p>
              <strong>Revision:</strong> quando o admin altera o kit local, ele incrementa a revisão e o
              addon atualiza o produto com <code className="rounded bg-muted px-1">reference_revision</code> novo.
              Compras antigas continuam com o snapshot da revisão antiga. Se o addon não achar a referência,
              responda com o código exato:
            </p>
            <Code>{`{ "status": "FAILED", "error_code": "REFERENCE_NOT_FOUND", "retryable": false }
{ "status": "FAILED", "error_code": "REFERENCE_REVISION_NOT_FOUND", "retryable": false }`}</Code>

            <p className="font-semibold text-foreground">Fluxo Apollo — KIT</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Admin mira em uma shulker (pode juntar shulkers complementares).</li>
              <li>O addon salva o kit localmente como <code className="rounded bg-muted px-1">kit:vip_diamante</code>.</li>
              <li>O addon cria/atualiza a categoria e faz <code className="rounded bg-muted px-1">POST /products/upsert</code> com a receita LOCAL_REFERENCE.</li>
              <li>Publica (<code className="rounded bg-muted px-1">/publish</code>).</li>
              <li>Cliente compra → o site cria o snapshot da receita.</li>
              <li>O addon faz claim, carrega <code className="rounded bg-muted px-1">kit:vip_diamante</code> local e entrega <strong>a shulker indicada</strong> por <code className="rounded bg-muted px-1">part_index</code>, confirmando cada comando separadamente.</li>
            </ol>

            <p className="font-semibold text-foreground">Fluxo Apollo — ITEM</p>
            <p>
              Admin segura um item; o addon faz uma cópia local fiel como{" "}
              <code className="rounded bg-muted px-1">item:espada_especial</code> e publica um produto com
              <code className="mx-1 rounded bg-muted px-1">GIVE_ITEM</code> + <code className="rounded bg-muted px-1">LOCAL_REFERENCE</code>.
              O site nunca precisa entender os componentes internos do ItemStack.
            </p>
            <p>
              Se um kit/item local for removido e houver produto publicado dependendo dele, use{" "}
              <code className="rounded bg-muted px-1">/products/&#123;id&#125;/unpublish</code> (ou marque como
              indisponível) para não vender algo quebrado. No painel, a entrega aparece como{" "}
              <strong>Local Reference</strong> com servidor, addon e referência.
            </p>
          </Section>

          <Section id="upsert" icon={ListChecks} title="Upsert, revisão e sincronização incremental">
            <p>
              Use <strong>upsert</strong> (não delete+create) em todo "Sincronizar novamente". A chave natural é{" "}
              <code className="rounded bg-muted px-1">server_id + addon_id + external_id</code>: repetir nunca
              duplica e preserva o ID remoto, o histórico e as estatísticas.
            </p>
            <Code title="POST /api/v1/products/upsert">{`{
  "external_id": "apollo:kit:vip_diamante",
  "name": "Kit VIP Diamante",
  "price": 19.90,
  "category_id": "apollo:kits",
  "delivery_recipe": {
    "version": 1,
    "actions": [{
      "id": "give-kit", "type": "GIVE_KIT", "mode": "LOCAL_REFERENCE",
      "reference_id": "kit:vip_diamante", "reference_revision": 3,
      "parts": [
        { "id": "armaduras", "label": "Armaduras 1/2" },
        { "id": "armas", "label": "Armas 2/2" }
      ]
    }]
  }
}
→ 201 (criado) ou 200 (atualizado) — sempre o mesmo "id"`}</Code>
            <p>
              <strong>Revisão / conflito:</strong> produtos e categorias têm{" "}
              <code className="rounded bg-muted px-1">revision</code> (incrementa a cada alteração). Ao editar,
              envie <code className="rounded bg-muted px-1">expected_revision</code>; se o site estiver numa
              revisão mais nova, a resposta é <code className="rounded bg-muted px-1">409 SYNC_CONFLICT</code> com{" "}
              <code className="rounded bg-muted px-1">current_revision</code> — sem sobrescrita silenciosa.
            </p>
            <Code title="PATCH /api/v1/products/{id}">{`{ "name": "Novo nome", "expected_revision": 4 }
→ 409 { "errors": [ { "code": "SYNC_CONFLICT", ... } ], "current_revision": 5 }`}</Code>
            <p>
              <strong>Sync incremental:</strong> guarde o cursor e busque só o que mudou (produtos, categorias
              e recursos arquivados / tombstones):
            </p>
            <Code title="GET /api/v1/sync/changes?cursor=0">{`{
  "changes": [
    { "kind": "PRODUCT_UPDATED", "id": "j58...", "external_id": "apollo:kit:vip", "revision": 2, "delivery_mode": "LOCAL_REFERENCE", "reference_id": "kit:vip_diamante", ... },
    { "kind": "PRODUCT_ARCHIVED", "id": "j57...", "external_id": "apollo:kit:antigo", "updated_at": "..." }
  ],
  "next_cursor": "1730000000000",
  "has_more": false
}`}</Code>
            <p>
              <strong>Idempotency-Key:</strong> envie o header nas criações. A mesma key com o mesmo corpo
              reexecuta nenhuma vez (replay da mesma resposta); com corpo diferente devolve{" "}
              <code className="rounded bg-muted px-1">409 IDEMPOTENCY_KEY_REUSED</code>.
            </p>
            <p>
              <strong>Status de sincronização no addon:</strong>{" "}
              <code className="rounded bg-muted px-1">SYNCED</code>,{" "}
              <code className="rounded bg-muted px-1">LOCAL_ONLY</code>,{" "}
              <code className="rounded bg-muted px-1">SYNC_ERROR</code>,{" "}
              <code className="rounded bg-muted px-1">CONFLICT</code>. Se a API falhar, o item/kit local NÃO
              pode ser perdido — tente novamente depois.
            </p>
          </Section>

          <Section id="openapi" icon={ListChecks} title="OpenAPI e Markdown">
            <p>
              A especificação OpenAPI 3.1 está em{" "}
              <a href="/openapi-v1.json" className="text-primary underline" target="_blank" rel="noreferrer">
                /openapi-v1.json
              </a>
              . Ela reflete as rotas, schemas, scopes e respostas desta página — importe no Postman/Insomnia
              ou gere clientes. Inclui <code className="rounded bg-muted px-1">parts</code> e os campos de
              shulker no comando.
            </p>
            <p>
              O documento completo também pode ser baixado em Markdown (mesmo conteúdo desta página):
            </p>
            <Button variant="outline" size="sm" onClick={downloadDocs}>
              <Download className="mr-2 size-3.5" /> Baixar documentação completa (.md)
            </Button>
          </Section>

          <Section id="loja" icon={KeyRound} title="Gerenciando a loja através de addons">
            <p>
              Uma chave com os scopes de catálogo pode criar e editar categorias e produtos — que aparecem
              imediatamente no painel, na loja e no catálogo. É o MESMO catálogo: não existe "produto do
              addon" separado de "produto do site".
            </p>

            <p><strong>Criar/atualizar categoria</strong></p>
            <Code title="POST /api/v1/categories/upsert">{`{
  "external_id": "apollo:kits",
  "name": "Kits",
  "server_id": "survival-01",
  "addon_id": "apollo-store"
}
→ 201 { "id": "j57...", "revision": 1, ... }
→ 200 (na próxima vez, atualiza e revision vira 2)`}</Code>

            <p>
              <strong>Listar / obter</strong> — <code className="rounded bg-muted px-1">GET /api/v1/categories</code> e{" "}
              <code className="rounded bg-muted px-1">GET /api/v1/categories/&#123;id&#125;</code> (aceita id, external_id ou slug).
            </p>

            <p><strong>Publicar / despublicar</strong> — <code className="rounded bg-muted px-1">POST /api/v1/products/&#123;id&#125;/publish</code> e{" "}
              <code className="rounded bg-muted px-1">/unpublish</code>. Um produto em DRAFT não aparece na loja.
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
            <Code title="store-api-client.ts">{`const storeApi = createStoreApi({
  baseUrl: "https://capable-akita-865.convex.site/api/v1",
  apiKey: "sk_live_...",
  serverId: "survival-01",
  addonId: "apollo-store",
  authHeader: "x-api-key",                    // no BDS (SecretString já vem pronto)
  // transport: bedrockTransport,             // no BDS use http.request de @minecraft/server-net
});

await storeApi.connection.test();             // handshake /app/me
const cat = await storeApi.categories.upsert({ external_id: "apollo:kits", name: "Kits" });
const product = await storeApi.products.upsert({
  external_id: "apollo:kit:vip_diamante",
  name: "Kit VIP Diamante",
  price: 19.9,
  category_id: cat.id,
  delivery_recipe: { version: 1, actions: [
    { id: "give-kit", type: "GIVE_KIT", mode: "LOCAL_REFERENCE",
      reference_id: "kit:vip_diamante", reference_revision: 3 },
  ] },
});
await storeApi.products.publish(product.id);

// entrega:
const { data } = await storeApi.deliveries.claim({ limit: 10 });
for (const d of data) {
  // ... resolve d.reference_id local e executa ...
  await storeApi.deliveries.done(d.id, d.claim_token, "Entregue");
}

// sincronização incremental:
const sync = await storeApi.sync.changes("0");`}</Code>

            <p>Ações registradas na auditoria do painel:</p>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <span className="rounded border px-2 py-1">CATEGORY_CREATED / UPDATED / ARCHIVED</span>
              <span className="rounded border px-2 py-1">PRODUCT_CREATED / UPDATED</span>
              <span className="rounded border px-2 py-1">PRODUCT_PUBLISHED / UNPUBLISHED / ARCHIVED</span>
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
