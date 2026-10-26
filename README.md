# NexaStore — Plataforma de E-commerce Digital

Plataforma completa de e-commerce digital (estilo Central Cart) construída com **React + Vite + Convex + Tailwind**, em português, com loja pública, checkout PIX (Mercado Pago), entrega automática e painel administrativo 100% configurável — **tudo editável pelo painel, sem tocar em código**.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, Framer Motion, Recharts
- **Backend:** Convex (banco + funções reativas), Convex Auth (e-mail OTP)
- **Pagamentos:** Mercado Pago (PIX com QR Code, copia-e-cola, webhook e polling)
- **Roteamento:** React Router v7

## Funcionalidades

### Loja pública
- Home com **seções dinâmicas** (hero, benefícios, categorias, destaques, promoções, mais vendidos, lançamentos, FAQ) — ative/desative/reordene no painel
- Catálogo com busca, filtros por categoria/subcategoria e ordenação
- Página de produto com galeria, variantes (ex.: VIP 30/90 dias), quantidade mín/máx, benefícios e relacionados
- Carrinho persistente (localStorage) com cupom validado no servidor
- Checkout com **campos configuráveis** (nome, e-mail, Discord, nick Minecraft, telefone, UUID — visíveis/obrigatórios a seu critério)
- Página de pedido com **QR Code PIX**, copia-e-cola e confirmação automática (polling + webhook)
- Blog e páginas institucionais (/blog, /p/termos)

### Painel admin (`/painel`)
| Seção | O que faz |
|---|---|
| Dashboard | Receita (hoje/30d/total), gráfico de 14 dias, top produtos, pedidos recentes, alertas |
| Pedidos | Busca/filtros, detalhes completos, alteração manual de status, cancelamento com devolução de estoque |
| Produtos | CRUD completo: variantes, preços promocionais, estoque (ou ilimitado), flags (destaque/popular/oculto), benefícios, tags, SEO e **entrega automática** por tipo |
| Categorias | Árvore com subcategorias, ícone emoji, cor, ordem (reordenar) |
| Cupons | Percentual ou fixo, mínimo, teto de desconto, limites de uso, validade |
| Clientes | Base de clientes com LTV, ticket médio e histórico de pedidos |
| Entregas | Fila automática com retry, reprocessar e marcar como entregue |
| Conteúdo | Páginas, blog (rascunho/publicado), FAQ e banners |
| Aparência | **Editor de tema** (cores, raio, fonte, dark mode), seções da home, menu e rodapé |
| Integrações | Mercado Pago (credenciais) e despacho de comandos Minecraft |
| Equipe | RBAC com papéis (owner/admin/gerente/suporte) e permissões granulares |
| Auditoria | Log de todas as ações da equipe |
| Discord | **Login com Discord** (Client ID/Secret do seu aplicativo, endereços de retorno prontos para copiar, testar credenciais e ligar/desligar o botão na tela de login) |
| Configurações | Identidade, logo/favicon, redes sociais, campos do checkout, **bio do link** (título, descrição, imagem/GIF da prévia no Discord/WhatsApp) e **modo manutenção** |

### Segurança
- **Nunca confiamos no navegador**: preços, descontos e cupons recalculados no servidor no checkout
- Status de pagamento só muda via API oficial do Mercado Pago (webhook validado por HMAC ou polling idempotente)
- Transições de status idempotentes (nunca rebaixa "pago")
- RBAC com 15 permissões granulares em todas as funções admin
- Rate limiting no checkout; auditoria de todas as ações da equipe

## Primeiro acesso (criar o owner)

1. Abra a loja e clique em **Painel** (ou acesse `/painel`)
2. Faça login com seu e-mail (código OTP)
3. Na tela "Acesso restrito", clique em **"Sou o dono da loja — reivindicar acesso"**
   - Funciona apenas enquanto a loja não tiver nenhum administrador
4. Pronto: você é o **owner** e pode convidar a equipe em *Painel → Equipe*

## Pagamentos (Mercado Pago)

1. Crie credenciais de produção em [developers.mercadopago.com](https://developers.mercadopago.com)
2. No painel: **Integrações → Mercado Pago** e cole o *Access Token* (e opcionalmente o *Webhook Secret*)
3. No painel do MP, configure o webhook para:
   ```
   https://SEU-DOMINIO/api/convex/webhooks/mercadopago
   ```
   (evento `payment`) — a confirmação automática também funciona por polling mesmo sem webhook
4. Alternativa por ambiente: defina `MERCADO_PAGO_ACCESS_TOKEN` nas variáveis do Convex

## Login com Discord (Minha Conta com foto)

1. Em [discord.com/developers/applications](https://discord.com/developers/applications) crie um aplicativo (**New Application**)
2. Em **OAuth2 → Redirects**, adicione o endereço mostrado em *Painel → Discord* (ex.: `https://sualoja.com/auth/discord`)
3. Copie o **Client ID** e o **Client Secret** (OAuth2 → General) e cole em *Painel → Discord*, ligando o interruptor
4. Clique em **Testar credenciais** para confirmar com o próprio Discord — o segredo fica só no servidor

Com isso o botão **Entrar com Discord** aparece na tela de login (fluxo com PKCE + `state`). Quem entra pelo Discord tem nome e foto preenchidos automaticamente; se o e-mail for de um cliente que já comprou, a conta é **vinculada** em vez de duplicada. Em **Minha Conta** o cliente pode enviar, trocar ou remover a própria foto (JPG/PNG/WEBP/GIF até 5 MB) e vê o selo *Discord conectado*.

## Loja "carregando para sempre"

Se a loja abrir mas nenhum dado aparecer, o app agora pergunta ao deployment o motivo e mostra na tela:

- **"desativado por limite de uso"** → o Convex pausou o deployment porque o limite configurado foi atingido. Nada é perdido: abra o [painel do Convex](https://dashboard.convex.dev) → *Deployment settings* → **Usage limits** e aumente ou desative o limite. O site volta sozinho (ele verifica o servidor a cada minuto e recarrega ao reconectar). Dica: este projeto publica usando um deployment **dev**, que tem limites menores — o ideal é criar um **production deployment** e apontar `VITE_CONVEX_URL` / `STORE_DEPLOYMENT_URL` para ele.
- **"não foi possível conectar"** → rede, endereço errado ou build sem `VITE_CONVEX_URL`. O app também tenta sozinho a cada minuto.

Com a loja **sem dados**, o app pergunta ao servidor a cada minuto e recarrega sozinho no instante em que ele volta a responder. Com a loja saudável **não existe verificação periódica** — a conexão aberta já mantém tudo aquecido e cada pergunta extra contaria como chamada de função (o mesmo recurso que o limite mede). Ao voltar para a aba depois de um tempo, ele revalida na hora.

## Consumo de chamadas (limite do Convex)

O plano mede **chamadas de função** (query/mutation/action), e cada `useQuery` é uma chamada. Para não gastar cota à toa:

- A vitrine lê **pacotes** em vez de dezenas de consultas soltas:
  - `storefront.getShell` — loja, tema, menu e bio do link (um `useQuery` compartilhado por um provider; usado por toda página, inclusive login e checkout);
  - `storefront.getHome` — seções, banner, categorias, top 3 e FAQ;
  - `storefront.getCategoryPage` — categoria, subcategorias e produtos (+1 chamada por troca de subcategoria);
  - `storefront.getProductPage` — produto, variações, categoria e relacionados (sem a ida-e-volta extra dos relacionados).

  Abrir a home saiu de ~16 chamadas para ~3; categoria e produto, de 4 para 3 (e sem cascata).
- As regras de leitura (filtros, ordem, subcategorias) vivem em `src/convex/lib/storefrontData.ts`, usadas tanto pelo catálogo quanto pelos pacotes — nada de duplicar regra. Os testes em `src/convex/__tests__/storefront.test.ts` comparam os pacotes com as consultas antigas.
- O tema **não** chama mais `settings.applyBrand` em toda visita: o servidor diz em `getShell` se a migração ainda falta.
- O guard de conexão usa a chegada do shell como sinal de vida e só faz um teste HTTP quando os dados atrasam — com a loja saudável, zero chamadas extras.
- O contador de visitas (`stats.trackVisit`) registra 1 por sessão do navegador, não por página.

Regras validadas com medição no deployment (não são teoria):

- **Sincronização do addon:** `GET /api/v1/sync/changes` é chamado a cada ~2 minutos
  (medido: 1.459 chamadas em 56 h) e lê **só o que mudou**, pelo índice
  `by_updatedAt`. Antes ele varria produtos e categorias inteiros em cada poll —
  ~41 KB por chamada, ~25 MB/dia de leitura mesmo sem nenhuma novidade.
  Qualquer leitura "do que mudou desde X" deve usar índice, nunca `collect()`.
- **Campos grandes não ficam no documento principal:** o QR Code PIX (imagem em
  base64) vive em `orderPix`, não em `orders` — ele era 78% do documento do
  pedido (medido: 65.232 de 90.966 bytes da tabela). O mesmo vale para listas de
  códigos/serializados: se um dia entrarem em `products.delivery.codes`, elas
  serão lidas por TODA vitrine, então devem ir para uma tabela própria.
- **Log de sucesso é amostrado:** em `apiLogs` só os erros entram um a um;
  sucesso entra 1 amostra a cada 10 minutos por chave (antes era 1 por minuto —
  medido: 3.000 linhas em 56 h, ~1.280 escritas/dia de ruído puro).
- **Polling do cliente é rede de segurança, não o caminho principal:** a tela do
  pedido consulta o gateway 1x por minuto, no máximo 10 vezes (antes ~58
  consultas por pedido aberto). Quem confirma é o webhook (segundos), e a tela
  reage sozinha pela assinatura do pedido; o cron reconcilia a cada 15 minutos.
- **Tarefa de cron "de uma vez" deve ser REMOVIDA ao terminar.** A de recálculo
  dos totais de cliente já tinha rodado (`customerTotalsRepair.doneAt`) e
  continuava acordando a cada 30 minutos para não fazer nada.
- **Contagem não justifica leitura total:** hoje o dashboard lê a tabela de
  produtos inteira só para exibir `productsTotal`. Um contador denormalizado
  resolveria, mas exige disciplina de escrita em vários caminhos — fica anotado
  como próximo passo, não como regra.

Ao criar novas telas, prefira ler de um pacote existente (ou acrescentar campos a ele) em vez de somar mais um `useQuery`.

## Desenvolvimento

```bash
bun install        # dependências
bun run dev        # frontend (Vite)
bun convex dev     # backend Convex (separado)
bun tsc -b         # typecheck
```

Estrutura:
```
src/
├── convex/          # backend: schema, auth, orders, payments, deliveries, admin RBAC...
├── components/store # ProductCard, StoreLayout
├── pages/           # loja pública (Home, Catalog, Product, Cart, Checkout, OrderStatus...)
│   └── admin/       # painel (Dashboard, Orders, Products, ..., Settings)
└── lib/             # cart (context), theme (tema dinâmico), format
```
