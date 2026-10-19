import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────
// Tarefas periódicas
// ─────────────────────────────────────────────────────────────

const crons = cronJobs();

// Se o webhook do Mercado Pago não chegar, o PIX é pago e o pedido continua
// "Aguardando pagamento". A cada 10 minutos conferimos no gateway os pedidos
// pendentes recentes e confirmamos os que já foram aprovados.
crons.interval(
  "reconciliar pagamentos pendentes",
  { minutes: 10 },
  internal.payments.reconcilePending,
  {},
);

// Correção única dos totais de compra dos clientes: o checkout antigo somava
// pedido PENDENTE no "total gasto" do cliente, e o recálculo (só pedidos pagos)
// precisa rodar uma vez na base já existente. Depois de concluído ele não faz
// mais nada — basta alterar o gatilho do painel para sobreviver ao cron.
crons.interval(
  "recalcular totais de compra dos clientes (uma vez)",
  { minutes: 30 },
  internal.customers.repairTotalsStart,
  {},
);

export default crons;
