import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────
// Tarefas periódicas
// ─────────────────────────────────────────────────────────────

const crons = cronJobs();

// Se o webhook do Mercado Pago não chegar, o PIX é pago e o pedido continua
// "Aguardando pagamento". Periodicamente conferimos no gateway os pedidos
// pendentes recentes e confirmamos os que já foram aprovados.
//
// 15 minutos (antes eram 10): cada execução custa uma action + uma query + uma
// chamada ao gateway por pedido pendente, e é apenas uma REDE DE SEGURANÇA —
// o webhook confirma em segundos e a página do pedido continua assinando o
// banco (o cliente vê a confirmação chegar sozinha).
crons.interval(
  "reconciliar pagamentos pendentes",
  { minutes: 15 },
  internal.payments.reconcilePending,
  {},
);

// A correção única dos totais de compra dos clientes rodou e terminou (o estado
// `customerTotalsRepair` já tem `doneAt`, com os 3 clientes que precisavam de
// ajuste). O cron ficava batendo a cada 30 minutos para não fazer nada — foi
// removido. O recálculo continua disponível pelo botão do painel
// (Clientes → "Recalcular totais"), que chama `customers.repairTotals`.

export default crons;
