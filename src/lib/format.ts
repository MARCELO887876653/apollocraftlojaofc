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

export const DELIVERY_TYPE_LABEL: Record<string, string> = {
  none: "Sem entrega",
  command: "Comando de servidor",
  api: "API",
  webhook: "Webhook",
  code: "Código único",
  message: "Mensagem",
  manual: "Manual",
};
