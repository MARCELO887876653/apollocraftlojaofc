export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.floor(h / 24);
  if (d === 1) return "há um dia";
  if (d < 30) return `há ${d} dias`;
  const mo = Math.floor(d / 30);
  if (mo === 1) return "há um mês";
  if (mo < 12) return `há ${mo} meses`;
  const y = Math.floor(mo / 12);
  return y === 1 ? "há um ano" : `há ${y} anos`;
}

export function formatDateOnly(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function slugifyClient(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  cancelled: "Cancelado",
  expired: "Expirado",
  refunded: "Reembolsado",
  failed: "Falhou",
};

export const PAYMENT_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400 border-zinc-500/30",
  expired: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  refunded: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  processing: "Processando",
  delivered: "Entregue",
  failed: "Falhou",
};

export const DELIVERY_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  processing: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

// Log completo de uma entrega automática (deliveryEvents).
export const DELIVERY_EVENT_LABEL: Record<string, string> = {
  CREATED: "Fila criada",
  REDELIVERED: "Reenviada pelo painel",
  RETRIED: "Devolvida para a fila",
  CLAIMED: "Pega pelo addon",
  CONFIRMED: "Confirmada pelo addon",
  FAILED: "Falha na entrega",
  CANCELED: "Cancelada",
  REVERSAL_QUEUED: "Reversão enfileirada",
  CLAIM_EXPIRED: "Claim expirado (voltou para a fila)",
  AWAITING_PLAYER: "Aguardando o jogador entrar",
};

export const DELIVERY_EVENT_COLOR: Record<string, string> = {
  CREATED: "text-muted-foreground",
  REDELIVERED: "text-sky-500",
  RETRIED: "text-sky-500",
  CLAIMED: "text-violet-500",
  CONFIRMED: "text-emerald-600 dark:text-emerald-400",
  FAILED: "text-red-600 dark:text-red-400",
  CANCELED: "text-zinc-500",
  REVERSAL_QUEUED: "text-amber-600 dark:text-amber-400",
  CLAIM_EXPIRED: "text-amber-600 dark:text-amber-400",
  AWAITING_PLAYER: "text-amber-600 dark:text-amber-400",
};

export const DELIVERY_TYPE_LABEL: Record<string, string> = {
  none: "Sem entrega",
  command: "Comando de servidor",
  api: "API",
  webhook: "Webhook",
  code: "Código único",
  message: "Mensagem",
  manual: "Manual",
};
