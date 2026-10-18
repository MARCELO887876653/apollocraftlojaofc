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

export default crons;
