// ─────────────────────────────────────────────────────────────
// Páginas institucionais padrão (criadas uma única vez).
// Marcação leve suportada pelo renderizador da StaticPage:
//   ## Título de seção
//   ### Subtítulo
//   - item de lista
//   > destaque (caixa)
//   --- separador
// ─────────────────────────────────────────────────────────────

export const DEFAULT_PAGES: Array<{ slug: string; title: string; content: string }> = [
  {
    slug: "termos",
    title: "Termos de Serviço",
    content: `## 1. Aceitação dos termos
Ao acessar a Loja - Apollo Craft e realizar qualquer pedido, você declara que leu, entendeu e concorda integralmente com estes Termos de Serviço e com a nossa Política de Privacidade. Caso não concorde com qualquer ponto abaixo, não utilize a loja.

## 2. Sobre a loja
A Apollo Craft é uma loja digital de produtos para servidores de Minecraft — kits, VIPs, cash, moedas e itens virtuais. Todos os produtos são 100% digitais e entregues de forma automática, diretamente no jogo ou na sua conta.

## 3. Pedidos e pagamento
- Os preços são exibidos em reais (BRL) e podem ser alterados a qualquer momento, sem aviso prévio.
- O pagamento é processado de forma segura pelo provedor responsável (PIX).
- O pedido só é liberado para entrega após a confirmação do pagamento pelo banco/emissor.

## 4. Entrega dos produtos
A entrega é automática e normalmente ocorre em poucos segundos após a confirmação do PIX. Em casos de instabilidade do servidor do jogo, pode levar algumas horas — nesse período, acione o suporte com o número do seu pedido em mãos.

> Importante: informe corretamente o seu nickname do Minecraft no checkout. Dados preenchidos de forma incorreta pelo comprador podem atrasar ou impedir a entrega.

## 5. Política de devolução e reembolso
A loja vende exclusivamente produtos digitais de entrega imediata.

> NÃO REALIZAMOS DEVOLUÇÕES, TROCAS OU REEMBOLSOS.

### 5.1 Comprou, acabou — sem devolução
Ao finalizar o pagamento:
- a compra é considerada definitiva e irrevogável;
- o valor pago não é devolvido em nenhuma hipótese — incluindo desistência, arrependimento, falta de tempo para jogar, banimento, mutação, exclusão de conta ou perda de progresso no servidor;
- não existe "período de reflexão" aplicável a produtos digitais já entregues.

### 5.2 Única exceção
Se o produto não for entregue e o problema for comprovadamente da loja, o valor será ressarcido ou o produto entregue, a nosso critério. Falhas causadas por dados informados incorretamente pelo comprador (ex.: nickname errado) não são passíveis de reembolso.

## 6. Comportamento e sanções
Fraudes, chargebacks indevidos, exploração de bugs ou qualquer abuso contra a loja ou o servidor resultam no cancelamento permanente da conta, bloqueio de novas compras e tomada das medidas legais cabíveis.

## 7. Alterações destes termos
Estes termos podem ser atualizados a qualquer momento. A versão publicada nesta página é a que vale para cada compra.

---

> Ao finalizar uma compra na Apollo Craft, você confirma que leu e concorda com estes termos — em especial com a política de NÃO devolução após a entrega do produto digital.`,
  },
  {
    slug: "privacidade",
    title: "Política de Privacidade",
    content: `## 1. Dados que coletamos
- Dados informados no checkout: nome, e-mail, Discord, nickname do Minecraft e telefone (quando habilitados).
- Dados de pedidos: produtos, valores, status e histórico de compras.
- Dados técnicos básicos: visitas e navegação na loja, usados para melhorar a experiência.

## 2. Como usamos
- Processar pedidos e entregar os produtos automaticamente.
- Permitir o acompanhamento do pedido e emitir comprovantes.
- Oferecer suporte, prevenir fraudes e melhorar a loja.

## 3. Compartilhamento
Não vendemos os seus dados. Compartilhamos apenas o necessário com provedores de pagamento e entrega, ou quando exigido por lei.

## 4. Retenção e segurança
Os registros de pedidos são mantidos pelo período legal. Aplicamos medidas técnicas para proteger os dados e limitamos o acesso apenas a quem precisa deles.

## 5. Seus direitos
Você pode solicitar acesso, correção ou exclusão dos seus dados de contato pelo suporte da loja (Discord). Dados de pedidos podem ser mantidos por obrigação legal.

## 6. Contato
Dúvidas sobre privacidade? Fale com o nosso suporte pelo Discord da loja.`,
  },
];
