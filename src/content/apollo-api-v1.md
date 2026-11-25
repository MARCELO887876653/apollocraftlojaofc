# Apollo Craft — API de Entregas v1

Documentação oficial do sistema de entrega automática da ApolloCraft.
Base URL: `https://capable-akita-865.convex.site/api/v1`
Última atualização: novembro/2026 (entrega por shulker).

> Nenhuma chave real aparece nesta documentação. Use `sk_live_SUA_CHAVE_AQUI` apenas como exemplo.

---

## 1. O que mudou no sistema de entrega

- Kits com várias shulkers agora declaram `parts` na `delivery_recipe`.
- O site cria **um comando por unidade comprada × shulker**: 2 kits de 3 shulkers = 6 comandos.
- Cada comando traz `part_index`, `part_total`, `part_id`, `part_label` e `payload.kit_part`.
- Cada shulker é **confirmada individualmente** com o `claim_token` do seu comando.
- O pedido só é marcado como **entregue** quando todas as partes de todas as unidades estão `DONE`.
- Inventário cheio e jogador offline **não consomem tentativa**.
- Pedidos antigos sem `parts` continuam funcionando como entrega única (compatibilidade).
- A entrega duplicada é impedida por chave idempotente, claim atômico e confirmação por comando.

---

## 2. Fluxo

1. Cliente compra e o pagamento é aprovado.
2. O site enfileira as entregas: item × ação × unidade × shulker.
3. O addon faz `POST /app/queued_commands/claim`.
4. Para cada comando, o addon entrega **somente a parte indicada** (`part_index`/`payload.kit_part`).
5. O addon confirma cada comando com `PATCH /app/command/{id}` + `claim_token`.
6. Quando todas as partes de todas as unidades estão `DONE`, o pedido vira `delivered`.

---

## 3. Autenticação

Envie a chave em **um** dos cabeçalhos:

```
Authorization: Bearer sk_live_SUA_CHAVE_AQUI
X-Api-Key: sk_live_SUA_CHAVE_AQUI
```

- Chave pela query string é recusada.
- Dois cabeçalhos com valores diferentes → `AMBIGUOUS_AUTH`.
- A chave é vinculada a `server_id` + `addon_id`; ela não acessa outro servidor/addon.

### Scopes

| Scope | Uso |
|---|---|
| `deliveries:read` | listar fila (`GET /app/queued_commands`) |
| `deliveries:claim` | reservar entregas (claim) |
| `deliveries:update` | confirmar entregas |
| `users:queue` | fila pronta de um jogador |
| `users:schedules` | agendamentos futuros |
| `server:heartbeat` | heartbeat |
| `products:read/create/update/delete/publish` | catálogo |
| `categories:read/create/update/delete` | categorias |
| `delivery-recipes:read/write` | receita de entrega |

---

## 4. Endpoints

| Método | Caminho | Scope |
|---|---|---|
| GET | `/app/me` | — |
| GET | `/app/queued_commands` | `deliveries:read` |
| POST | `/app/queued_commands/claim` | `deliveries:claim` |
| GET | `/app/user_queue/{user-id}` | `users:queue` |
| GET | `/app/user_schedules/{user-id}` | `users:schedules` |
| PATCH | `/app/command/{command-id}` | `deliveries:update` |
| POST | `/app/heartbeat` | `server:heartbeat` |
| GET | `/categories` | `categories:read` |
| POST | `/categories` | `categories:create` |
| POST | `/categories/upsert` | `categories:create` |
| GET | `/categories/{id}` | `categories:read` |
| PATCH | `/categories/{id}` | `categories:update` |
| DELETE | `/categories/{id}` | `categories:delete` |
| GET | `/products` | `products:read` |
| POST | `/products` | `products:create` |
| POST | `/products/upsert` | `products:create` |
| GET | `/products/{id}` | `products:read` |
| PATCH | `/products/{id}` | `products:update` |
| DELETE | `/products/{id}` | `products:delete` |
| POST | `/products/{id}/publish` | `products:publish` |
| POST | `/products/{id}/unpublish` | `products:publish` |
| GET | `/products/{id}/delivery-recipe` | `delivery-recipes:read` |
| PUT | `/products/{id}/delivery-recipe` | `delivery-recipes:write` |
| GET | `/sync/changes?cursor=` | `products:read` |
| POST | `/files/upload-url` | `products:create` ou `products:update` |
| POST | `/files/finalize` | `products:create` ou `products:update` |

---

## 5. `delivery_recipe` e `parts`

### 5.1 Estrutura da receita

```json
{
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
      "payload": {},
      "contents_preview": [
        { "type_id": "minecraft:netherite_helmet", "name": "Capacete", "amount": 1 }
      ],
      "parts": [
        { "id": "armaduras", "label": "Armaduras 1/3" },
        { "id": "armas", "label": "Armas 2/3" },
        { "id": "blocos", "label": "Blocos 3/3" }
      ]
    }
  ]
}
```

### 5.2 Campos de `parts`

| Campo | Tipo | Descrição |
|---|---|---|
| `parts` | array | Uma entrada por shulker física. Máximo 12. |
| `parts[].id` | string | Identificador estável da parte (ex.: `armaduras`). |
| `parts[].label` | string | Nome exibido no painel/cliente (ex.: `Armaduras`). |
| `parts[].reference_id` | string? | Referência local específica daquela shulker. Se omitida, herda a da ação. |
| `parts[].reference_revision` | integer? | Revisão específica da parte. Se omitida, herda a da ação. |
| `parts[].contents_preview` | array? | Prévia visual (nunca usada para reconstruir a entrega). |

Regras:

- `parts` é **opcional**. Sem `parts`, a ação continua sendo uma entrega única.
- Uma entrada em `parts` = uma shulker física.
- `quantity_mode` continua valendo para a ação, mas com `parts` a quantidade multiplica **unidades × partes**.
- `MULTIPLY` multiplica valores numéricos do payload e gera 1 comando por parte.
- `REPEAT`, vazio ou ação sem quantidade gera **1 comando por unidade × parte**.
- `IGNORE` gera **1 comando por parte** (não duplica por quantidade).

### 5.3 Campos no comando entregue

| Campo | Tipo | Descrição |
|---|---|---|
| `unit_index` | integer\|null | Unidade comprada (0 = primeira). |
| `part_index` | integer\|null | Índice da shulker (0 = primeira). |
| `part_total` | integer\|null | Quantidade total de shulkers da ação. |
| `part_id` | string\|null | Id da parte declarada no produto. |
| `part_label` | string\|null | Nome da parte. |
| `payload.kit_part.index` | integer | Mesmo valor de `part_index`. |
| `payload.kit_part.total` | integer | Mesmo valor de `part_total`. |
| `payload.kit_part.id` | string | Mesmo valor de `part_id`. |
| `payload.kit_part.label` | string | Mesmo valor de `part_label`. |
| `payload.kit_part.contents` | array | `contents_preview` daquela parte (visual). |
| `step_index` | integer | Com várias partes, é o índice da shulker. Sem `parts`, é o índice da ação. |

`payload.kit_part` é redundante de propósito: facilita addons que só leem o payload.
O addon deve priorizar `part_index`/`part_total`; ambos vêm sempre juntos.

### 5.4 Ler e atualizar a receita

```json
GET /api/v1/products/j57abc123/delivery-recipe

{
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
}
```

```json
PUT /api/v1/products/j57abc123/delivery-recipe

{
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

→ 200 { "product_id": "j57abc123", "revision": 3, "delivery_recipe": { ... } }
→ 409 SYNC_CONFLICT se expected_revision estiver desatualizada
```

O mesmo conteúdo pode ir em `delivery_recipe` no `POST /products/upsert` ou no
`PATCH /products/{id}`.

---

## 6. Múltiplas shulkers e múltiplas unidades

Exemplo: pedido com **2× KIT GOD (3 shulkers)** gera 6 comandos:

| Unidade | Shulker | Chave idempotente |
|---|---|---|
| 1 | 1 | `<orderId>:0:0` |
| 1 | 2 | `<orderId>:0:0:p2` |
| 1 | 3 | `<orderId>:0:0:p3` |
| 2 | 1 | `<orderId>:0:0:u2` |
| 2 | 2 | `<orderId>:0:0:u2:p2` |
| 2 | 3 | `<orderId>:0:0:u2:p3` |

Garantias:

- Cada chave é única; recriar a entrega não duplica comando.
- Cada comando é reivindicado por um único worker (claim atômico).
- `DONE` não volta para a fila.
- Reenviar um comando `DONE` só acontece por ação explícita do painel.

---

## 7. Fila: `GET /app/queued_commands`

Retorna somente `PENDING` com `execute_at <= agora`, do servidor da chave ou `GLOBAL`.

Parâmetros: `?addon_id=apollo-store&limit=50` (até 200, padrão 50).

```json
[
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
]
```

---

## 8. Claim: `POST /app/queued_commands/claim`

Reserva atômica por **5 minutos** (`lease`). Enquanto está reservado, o comando fica `PROCESSING` e não aparece para outro worker.

```json
{ "limit": 10, "addon_id": "apollo-store" }
```

Resposta (a lista vem em `data`):

```json
{
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
}
```

Se o addon cair sem confirmar, o lease expira e o comando volta para `PENDING`.

---

## 9. Confirmar cada shulker: `PATCH /app/command/{id}`

Status aceitos: `DONE`, `FAILED`, `PENDING`, `CANCELED`.

Quando o comando foi obtido por claim, envie o `claim_token`. Token ausente/antigo:
`CLAIM_INVALID`. Token expirado: `CLAIM_EXPIRED`.

### 9.1 Sucesso

```json
{
  "status": "DONE",
  "claim_token": "clm_9f2c...",
  "response": "Shulker 2/3 (Armas) entregue no Minecraft."
}
```

### 9.2 Jogador offline (não consome tentativa)

```json
{ "status": "PENDING", "claim_token": "clm_9f2c...", "error_code": "PLAYER_OFFLINE" }
```

A entrega volta para a fila **em 2 minutos**.

### 9.3 Inventário cheio (não consome tentativa)

```json
{ "status": "PENDING", "claim_token": "clm_9f2c...", "error_code": "INVENTORY_FULL" }
```

A entrega volta para a fila **em 60 segundos**. Não use `FAILED` para inventário cheio:
seria uma falha definitiva indevida.

### 9.4 Falha temporária (retry com backoff)

```json
{
  "status": "FAILED",
  "claim_token": "clm_9f2c...",
  "error_code": "TEMPORARY_STORAGE_ERROR",
  "retryable": true,
  "response": "Chunk não carregou"
}
```

Backoff: 60s → 5min → 15min → 1h → 2h. Máximo de 5 tentativas.

### 9.5 Falha definitiva

```json
{
  "status": "FAILED",
  "claim_token": "clm_9f2c...",
  "error_code": "REFERENCE_REVISION_NOT_FOUND",
  "retryable": false,
  "response": "A revisão 1 do kit:kit_god não existe neste addon"
}
```

Códigos definitivos: `HANDLER_NOT_FOUND`, `REFERENCE_NOT_FOUND`,
`REFERENCE_REVISION_NOT_FOUND`, `INVALID_PAYLOAD`, `MAX_ATTEMPTS_REACHED`.

### 9.6 Cancelamento

```json
{ "status": "CANCELED", "claim_token": "clm_9f2c...", "reason": "Pedido reembolsado" }
```

---

## 10. Duplicidade: como o sistema protege

1. **Idempotência por parte**: `unidade × ação × shulker` tem chave única.
2. **Claim atômico**: dois workers não pegam o mesmo comando.
3. **Lease**: se o addon cair, o comando volta após 5 minutos.
4. **Confirmação por comando**: confirmar a shulker 2 não conclui a 3.
5. **DONE é final**: não reaparece na fila.
6. **Reenvio só manual**: o painel cria uma nova tentativa e registra autor/data.
7. **Confirmação repetida de DONE** é idempotente (não duplica entrega).

O addon também deve persistir os IDs já executados (Dynamic Properties), porque um
reinício de servidor não pode perder a idempotência local.

---

## 11. Offline, inventário cheio e falhas de conexão

| Situação | O que o addon deve fazer | O que o site faz |
|---|---|---|
| Jogador offline e `offline_execute=false` | `PENDING` + `PLAYER_OFFLINE` | volta em 2 min, sem consumir tentativa |
| Inventário cheio | `PENDING` + `INVENTORY_FULL` | volta em 60 s, sem consumir tentativa |
| Timeout/erro de rede ao confirmar | repetir a mesma confirmação com o mesmo `claim_token` | `DONE` repetido é idempotente |
| Timeout/erro de rede no claim | repetir o claim | lease protege contra duplicidade |
| Addon reiniciou no meio | reclamar após o lease | comando volta a `PENDING` |
| Chunk/mundo indisponível | `FAILED` + `TEMPORARY_STORAGE_ERROR` + `retryable: true` | backoff automático |
| Kit/revisão não existe | `FAILED` + código próprio + `retryable: false` | falha definitiva, alerta no painel |
| Rate limit 429 | respeitar `Retry-After` | headers `X-RateLimit-*` |

O addon deve usar timeout nas requisições e **nunca** confirmar `DONE` antes de o
`give`/spawn da shulker ter sido executado com sucesso.

---

## 12. Status da entrega e do pedido

Comando: `PENDING → PROCESSING → DONE | FAILED | CANCELED`.

Pedido:

- `pending`: existe parte pendente/processando ou kit sem composição de shulkers.
- `processing`: todas as partes ativas estão em processamento.
- `delivered`: todas as partes de todas as unidades confirmadas (`DONE`).
- `failed`: falha definitiva sem partes ativas.

Kits antigos publicados **sem** `parts` não são fechados automaticamente: o site não
sabe quantas shulkers faltam. Eles aparecem na auditoria do painel.

---

## 13. Compatibilidade com pedidos antigos

- Receitas sem `parts` continuam válidas e geram **1 comando por unidade**.
- Compras antigas usam o snapshot da receita da época; mudar o produto não altera o pedido.
- Pedidos antigos com um único comando `DONE` de kit sem `parts` ficam sinalizados,
  não são marcados como entregues automaticamente.
- Pedidos de item único (sem `GIVE_KIT`) fecham normalmente quando todos os comandos ficam `DONE`.

---

## 14. Pedidos pendentes e recuperação segura

Na auditoria de novembro/2026 havia **34 pedidos de kit sem composição de shulkers**
(incluindo `#GXFZV8NH`, 2× KIT GUERREIRO, e `#97NP4ZFD`, 1× KIT GOD). Eles receberam a
primeira shulker (armaduras) e ficaram pendentes.

**Não reenvie esses pedidos antes de atualizar e validar o addon.** Reenviar com o addon
antigo pode entregar a shulker 1 de novo (duplicação) sem entregar as demais.

Procedimento seguro:

1. **Atualize o addon** conforme a seção 16 e valide o suporte a `part_index` em ambiente de teste.
2. **Publique os kits com `parts`** (KIT GOD e KIT GUERREIRO têm 3 shulkers cada):
   use `PUT /products/{id}/delivery-recipe` ou `PATCH /products/{id}` com a receita completa.
3. **Valide com um pedido de teste** (2× kit de 3 shulkers → 6 comandos, 6 confirmações).
4. No painel, abra o pedido → **“Entregar shulkers faltantes”**. A operação:
   - cria somente comandos de partes ausentes;
   - usa a mesma chave idempotente (não duplica);
   - nunca recria uma parte já `DONE`;
   - registra admin, data e auditoria.
5. Confirme que cada shulker foi entregue; o pedido fecha automaticamente quando todas estiverem `DONE`.
6. Se a entrega for feita em jogo pela equipe, use **entrega manual** com observação — sem reenviar a fila.

Recuperação de KIT GUERREIRO 2× (partes 2 e 3 de cada unidade = 4 comandos) e
KIT GOD 1× (partes 2 e 3 = 2 comandos), total **6 comandos**.

---

## 15. Exemplos completos — KIT GOD e KIT GUERREIRO

### 15.1 KIT GOD (3 shulkers)

`POST /api/v1/products/upsert`

```json
{
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
}
```

### 15.2 KIT GUERREIRO (3 shulkers)

```json
{
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
}
```

### 15.3 Compra de 2× KIT GUERREIRO — confirmações

```http
PATCH /api/v1/app/command/del_u1_p1
{ "status": "DONE", "claim_token": "clm_a", "response": "Unidade 1 · shulker 1/3" }

PATCH /api/v1/app/command/del_u1_p2
{ "status": "PENDING", "claim_token": "clm_b", "error_code": "INVENTORY_FULL" }

PATCH /api/v1/app/command/del_u1_p3
{ "status": "DONE", "claim_token": "clm_c", "response": "Unidade 1 · shulker 3/3" }

// unidade 2
PATCH /api/v1/app/command/del_u2_p1
{ "status": "DONE", "claim_token": "clm_d", "response": "Unidade 2 · shulker 1/3" }

PATCH /api/v1/app/command/del_u2_p2
{ "status": "DONE", "claim_token": "clm_e", "response": "Unidade 2 · shulker 2/3" }

PATCH /api/v1/app/command/del_u2_p3
{ "status": "DONE", "claim_token": "clm_f", "response": "Unidade 2 · shulker 3/3" }
```

O pedido continua `pending` até todas as 6 shulkers (2 unidades × 3) estarem `DONE`.
A shulker `u1_p2`, que voltou como `INVENTORY_FULL`, é reclamada e entregue depois —
quando ela fecha, o pedido passa a `delivered`.

---

## 16. Alterações necessárias no addon v2.1.8

O addon atual entrega **uma shulker por comando**. Para compatibilidade com a API
atualizada:

1. **Publicar a composição**: ao criar/atualizar um kit, envie `parts` na receita
   (uma por shulker). Para KIT GOD e KIT GUERREIRO, 3 partes cada.
2. **Ler os novos campos no claim**: `unit_index`, `part_index`, `part_total`,
   `part_id`, `part_label` e `payload.kit_part`.
3. **Entregar somente a parte**: use `part_index` para escolher a shulker local.
   Nunca entregue o kit inteiro em um comando com `part_total > 1`.
4. **Confirmar cada comando separadamente** com o `claim_token` correspondente.
   Não confirme a shulker 2 usando o token da 1.
5. **Inventário cheio**: devolver `PENDING` + `INVENTORY_FULL` (não `FAILED`).
6. **Offline**: devolver `PENDING` + `PLAYER_OFFLINE` quando `offline_execute=false`.
7. **Falha de rede**: repetir a requisição com o mesmo token; não marcar `FAILED` por timeout local.
8. **Persistir IDs executados** em Dynamic Properties para sobreviver a reinício.
9. **Heartbeat**: anunciar `capabilities: { "local_reference": true, "claim": true, "kit_parts": true }`.
10. **Versão**: subir para `2.2.0` e informar em `addon_version` no heartbeat.
11. **Teste obrigatório** antes de reenviar pedidos reais:
    - compra de teste 2× kit de 3 shulkers → 6 comandos;
    - confirmar 5 → pedido `pending`;
    - confirmar a 6ª → pedido `delivered`;
    - repetir confirmação → resposta idempotente, sem duplicar;
    - inventário cheio → `PENDING` e nova tentativa sem consumir tentativa.

---

## 17. Erros

Formato:

```json
{ "errors": [{ "message": "Limite de requisições excedido.", "code": "RATE_LIMIT_REACHED" }] }
```

| Código | Significado |
|---|---|
| `PLAYER_OFFLINE` | jogador fora; volta à fila em 2 min |
| `INVENTORY_FULL` | inventário cheio; volta à fila em 60 s |
| `HANDLER_NOT_FOUND` | addon não conhece a ação |
| `REFERENCE_NOT_FOUND` | kit/item local removido |
| `REFERENCE_REVISION_NOT_FOUND` | revisão do kit não existe |
| `INVALID_PAYLOAD` | payload inválido |
| `TEMPORARY_STORAGE_ERROR` | falha temporária com retry |
| `CLAIM_INVALID` | token ausente/errado |
| `CLAIM_EXPIRED` | lease expirou |
| `MAX_ATTEMPTS_REACHED` | tentativas esgotadas |
| `SYNC_CONFLICT` | revisão desatualizada |
| `IDEMPOTENCY_KEY_REUSED` | mesma key com corpo diferente |
| `FORBIDDEN_SCOPE` | chave sem o scope |
| `FORBIDDEN_OBJECT` | recurso de outro servidor/addon |

---

## 18. Limites

- GET: 120 req/min por chave; POST/PATCH/DELETE: 30 req/min.
- Máximo 25 ações por receita; 12 partes por ação; 64 itens por `contents_preview`.
- `payload` ≤ 20.000 caracteres; `reference_id`/`external_id` ≤ 160.
- Claim: até 100 comandos por chamada (padrão 20).
- Fila: até 200 por chamada (padrão 50).

---

## 19. OpenAPI e download

- OpenAPI 3.1: `https://capable-akita-865.convex.site/openapi-v1.json`
- Documentação web: `/docs/api`
- Este arquivo: `/docs/api` → botão **Baixar documentação (.md)**
