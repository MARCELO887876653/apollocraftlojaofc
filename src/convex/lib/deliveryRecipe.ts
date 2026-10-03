// ─────────────────────────────────────────────────────────────
// Ponte entre a "delivery_recipe" (formato da API v1, enviado pelos
// addons) e o armazenamento interno `product.deliveryV1` (usado pela
// fila de entrega criada no primeiro prompt). UM único sistema de entrega.
// ─────────────────────────────────────────────────────────────

export type RecipeAction = {
  type: string;
  payload?: any;
  command?: string;
  offline_execute?: boolean;
  server_id?: string;
  addon_id?: string;
  delay_seconds?: number;
  reverse_action?: string;
  reverse_payload?: any;
  reverse_delay_seconds?: number;
};

export type DeliveryRecipe = {
  version?: number;
  offline_execute?: boolean;
  actions: RecipeAction[];
};

/** delivery_recipe (API) → deliveryV1 (armazenamento interno do produto). */
export function recipeToDeliveryV1(recipe: DeliveryRecipe) {
  const actions = (recipe.actions ?? []).map((a) => ({
    action: String(a.type),
    command: typeof a.command === "string" && a.command.trim() ? a.command.trim() : undefined,
    payload: a.payload ?? undefined,
    serverId: typeof a.server_id === "string" && a.server_id.trim() ? a.server_id.trim() : undefined,
    addonId: typeof a.addon_id === "string" && a.addon_id.trim() ? a.addon_id.trim() : undefined,
    offlineExecute: a.offline_execute ?? recipe.offline_execute ?? true,
    delaySeconds: typeof a.delay_seconds === "number" ? a.delay_seconds : undefined,
    reverseAction:
      typeof a.reverse_action === "string" && a.reverse_action.trim()
        ? a.reverse_action.trim()
        : undefined,
    reversePayload: a.reverse_payload ?? undefined,
    reverseDelaySeconds:
      typeof a.reverse_delay_seconds === "number" ? a.reverse_delay_seconds : undefined,
  }));
  return {
    enabled: actions.length > 0,
    version: typeof recipe.version === "number" ? recipe.version : 1,
    actions,
  };
}

/** deliveryV1 (armazenamento interno) → delivery_recipe (API). */
export function deliveryV1ToRecipe(v1: any): DeliveryRecipe {
  const actions: RecipeAction[] = ((v1?.actions ?? []) as any[]).map((a) => ({
    type: a.action,
    payload: a.payload ?? {},
    ...(a.command ? { command: a.command } : {}),
    ...(a.offlineExecute !== undefined ? { offline_execute: a.offlineExecute } : {}),
    ...(a.serverId ? { server_id: a.serverId } : {}),
    ...(a.addonId ? { addon_id: a.addonId } : {}),
    ...(a.delaySeconds !== undefined ? { delay_seconds: a.delaySeconds } : {}),
    ...(a.reverseAction ? { reverse_action: a.reverseAction } : {}),
    ...(a.reversePayload !== undefined ? { reverse_payload: a.reversePayload } : {}),
    ...(a.reverseDelaySeconds !== undefined ? { reverse_delay_seconds: a.reverseDelaySeconds } : {}),
  }));
  return {
    version: typeof v1?.version === "number" ? v1.version : 1,
    offline_execute: actions[0]?.offline_execute ?? true,
    actions,
  };
}

/** Valida/normaliza uma receita recebida pela API (lança em formato inválido). */
export function validateRecipe(raw: any): DeliveryRecipe {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("delivery_recipe deve ser um objeto.");
  }
  if (!Array.isArray(raw.actions)) {
    throw new Error("delivery_recipe.actions deve ser um array.");
  }
  if (typeof raw.version === "number" && (!Number.isFinite(raw.version) || raw.version < 1)) {
    throw new Error("delivery_recipe.version inválida.");
  }
  for (const a of raw.actions) {
    if (!a || typeof a !== "object" || typeof a.type !== "string" || !a.type.trim()) {
      throw new Error("Cada ação precisa de um campo 'type' (string).");
    }
  }
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    offline_execute: raw.offline_execute,
    actions: raw.actions as RecipeAction[],
  };
}
