/**
 * Modo manutenção da loja: quem vê o quê.
 *
 * A regra de acesso fica aqui (pura e testável) porque ela precisa das três
 * informações que a tela pública tem em mãos: a configuração da loja, se a
 * resposta de "sou da equipe?" já chegou e a rota atual.
 *
 * Por que existe a pré-visualização (`?cliente=1`): a equipe continua navegando
 * com a loja fechada (é assim que o dono confere o conteúdo sem depender de
 * outra conta), mas isso fazia o interruptor parecer "que não pega" — ele via a
 * loja normal porque quem abria já era admin. Com o flag, qualquer pessoa da
 * equipe vê exatamente o que o cliente vê.
 */

/** Parâmetro de URL que força a visão de cliente (`?cliente=1`). */
export const CLIENT_PREVIEW_PARAM = "cliente";

function params(search: string): URLSearchParams {
  const clean = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(clean);
}

/** `?cliente=1` (ou `true`) força a visão de cliente. */
export function isClientPreview(search: string): boolean {
  const value = params(search).get(CLIENT_PREVIEW_PARAM);
  return value === "1" || value === "true";
}

/** Mesma URL com `?cliente=1`, preservando os outros parâmetros. */
export function withClientPreview(search: string): string {
  const next = params(search);
  next.set(CLIENT_PREVIEW_PARAM, "1");
  return `?${next.toString()}`;
}

/** Mesma URL sem o flag de pré-visualização (volta ao modo equipe). */
export function withoutClientPreview(search: string): string {
  const next = params(search);
  next.delete(CLIENT_PREVIEW_PARAM);
  const rest = next.toString();
  return rest ? `?${rest}` : "";
}

/**
 * O que a loja deve mostrar:
 * - `open`     → loja normal (manutenção desligada);
 * - `checking` → manutenção ligada e ainda não sabemos se é a equipe (spinner,
 *                para não piscar a tela de manutenção para quem pode desligá-la);
 * - `closed`   → tela de manutenção (cliente, ou equipe em pré-visualização);
 * - `staff`    → equipe navegando com a loja fechada (com aviso na tela).
 */
export type StoreAccess = "open" | "checking" | "closed" | "staff";

export function storeAccess(input: {
  maintenanceEnabled: boolean | undefined;
  /** `false` enquanto a consulta "sou da equipe?" ainda não respondeu. */
  teamResolved: boolean;
  isStaff: boolean;
  clientPreview: boolean;
}): StoreAccess {
  if (!input.maintenanceEnabled) return "open";
  if (input.clientPreview) return "closed";
  if (!input.teamResolved) return "checking";
  return input.isStaff ? "staff" : "closed";
}
