import { ConvexError } from "convex/values";

/**
 * Extrai uma mensagem legível de um erro de função Convex.
 *
 * Em produção o Convex redige erros comuns para "Server Error" — nunca
 * mostramos isso ao cliente. Erros de aplicação (`ConvexError`) carregam a
 * mensagem em pt-BR e são exibidos normalmente.
 */
export function friendlyErrorMessage(
  error: unknown,
  fallback = "Não foi possível concluir a operação. Tente novamente em instantes.",
): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (error instanceof ConvexError || data !== undefined) {
    if (typeof data === "string" && data.trim()) return data;
    const message = (data as { message?: unknown } | null)?.message;
    if (typeof message === "string" && message.trim()) return message;
    return fallback;
  }

  const raw = error instanceof Error ? error.message : "";
  if (!raw || /\[CONVEX|Server Error|Called by client/i.test(raw)) return fallback;
  return raw;
}
