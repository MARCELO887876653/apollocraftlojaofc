import{c as x,j as e,Z as i,B as h,k as p,h as j,S as m,K as g,a1 as v,T as u}from"./index-WPx9H7Yp.js";import{B as b}from"./badge-CPgYtsMf.js";import{K as l}from"./key-round-CmcVfyzj.js";const N=[["path",{d:"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",key:"mvr1a0"}],["path",{d:"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27",key:"auskq0"}]],_=x("heart-pulse",N);const E=[["path",{d:"M13 5h8",key:"a7qcls"}],["path",{d:"M13 12h8",key:"h98zly"}],["path",{d:"M13 19h8",key:"c3s6r1"}],["path",{d:"m3 17 2 2 4-4",key:"1jhpwq"}],["path",{d:"m3 7 2 2 4-4",key:"1obspn"}]],n=x("list-checks",E);function a({children:d,title:o}){return e.jsxs("div",{className:"overflow-hidden rounded-xl border border-border/70 bg-[#0d1420]",children:[o&&e.jsx("div",{className:"border-b border-border/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",children:o}),e.jsx("pre",{className:"overflow-x-auto p-3 text-[12px] leading-relaxed text-sky-100/90",children:d})]})}function r({id:d,icon:o,title:t,children:c}){return e.jsxs("section",{id:d,className:"scroll-mt-24",children:[e.jsxs("h2",{className:"mb-3 flex items-center gap-2 text-xl font-extrabold tracking-tight",children:[e.jsx(o,{className:"size-5 text-sky-400"})," ",t]}),e.jsx("div",{className:"space-y-3 text-sm text-muted-foreground",children:c})]})}function s({method:d,path:o,scope:t}){const c=d==="GET"?"bg-emerald-500/15 text-emerald-400":d==="POST"?"bg-sky-500/15 text-sky-400":"bg-amber-500/15 text-amber-400";return e.jsxs("div",{className:"flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2",children:[e.jsx("span",{className:`rounded px-2 py-0.5 font-mono text-xs font-bold ${c}`,children:d}),e.jsx("code",{className:"font-mono text-xs text-foreground",children:o}),e.jsx("span",{className:"ml-auto font-mono text-[11px] text-muted-foreground",children:t})]})}const f=[{id:"visao",label:"Visão geral"},{id:"config",label:"Configuração do addon"},{id:"auth",label:"Autenticação e scopes"},{id:"endpoints",label:"Endpoints"},{id:"fila",label:"Fila (queued_commands)"},{id:"claim",label:"Claim seguro"},{id:"jogador",label:"Fila por jogador / agendamentos"},{id:"confirmar",label:"Confirmar entrega"},{id:"heartbeat",label:"Heartbeat"},{id:"erros",label:"Status e códigos de erro"},{id:"limites",label:"Rate limit e payloads"},{id:"exemplo",label:"Exemplo de addon (registerHandler)"},{id:"bedrock",label:"Bedrock Dedicated Server"},{id:"localref",label:"LOCAL_REFERENCE (kits/itens)"},{id:"upsert",label:"Upsert, revisão e sync"},{id:"openapi",label:"OpenAPI"},{id:"loja",label:"Gerenciar a loja"}];function O(){return e.jsxs("div",{className:"min-h-screen bg-background text-foreground",children:[e.jsx("header",{className:"sticky top-0 z-20 border-b bg-background/85 backdrop-blur-xl",children:e.jsxs("div",{className:"mx-auto flex h-16 max-w-6xl items-center gap-3 px-4",children:[e.jsx("span",{className:"flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/25",children:e.jsx(i,{className:"size-4.5 text-sky-950"})}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm font-extrabold leading-tight",children:"API de Entregas · Apollo Craft"}),e.jsx("p",{className:"text-[11px] text-muted-foreground",children:"v1 · fila de comandos para addons"})]}),e.jsx(h,{asChild:!0,variant:"outline",size:"sm",className:"ml-auto",children:e.jsxs(p,{to:"/",children:[e.jsx(j,{className:"mr-2 size-3.5"})," Voltar à loja"]})})]})}),e.jsxs("div",{className:"mx-auto flex max-w-6xl gap-8 px-4 py-8",children:[e.jsxs("aside",{className:"sticky top-24 hidden h-fit w-52 shrink-0 lg:block",children:[e.jsx("p",{className:"mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground",children:"Índice"}),e.jsx("nav",{className:"space-y-1",children:f.map(d=>e.jsx("a",{href:`#${d.id}`,className:"block rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",children:d.label},d.id))})]}),e.jsxs("main",{className:"min-w-0 flex-1 space-y-10",children:[e.jsxs("div",{children:[e.jsx(b,{className:"bg-sky-500/15 text-sky-400 hover:bg-sky-500/15",children:"API v1"}),e.jsx("h1",{className:"mt-3 text-3xl font-black tracking-tight",children:"Entrega automática para addons"}),e.jsx("p",{className:"mt-2 max-w-2xl text-sm text-muted-foreground",children:"Quando um pagamento é aprovado, o site cria automaticamente uma entrega na fila. Seu addon consulta a fila, executa a ação no servidor e confirma o resultado. A API roda nas HTTP actions do Convex que servem esta loja — um endereço próprio, sem depender de proxy no front-end."})]}),e.jsx(r,{id:"visao",icon:n,title:"Visão geral do fluxo",children:e.jsxs("ol",{className:"list-decimal space-y-1 pl-5",children:[e.jsx("li",{children:"Cliente compra → pagamento aprovado (confirmado no backend)."}),e.jsxs("li",{children:["O site cria a(s) entrega(s) com ",e.jsx("code",{className:"rounded bg-muted px-1",children:"idempotency_key"})," única por ação."]}),e.jsx("li",{children:"O addon reserva (claim) as entregas disponíveis."}),e.jsxs("li",{children:["O addon executa a ",e.jsx("code",{className:"rounded bg-muted px-1",children:"action"})," no Minecraft."]}),e.jsxs("li",{children:["O addon confirma com ",e.jsx("code",{className:"rounded bg-muted px-1",children:"PATCH /api/v1/app/command/{id}"})," + ",e.jsx("code",{className:"rounded bg-muted px-1",children:"claim_token"}),"."]}),e.jsxs("li",{children:["A entrega vira ",e.jsx("strong",{children:"DONE"})," e nunca mais aparece na fila."]})]})}),e.jsxs(r,{id:"config",icon:l,title:"Configuração do addon",children:[e.jsxs("p",{children:["Seu addon precisa apenas de 4 informações. O"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"API_BASE_URL"})," é o endereço das HTTP actions do Convex (o backend de produção da loja):"]}),e.jsx(a,{title:"ambiente (.env do addon)",children:`API_BASE_URL=https://capable-akita-865.convex.site/api/v1
API_KEY=sk_live_SUA_CHAVE_AQUI
SERVER_ID=survival-01
ADDON_ID=economy`}),e.jsxs("p",{children:["Crie a chave no painel em ",e.jsx("strong",{children:"Integrações → API de entregas automáticas"}),". Ela é exibida ",e.jsx("strong",{children:"uma única vez"}),"; guarde-a em local seguro. O servidor armazena apenas o hash."]}),e.jsxs("p",{className:"rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-200/90",children:[e.jsx("strong",{children:"HTTP 500 em todas as chamadas (inclusive no teste de autenticação)?"})," Então a requisição não chegou nesta API — o problema é o ",e.jsx("code",{className:"rounded bg-muted px-1",children:"API_BASE_URL"}),", não a chave. Trocar a chave não resolve. Como distinguir pelo corpo da resposta:"]}),e.jsxs("ul",{className:"list-disc space-y-1 pl-5",children:[e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"500"})," com"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:'{ "code": "[Request ID: …] Server Error" }'})," — erro cru do Convex antes de executar o código da loja: o endereço aponta para outro deployment (tipicamente um criado pelo ",e.jsx("code",{className:"rounded bg-muted px-1",children:"convex dev"}),", que expira) ou para um backend fora do ar."]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"401"})," com"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:'{ "errors": [{ "code": "MISSING_API_KEY" }] }'})," — endereço"," ",e.jsx("strong",{children:"certo"})," e API no ar (é a resposta esperada numa chamada sem chave)."]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"403 FORBIDDEN_SCOPE"})," — endereço certo, faltou permissão na chave."]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"404"})," — o endereço existe, mas não tem a API v1 (confira ",e.jsx("code",{className:"rounded bg-muted px-1",children:"/api/v1"})," no fim)."]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"500 INTERNAL_ERROR"})," em JSON no padrão da loja — aí sim é defeito interno: veja os logs do deployment e informe o ",e.jsx("em",{children:"Request ID"}),"."]})]}),e.jsxs("p",{children:["Para conferir em um clique, o painel faz a chamada pelo servidor:"," ",e.jsx("strong",{children:"Integrações → API de entregas automáticas → Verificar o endereço configurado no addon"}),". Ela não envia chave nenhuma e diz se o endereço responde como esta API."]})]}),e.jsxs(r,{id:"auth",icon:m,title:"Autenticação e scopes",children:[e.jsxs("p",{children:["Envie a chave no header. ",e.jsx("strong",{children:"A chave nunca vai pela URL (query string é recusada)."})]}),e.jsx(a,{children:`Authorization: Bearer sk_live_SUA_CHAVE_AQUI
# alternativa oficial para BDS (SecretString):
X-Api-Key: sk_live_SUA_CHAVE_AQUI`}),e.jsxs("p",{children:["Se os dois cabeçalhos forem enviados com valores diferentes, a requisição é recusada com",e.jsx("code",{className:"mx-1 rounded bg-muted px-1",children:"AMBIGUOUS_AUTH"}),". O scope sozinho não basta: uma chave ligada a um servidor/addon só acessa os recursos daquele servidor/addon."]}),e.jsxs("ul",{className:"list-disc space-y-1 pl-5",children:[e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"deliveries:read"})," — ler entregas"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"deliveries:claim"})," — reservar entregas (claim atômico)"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"deliveries:update"})," — confirmar/atualizar entregas"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"users:queue"})," — ler entregas de jogadores"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"users:schedules"})," — ler agendamentos"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"server:heartbeat"})," — enviar heartbeat"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"categories:read"})," / ",e.jsx("code",{className:"rounded bg-muted px-1",children:"categories:create"})," / ",e.jsx("code",{className:"rounded bg-muted px-1",children:"categories:update"})," / ",e.jsx("code",{className:"rounded bg-muted px-1",children:"categories:delete"})," — gerenciar categorias"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"products:read"})," / ",e.jsx("code",{className:"rounded bg-muted px-1",children:"products:create"})," / ",e.jsx("code",{className:"rounded bg-muted px-1",children:"products:update"})," / ",e.jsx("code",{className:"rounded bg-muted px-1",children:"products:delete"})," — gerenciar produtos"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"products:publish"})," — publicar/despublicar"]}),e.jsxs("li",{children:[e.jsx("code",{className:"rounded bg-muted px-1",children:"delivery-recipes:read"})," / ",e.jsx("code",{className:"rounded bg-muted px-1",children:"delivery-recipes:write"})," — receita de entrega do produto"]})]})]}),e.jsx(r,{id:"endpoints",icon:i,title:"Endpoints",children:e.jsxs("div",{className:"space-y-2",children:[e.jsx(s,{method:"GET",path:"/api/v1/app/queued_commands",scope:"deliveries:read"}),e.jsx(s,{method:"POST",path:"/api/v1/app/queued_commands/claim",scope:"deliveries:claim"}),e.jsx(s,{method:"GET",path:"/api/v1/app/user_queue/{user-id}",scope:"users:queue"}),e.jsx(s,{method:"GET",path:"/api/v1/app/user_schedules/{user-id}",scope:"users:schedules"}),e.jsx(s,{method:"PATCH",path:"/api/v1/app/command/{command-id}",scope:"deliveries:update"}),e.jsx(s,{method:"POST",path:"/api/v1/app/heartbeat",scope:"server:heartbeat"}),e.jsx(s,{method:"GET",path:"/api/v1/app/me",scope:"—"}),e.jsx(s,{method:"GET",path:"/api/v1/categories",scope:"categories:read"}),e.jsx(s,{method:"POST",path:"/api/v1/categories",scope:"categories:create"}),e.jsx(s,{method:"POST",path:"/api/v1/categories/upsert",scope:"categories:create"}),e.jsx(s,{method:"GET",path:"/api/v1/categories/{id}",scope:"categories:read"}),e.jsx(s,{method:"PATCH",path:"/api/v1/categories/{id}",scope:"categories:update"}),e.jsx(s,{method:"DELETE",path:"/api/v1/categories/{id}",scope:"categories:delete"}),e.jsx(s,{method:"GET",path:"/api/v1/products",scope:"products:read"}),e.jsx(s,{method:"POST",path:"/api/v1/products",scope:"products:create"}),e.jsx(s,{method:"POST",path:"/api/v1/products/upsert",scope:"products:create"}),e.jsx(s,{method:"GET",path:"/api/v1/products/{id}",scope:"products:read"}),e.jsx(s,{method:"PATCH",path:"/api/v1/products/{id}",scope:"products:update"}),e.jsx(s,{method:"DELETE",path:"/api/v1/products/{id}",scope:"products:delete"}),e.jsx(s,{method:"POST",path:"/api/v1/products/{id}/publish",scope:"products:publish"}),e.jsx(s,{method:"POST",path:"/api/v1/products/{id}/unpublish",scope:"products:publish"}),e.jsx(s,{method:"GET",path:"/api/v1/products/{id}/delivery-recipe",scope:"delivery-recipes:read"}),e.jsx(s,{method:"PUT",path:"/api/v1/products/{id}/delivery-recipe",scope:"delivery-recipes:write"}),e.jsx(s,{method:"GET",path:"/api/v1/sync/changes?cursor=",scope:"products:read"}),e.jsx(s,{method:"POST",path:"/api/v1/files/upload-url",scope:"products:create (ou update)"}),e.jsx(s,{method:"POST",path:"/api/v1/files/finalize",scope:"products:create (ou update)"})]})}),e.jsxs(r,{id:"fila",icon:n,title:"Fila: GET /queued_commands",children:[e.jsxs("p",{children:["Retorna apenas entregas ",e.jsx("strong",{children:"PENDING"}),", com ",e.jsx("code",{className:"rounded bg-muted px-1",children:"execute_at"})," no passado e pertencentes ao servidor da chave (ou ",e.jsx("code",{className:"rounded bg-muted px-1",children:"GLOBAL"}),"). Nenhum dado pessoal (CPF, endereço, pagamento) é enviado."]}),e.jsxs("p",{children:["Filtros opcionais: ",e.jsx("code",{className:"rounded bg-muted px-1",children:"?addon_id=economy"})," e ",e.jsx("code",{className:"rounded bg-muted px-1",children:"?limit=50"}),"."]}),e.jsx(a,{title:"Exemplo de resposta",children:`[
  {
    "id": "del_m3f8a1b2c9d4",
    "server_id": "survival-01",
    "addon_id": "economy",
    "action": "ADD_MONEY",
    "action_id": "money-bonus",
    "step_index": 0,
    "mode": "SERVER",
    "reference_id": null,
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
]`})]}),e.jsxs(r,{id:"claim",icon:m,title:"Claim seguro: POST /queued_commands/claim",children:[e.jsxs("p",{children:["Para evitar que dois processos entreguem a mesma compra, use o claim. O backend reserva atomicamente as entregas (status ",e.jsx("strong",{children:"PROCESSING"}),") por um período (lease). Se o addon cair sem confirmar, o lease expira e a entrega volta para ",e.jsx("strong",{children:"PENDING"}),"."]}),e.jsx(a,{title:"Requisição",children:`POST /api/v1/app/queued_commands/claim
Authorization: Bearer sk_live_...
Content-Type: application/json

{ "limit": 20, "addon_id": "economy" }`}),e.jsx(a,{title:"Resposta (trecho)",children:`{
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
}`}),e.jsxs("p",{children:[e.jsx("strong",{children:"O claim é atômico."})," Uma entrega PENDING passa para PROCESSING uma única vez, mesmo com dois workers chamando ao mesmo tempo (transação do banco). Guarde o",e.jsx("code",{className:"mx-1 rounded bg-muted px-1",children:"claim_token"})," e envie-o ao confirmar. Se o lease expirar sem confirmação, a entrega volta para PENDING automaticamente."]})]}),e.jsxs(r,{id:"jogador",icon:g,title:"Fila por jogador e agendamentos",children:[e.jsx("p",{children:"Quando o jogador entra no servidor, consulte a fila dele e entregue imediatamente:"}),e.jsx(a,{children:`GET /api/v1/app/user_queue/Steve123      # entregas prontas para agora
GET /api/v1/app/user_schedules/Steve123  # entregas futuras (ex.: REMOVE_RANK em 30 dias)`}),e.jsxs("p",{children:["O ",e.jsx("code",{className:"rounded bg-muted px-1",children:"user-id"})," pode ser nickname, XUID, gamertag ou o",e.jsx("code",{className:"mx-1 rounded bg-muted px-1",children:"client_identifier"})," usado na compra. O addon pode responder ",e.jsx("code",{className:"rounded bg-muted px-1",children:"PENDING"})," com",e.jsx("code",{className:"mx-1 rounded bg-muted px-1",children:'error_code: "PLAYER_OFFLINE"'})," quando o jogador estiver offline e",e.jsx("code",{className:"mx-1 rounded bg-muted px-1",children:"offline_execute"})," for false."]})]}),e.jsxs(r,{id:"confirmar",icon:v,title:"Confirmar entrega: PATCH /command/{id}",children:[e.jsxs("p",{children:["Status aceitos: ",e.jsx("strong",{children:"DONE"}),", ",e.jsx("strong",{children:"FAILED"}),", ",e.jsx("strong",{children:"PENDING"}),", ",e.jsx("strong",{children:"CANCELED"}),"."]}),e.jsxs("p",{children:["Quando a entrega foi obtida por ",e.jsx("strong",{children:"claim"}),", envie o",e.jsx("code",{className:"mx-1 rounded bg-muted px-1",children:"claim_token"}),". Sem ele (ou com token antigo/expirado) a confirmação é recusada com ",e.jsx("code",{className:"rounded bg-muted px-1",children:"CLAIM_INVALID"})," /"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"CLAIM_EXPIRED"}),"."]}),e.jsx(a,{title:"Sucesso",children:`PATCH /api/v1/app/command/del_m3f8a1b2c9d4
Authorization: Bearer sk_live_...
Content-Type: application/json

{ "status": "DONE", "claim_token": "clm_9f2c...", "response": "10000 moedas adicionadas" }`}),e.jsx(a,{title:"Falha temporária (FAILED + retry agendado com backoff)",children:`{
  "status": "FAILED",
  "error_code": "TEMPORARY_STORAGE_ERROR",
  "retryable": true,
  "response": "Não foi possível acessar o banco de economia"
}`}),e.jsx(a,{title:"Falha definitiva (não repete; exige ação manual)",children:`{
  "status": "FAILED",
  "error_code": "REFERENCE_NOT_FOUND",
  "retryable": false,
  "response": "O kit vip_diamante não existe mais neste addon"
}`}),e.jsx(a,{title:"Jogador offline (não consome max_attempts)",children:'{ "status": "PENDING", "error_code": "PLAYER_OFFLINE" }'}),e.jsx(a,{title:"Cancelamento",children:'{ "status": "CANCELED", "reason": "Pedido reembolsado" }'}),e.jsxs("p",{children:["Depois de ",e.jsx("strong",{children:"DONE"})," a entrega não volta a aparecer em ",e.jsx("code",{className:"rounded bg-muted px-1",children:"queued_commands"}),". Cada ação da receita é um step independente: se a 3ª ação falhar, as anteriores NÃO são executadas de novo."]})]}),e.jsxs(r,{id:"heartbeat",icon:_,title:"Heartbeat",children:[e.jsx(a,{title:"Requisição",children:`POST /api/v1/app/heartbeat
Authorization: Bearer sk_live_...

{
  "server_id": "survival-01",
  "addon_version": "1.4.0",
  "minecraft_version": "1.21.0",
  "api_client_version": "1.0.0",
  "capabilities": { "local_reference": true, "claim": true }
}`}),e.jsx("p",{children:"O painel mostra o servidor como 🟢 Online enquanto o heartbeat chega, além da versão do addon, versão do Minecraft e o último erro de integração reportado."})]}),e.jsxs(r,{id:"erros",icon:u,title:"Status e códigos de erro",children:[e.jsx("p",{children:"Todos os erros seguem o mesmo formato. Nunca devolvemos stack trace, caminho de arquivo, SQL ou segredo."}),e.jsx(a,{children:`{
  "errors": [
    { "message": "Limite de requisições excedido.", "code": "RATE_LIMIT_REACHED" }
  ]
}`}),e.jsxs("div",{className:"grid grid-cols-1 gap-2 text-xs sm:grid-cols-2",children:[e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"PLAYER_OFFLINE"})," · jogador fora (volta à fila)"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"HANDLER_NOT_FOUND"})," · addon não conhece a ação"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"REFERENCE_NOT_FOUND"})," · kit/item local removido"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"REFERENCE_REVISION_NOT_FOUND"})," · revisão do kit mudou"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"INVALID_PAYLOAD"})," · dados inválidos"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"TEMPORARY_STORAGE_ERROR"})," · falha temporária"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"CLAIM_EXPIRED"})," · lease expirou"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"CLAIM_INVALID"})," · token inválido/antigo"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"MAX_ATTEMPTS_REACHED"})," · tentativas esgotadas"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"SYNC_CONFLICT"})," · revisão desatualizada"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"IDEMPOTENCY_KEY_REUSED"})," · key reusada com corpo diferente"]}),e.jsxs("span",{className:"rounded border px-2 py-1",children:[e.jsx("code",{children:"FORBIDDEN_OBJECT"})," · recurso de outro servidor/addon"]})]})]}),e.jsxs(r,{id:"limites",icon:u,title:"Rate limit e payloads",children:[e.jsxs("ul",{className:"list-disc space-y-1 pl-5",children:[e.jsxs("li",{children:["GET: ",e.jsx("strong",{children:"120 req/min"})," · POST/PATCH/DELETE: ",e.jsx("strong",{children:"30 req/min"})," (por chave)."]}),e.jsxs("li",{children:["Headers: ",e.jsx("code",{className:"rounded bg-muted px-1",children:"X-RateLimit-Limit"}),", ",e.jsx("code",{className:"rounded bg-muted px-1",children:"X-RateLimit-Remaining"}),", ",e.jsx("code",{className:"rounded bg-muted px-1",children:"Retry-After"})," (no 429)."]}),e.jsxs("li",{children:["O SDK respeita ",e.jsx("code",{className:"rounded bg-muted px-1",children:"Retry-After"}),"; caso contrário faz backoff exponencial com jitter."]}),e.jsxs("li",{children:["Limites de payload: até ",e.jsx("strong",{children:"25"})," ações por receita, ",e.jsx("strong",{children:"64"})," itens em ",e.jsx("code",{className:"rounded bg-muted px-1",children:"contents_preview"}),", ≤ 20 000 caracteres por ",e.jsx("code",{className:"rounded bg-muted px-1",children:"payload"}),", nome ≤ 120, descrição ≤ 5000, ",e.jsx("code",{className:"rounded bg-muted px-1",children:"external_id"}),"/",e.jsx("code",{className:"rounded bg-muted px-1",children:"reference_id"})," ≤ 160."]})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-2 text-xs sm:grid-cols-4",children:[e.jsx("span",{className:"rounded border px-2 py-1",children:"400 · requisição inválida"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"401 · chave ausente/inválida"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"403 · sem permissão"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"404 · não encontrada"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"409 · conflito/idempotência"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"422 · dados inválidos"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"429 · rate limit"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"500 · erro interno"})]})]}),e.jsxs(r,{id:"exemplo",icon:i,title:"Exemplo de addon (TypeScript) com registerHandler",children:[e.jsxs("p",{children:["Registre um handler para cada tipo de ",e.jsx("code",{className:"rounded bg-muted px-1",children:"action"})," que seu addon sabe executar. Ação desconhecida nunca é executada: devolva ",e.jsx("code",{className:"rounded bg-muted px-1",children:"HANDLER_NOT_FOUND"}),"."]}),e.jsx(a,{title:"addon.ts",children:`type Delivery = {
  id: string;
  action: string;
  action_id: string | null;
  mode: "SERVER" | "LOCAL_REFERENCE";
  reference_id: string | null;
  reference_revision: number | null;
  command: string | null;
  payload: any;
  offline_execute: boolean;
  order: { id: string; client_identifier: string; variables: { name: string; value: string }[] };
};

const handlers: Record<string, (d: Delivery) => Promise<void>> = {};
export function registerHandler(action: string, fn: (d: Delivery) => Promise<void>) {
  handlers[action] = fn;
}

registerHandler("ADD_MONEY", async (d) => { addMoney(d.order.client_identifier, d.payload.amount); });
registerHandler("ADD_RANK", async (d) => { addRank(d.order.client_identifier, d.payload.rank); });
// Ação desconhecida → HANDLER_NOT_FOUND (veja o loop abaixo).`}),e.jsxs("p",{children:["Persistência local: guarde os IDs já concluídos em ",e.jsx("strong",{children:"Dynamic Properties"})," (pequenos metadados), não em um ",e.jsx("code",{className:"rounded bg-muted px-1",children:"new Set()"})," em memória — um reinício do servidor perderia a idempotência local."]})]}),e.jsxs(r,{id:"bedrock",icon:i,title:"Bedrock Dedicated Server (o jeito oficial)",children:[e.jsxs("p",{children:["No ",e.jsx("strong",{children:"Bedrock Dedicated Server (BDS)"})," o ",e.jsx("code",{className:"rounded bg-muted px-1",children:"fetch()"})," ",e.jsx("strong",{children:"não existe"}),". A integração HTTP oficial usa os módulos"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"@minecraft/server-net"})," (requisições) e"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"@minecraft/server-admin"})," (variáveis e secrets)."]}),e.jsxs("p",{className:"rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-200/90",children:[e.jsx("strong",{children:"Realms:"})," essa integração NÃO funciona em Realms. O módulo"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"@minecraft/server-net"})," só é suportado em"," ",e.jsx("strong",{children:"Bedrock Dedicated Server"}),"."]}),e.jsx("p",{className:"font-semibold text-foreground",children:"1) Autorize os módulos no BDS — permissions.json"}),e.jsxs("p",{children:["Copie para ",e.jsx("code",{className:"rounded bg-muted px-1",children:"config/<SCRIPT_MODULE_UUID>/permissions.json"}),". Um módulo de comportamento tem um UUID próprio — use o mesmo que aparece no"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"manifest.json"}),"."]}),e.jsx(a,{title:"config/<SCRIPT_MODULE_UUID>/permissions.json",children:`{
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
}`}),e.jsxs("p",{children:[e.jsx("strong",{children:"allowed_uris"})," precisa conter o endereço da API (HTTP actions do Convex). Se ele mudar, atualize este arquivo e reinicie o BDS. Há também"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"force_https"})," e limites de"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"body"}),"/",e.jsx("code",{className:"rounded bg-muted px-1",children:"concurrency"})," ","suportados pelo ",e.jsx("code",{className:"rounded bg-muted px-1",children:"@minecraft/server-net"}),":"]}),e.jsx(a,{title:"exemplo com limites (opcional)",children:`{
  "allowed_modules": ["@minecraft/server", "@minecraft/server-admin", "@minecraft/server-net"],
  "module_permissions": {
    "@minecraft/server-net": {
      "allowed_uris": ["https://capable-akita-865.convex.site/api/v1"],
      "force_https": true,
      "max_body_bytes": 262144,
      "max_concurrent_requests": 2
    }
  }
}`}),e.jsx("p",{className:"font-semibold text-foreground",children:"2) variables.json (não secreto)"}),e.jsx(a,{title:"config/<SCRIPT_MODULE_UUID>/variables.json",children:`{
  "API_BASE_URL": "https://capable-akita-865.convex.site/api/v1",
  "SERVER_ID": "survival-01",
  "ADDON_ID": "apollo-store",
  "POLL_INTERVAL": 10,
  "HEARTBEAT_INTERVAL": 30
}`}),e.jsx("p",{className:"font-semibold text-foreground",children:"3) secrets.json (a API Key vive aqui)"}),e.jsx(a,{title:"config/<SCRIPT_MODULE_UUID>/secrets.json",children:`{
  "APOLLO_API_KEY": "sk_live_SUA_CHAVE_AQUI"
}`}),e.jsxs("p",{children:["O ",e.jsx("code",{className:"rounded bg-muted px-1",children:"SecretString"})," do"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"@minecraft/server-admin"})," deve permanecer secreto. Não converta, não imprima, não faça ",e.jsx("code",{className:"rounded bg-muted px-1",children:"console.warn"})," do conteúdo. Passe o secret direto para o ",e.jsx("code",{className:"rounded bg-muted px-1",children:"HttpHeader"}),"."]}),e.jsx("p",{className:"font-semibold text-foreground",children:"4) Cliente HTTP (server-net) — scripts/apollo-client.js"}),e.jsx(a,{title:"scripts/apollo-client.js",children:`import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";
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
}`}),e.jsxs("p",{children:["Observação: as versões dos módulos (",e.jsx("code",{className:"rounded bg-muted px-1",children:"@minecraft/server"}),","," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"@minecraft/server-net"}),", etc.) devem ser as compatíveis com o seu BDS. Não troque a versão às cegas — ajuste pelo"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"manifest.json"})," do seu addon."]})]}),e.jsxs(r,{id:"localref",icon:l,title:"LOCAL_REFERENCE — kits e itens complexos",children:[e.jsxs("p",{children:["Para ",e.jsx("strong",{children:"itens/kits complexos"})," (shulkers, itens encantados, lore, componentes, NBT que muda por versão), o item permanece armazenado ",e.jsx("strong",{children:"no Minecraft"}),". O site guarda apenas a ",e.jsx("strong",{children:"referência"})," e uma prévia para exibição."]}),e.jsx(a,{title:"Ação de entrega LOCAL_REFERENCE",children:`{
  "id": "give-kit",
  "type": "GIVE_KIT",
  "mode": "LOCAL_REFERENCE",
  "reference_id": "kit:vip_diamante",
  "reference_revision": 3,
  "contents_preview": [
    { "type_id": "minecraft:diamond_sword", "name": "Espada", "amount": 1 }
  ]
}`}),e.jsxs("p",{children:[e.jsx("strong",{children:"contents_preview serve SOMENTE para exibição/documentação."})," O site NUNCA reconstrói o item a partir da prévia — quem entrega é o addon, resolvendo"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"reference_id"})," (e"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"reference_revision"}),") localmente."]}),e.jsxs("p",{children:[e.jsx("strong",{children:"Revision:"})," quando o admin altera o kit local, ele incrementa a revisão e o addon atualiza o produto com ",e.jsx("code",{className:"rounded bg-muted px-1",children:"reference_revision"})," novo. Compras antigas continuam com o snapshot da revisão antiga. Se o addon não achar a referência, responda com o código exato:"]}),e.jsx(a,{children:`{ "status": "FAILED", "error_code": "REFERENCE_NOT_FOUND", "retryable": false }
{ "status": "FAILED", "error_code": "REFERENCE_REVISION_NOT_FOUND", "retryable": false }`}),e.jsx("p",{className:"font-semibold text-foreground",children:"Fluxo Apollo — KIT"}),e.jsxs("ol",{className:"list-decimal space-y-1 pl-5",children:[e.jsx("li",{children:"Admin mira em uma shulker (pode juntar shulkers complementares)."}),e.jsxs("li",{children:["O addon salva o kit localmente como ",e.jsx("code",{className:"rounded bg-muted px-1",children:"kit:vip_diamante"}),"."]}),e.jsxs("li",{children:["O addon cria/atualiza a categoria e faz ",e.jsx("code",{className:"rounded bg-muted px-1",children:"POST /products/upsert"})," com a receita LOCAL_REFERENCE."]}),e.jsxs("li",{children:["Publica (",e.jsx("code",{className:"rounded bg-muted px-1",children:"/publish"}),")."]}),e.jsx("li",{children:"Cliente compra → o site cria o snapshot da receita."}),e.jsxs("li",{children:["O addon faz claim, carrega ",e.jsx("code",{className:"rounded bg-muted px-1",children:"kit:vip_diamante"})," local, entrega e confirma DONE."]})]}),e.jsx("p",{className:"font-semibold text-foreground",children:"Fluxo Apollo — ITEM"}),e.jsxs("p",{children:["Admin segura um item; o addon faz uma cópia local fiel como"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"item:espada_especial"})," e publica um produto com",e.jsx("code",{className:"mx-1 rounded bg-muted px-1",children:"GIVE_ITEM"})," + ",e.jsx("code",{className:"rounded bg-muted px-1",children:"LOCAL_REFERENCE"}),". O site nunca precisa entender os componentes internos do ItemStack."]}),e.jsxs("p",{children:["Se um kit/item local for removido e houver produto publicado dependendo dele, use"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"/products/{id}/unpublish"})," (ou marque como indisponível) para não vender algo quebrado. No painel, a entrega aparece como"," ",e.jsx("strong",{children:"Local Reference"})," com servidor, addon e referência."]})]}),e.jsxs(r,{id:"upsert",icon:n,title:"Upsert, revisão e sincronização incremental",children:[e.jsxs("p",{children:["Use ",e.jsx("strong",{children:"upsert"}),' (não delete+create) em todo "Sincronizar novamente". A chave natural é'," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"server_id + addon_id + external_id"}),": repetir nunca duplica e preserva o ID remoto, o histórico e as estatísticas."]}),e.jsx(a,{title:"POST /api/v1/products/upsert",children:`{
  "external_id": "apollo:kit:vip_diamante",
  "name": "Kit VIP Diamante",
  "price": 19.90,
  "category_id": "apollo:kits",
  "delivery_recipe": {
    "version": 1,
    "actions": [{ "id": "give-kit", "type": "GIVE_KIT", "mode": "LOCAL_REFERENCE",
      "reference_id": "kit:vip_diamante", "reference_revision": 3 }]
  }
}
→ 201 (criado) ou 200 (atualizado) — sempre o mesmo "id"`}),e.jsxs("p",{children:[e.jsx("strong",{children:"Revisão / conflito:"})," produtos e categorias têm"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"revision"})," (incrementa a cada alteração). Ao editar, envie ",e.jsx("code",{className:"rounded bg-muted px-1",children:"expected_revision"}),"; se o site estiver numa revisão mais nova, a resposta é ",e.jsx("code",{className:"rounded bg-muted px-1",children:"409 SYNC_CONFLICT"})," com"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"current_revision"})," — sem sobrescrita silenciosa."]}),e.jsx(a,{title:"PATCH /api/v1/products/{id}",children:`{ "name": "Novo nome", "expected_revision": 4 }
→ 409 { "errors": [ { "code": "SYNC_CONFLICT", ... } ], "current_revision": 5 }`}),e.jsxs("p",{children:[e.jsx("strong",{children:"Sync incremental:"})," guarde o cursor e busque só o que mudou (produtos, categorias e recursos arquivados / tombstones):"]}),e.jsx(a,{title:"GET /api/v1/sync/changes?cursor=0",children:`{
  "changes": [
    { "kind": "PRODUCT_UPDATED", "id": "j58...", "external_id": "apollo:kit:vip", "revision": 2, "delivery_mode": "LOCAL_REFERENCE", "reference_id": "kit:vip_diamante", ... },
    { "kind": "PRODUCT_ARCHIVED", "id": "j57...", "external_id": "apollo:kit:antigo", "updated_at": "..." }
  ],
  "next_cursor": "1730000000000",
  "has_more": false
}`}),e.jsxs("p",{children:[e.jsx("strong",{children:"Idempotency-Key:"})," envie o header nas criações. A mesma key com o mesmo corpo reexecuta nenhuma vez (replay da mesma resposta); com corpo diferente devolve"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"409 IDEMPOTENCY_KEY_REUSED"}),"."]}),e.jsxs("p",{children:[e.jsx("strong",{children:"Status de sincronização no addon:"})," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"SYNCED"}),","," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"LOCAL_ONLY"}),","," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"SYNC_ERROR"}),","," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"CONFLICT"}),". Se a API falhar, o item/kit local NÃO pode ser perdido — tente novamente depois."]})]}),e.jsx(r,{id:"openapi",icon:n,title:"OpenAPI",children:e.jsxs("p",{children:["A especificação OpenAPI 3.1 gerada a partir da implementação real está em"," ",e.jsx("a",{href:"/openapi-v1.json",className:"text-primary underline",target:"_blank",rel:"noreferrer",children:"/openapi-v1.json"}),". Ela reflete as rotas, schemas, scopes e respostas desta página — importe no Postman/Insomnia ou gere clientes."]})}),e.jsxs(r,{id:"loja",icon:l,title:"Gerenciando a loja através de addons",children:[e.jsx("p",{children:'Uma chave com os scopes de catálogo pode criar e editar categorias e produtos — que aparecem imediatamente no painel, na loja e no catálogo. É o MESMO catálogo: não existe "produto do addon" separado de "produto do site".'}),e.jsx("p",{children:e.jsx("strong",{children:"Criar/atualizar categoria"})}),e.jsx(a,{title:"POST /api/v1/categories/upsert",children:`{
  "external_id": "apollo:kits",
  "name": "Kits",
  "server_id": "survival-01",
  "addon_id": "apollo-store"
}
→ 201 { "id": "j57...", "revision": 1, ... }
→ 200 (na próxima vez, atualiza e revision vira 2)`}),e.jsxs("p",{children:[e.jsx("strong",{children:"Listar / obter"})," — ",e.jsx("code",{className:"rounded bg-muted px-1",children:"GET /api/v1/categories"})," e"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"GET /api/v1/categories/{id}"})," (aceita id, external_id ou slug)."]}),e.jsxs("p",{children:[e.jsx("strong",{children:"Publicar / despublicar"})," — ",e.jsx("code",{className:"rounded bg-muted px-1",children:"POST /api/v1/products/{id}/publish"})," e"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"/unpublish"}),". Um produto em DRAFT não aparece na loja."]}),e.jsxs("p",{children:[e.jsx("strong",{children:"Imagens"}),": ",e.jsx("code",{className:"rounded bg-muted px-1",children:"POST /api/v1/files/upload-url"})," → poste o binário na URL devolvida → ",e.jsx("code",{className:"rounded bg-muted px-1",children:"POST /api/v1/files/finalize"})," → use a"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"url"})," no campo ",e.jsx("code",{className:"rounded bg-muted px-1",children:"image"}),"."]}),e.jsxs("p",{children:[e.jsx("strong",{children:"SDK reutilizável"})," (importe em qualquer addon — arquivo"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"src/lib/store-api-client.ts"}),"):"]}),e.jsx(a,{title:"store-api-client.ts",children:`const storeApi = createStoreApi({
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
const sync = await storeApi.sync.changes("0");`}),e.jsx("p",{children:"Ações registradas na auditoria do painel:"}),e.jsxs("div",{className:"grid grid-cols-2 gap-2 text-xs sm:grid-cols-4",children:[e.jsx("span",{className:"rounded border px-2 py-1",children:"CATEGORY_CREATED / UPDATED / ARCHIVED"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"PRODUCT_CREATED / UPDATED"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"PRODUCT_PUBLISHED / UNPUBLISHED / ARCHIVED"}),e.jsx("span",{className:"rounded border px-2 py-1",children:"DELIVERY_RECIPE_UPDATED"})]})]}),e.jsxs("div",{className:"rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm",children:[e.jsx("p",{className:"font-semibold text-sky-400",children:"Pronto para conectar"}),e.jsxs("p",{className:"mt-1 text-muted-foreground",children:["Crie uma chave em ",e.jsx(p,{to:"/painel/integracoes",className:"text-primary underline",children:"Integrações"})," ","e configure seu addon com ",e.jsx("code",{className:"rounded bg-muted px-1",children:"API_BASE_URL"}),","," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"API_KEY"}),","," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"SERVER_ID"})," e"," ",e.jsx("code",{className:"rounded bg-muted px-1",children:"ADDON_ID"}),"."]})]})]})]})]})}export{O as default};
