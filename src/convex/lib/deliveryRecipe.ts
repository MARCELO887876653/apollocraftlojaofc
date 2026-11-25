// ─────────────────────────────────────────────────────────────
// Ponte entre a "delivery_recipe" (formato da API v1, enviado pelos
// addons) e o armazenamento interno `product.deliveryV1` (usado pela
// fila de entrega criada no primeiro prompt). UM único sistema de entrega.
//
// Suporte total a LOCAL_REFERENCE: o item/kit permanece armazenado no
// MINECRAFT; a API guarda apenas reference_id + reference_revision + uma
// prévia (contents_preview) que serve SOMENTE para exibição/documentação.
// A entrega real é resolvida pelo addon a partir de reference_id.
// ─────────────────────────────────────────────────────────────

export type DeliveryMode = "SERVER" | "LOCAL_REFERENCE";
export type QuantityMode = "MULTIPLY" | "REPEAT" | "IGNORE";

export type ContentsPreview = {
  type_id: string;
  name?: string;
  amount?: number;
};

/**
 * Uma parte física da entrega. Para kits, cada parte é UMA shulker: o addon
 * entrega e confirma cada shulker separadamente (ver `parts` abaixo).
 */
export type RecipePart = {
  id?: string;
  label?: string;
  reference_id?: string;
  reference_revision?: number;
  contents_preview?: ContentsPreview[];
};

export type RecipeAction = {
  /** id estável da ação (para snapshot, retry, auditoria e idempotência por step). */
  id?: string;
  type: string;
  mode?: DeliveryMode;
  reference_id?: string;
  reference_revision?: number;
  contents_preview?: ContentsPreview[];
  /**
   * Composição física do kit (uma entrada por shulker). Quando presente, a
   * fila cria UM comando por parte e o pedido só é considerado entregue
   * quando todas forem confirmadas. Sem `parts`, a ação continua sendo uma
   * entrega única (compatível com produtos antigos).
   */
  parts?: RecipePart[];
  quantity_mode?: QuantityMode;
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

// ─── Limites de payload (evita abuso/acidentes) ───
export const RECIPE_LIMITS = {
  MAX_ACTIONS: 25,
  MAX_NAME: 120,
  MAX_DESCRIPTION: 5000,
  MAX_SHORT_DESCRIPTION: 240,
  MAX_EXTERNAL_ID: 160,
  MAX_REFERENCE_ID: 160,
  MAX_PREVIEW_ITEMS: 64,
  MAX_PARTS: 12,
  MAX_PAYLOAD_CHARS: 20_000, // por ação (JSON serializado)
  MAX_COMMAND_CHARS: 512,
} as const;

function optStr(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function optNum(value: any): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function normalizeMode(value: any): DeliveryMode | undefined {
  const s = optStr(value)?.toUpperCase();
  if (!s) return undefined;
  if (s === "LOCAL_REFERENCE" || s === "LOCAL") return "LOCAL_REFERENCE";
  if (s === "SERVER") return "SERVER";
  return undefined;
}

function normalizeQuantityMode(value: any): QuantityMode | undefined {
  const s = optStr(value)?.toUpperCase();
  if (!s) return undefined;
  if (s === "MULTIPLY" || s === "REPEAT" || s === "IGNORE") return s as QuantityMode;
  return undefined;
}

function normalizeParts(value: any): RecipePart[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: RecipePart[] = [];
  for (const raw of value.slice(0, RECIPE_LIMITS.MAX_PARTS)) {
    if (!raw || typeof raw !== "object") continue;
    const id = optStr(raw.id);
    const label = optStr(raw.label ?? raw.name)?.slice(0, 120);
    const referenceId = optStr(raw.reference_id ?? raw.referenceId)?.slice(
      0,
      RECIPE_LIMITS.MAX_REFERENCE_ID,
    );
    const referenceRevision = optNum(raw.reference_revision ?? raw.referenceRevision);
    const contentsPreview = normalizePreview(raw.contents_preview ?? raw.contentsPreview);
    if (!id && !label && !referenceId && !contentsPreview) continue;
    out.push({ id, label, reference_id: referenceId, reference_revision: referenceRevision, contents_preview: contentsPreview });
  }
  return out.length > 0 ? out : undefined;
}

function normalizePreview(value: any): ContentsPreview[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ContentsPreview[] = [];
  for (const raw of value.slice(0, RECIPE_LIMITS.MAX_PREVIEW_ITEMS)) {
    if (!raw || typeof raw !== "object") continue;
    const typeId = optStr(raw.type_id ?? raw.typeId ?? raw.type);
    if (!typeId) continue;
    out.push({
      type_id: typeId.slice(0, 200),
      name: optStr(raw.name)?.slice(0, 200),
      amount: optNum(raw.amount) ?? 1,
    });
  }
  return out;
}

/** delivery_recipe (API) → deliveryV1 (armazenamento interno do produto). */
export function recipeToDeliveryV1(recipe: DeliveryRecipe) {
  const actions = (recipe.actions ?? []).map((a, index) => ({
    // id estável: usa o enviado ou gera "a{index}" (compatível com receitas antigas)
    actionId: optStr(a.id) ?? `a${index}`,
    action: String(a.type),
    command:
      typeof a.command === "string" && a.command.trim()
        ? a.command.trim().slice(0, RECIPE_LIMITS.MAX_COMMAND_CHARS)
        : undefined,
    payload: a.payload ?? undefined,
    mode: normalizeMode(a.mode),
    referenceId: optStr(a.reference_id)?.slice(0, RECIPE_LIMITS.MAX_REFERENCE_ID),
    referenceRevision: optNum(a.reference_revision),
    contentsPreview: normalizePreview(a.contents_preview),
    parts: normalizeParts(a.parts),
    quantityMode: normalizeQuantityMode(a.quantity_mode),
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
  const rawActions = Array.isArray(v1?.actions) ? (v1.actions as any[]) : [];
  const actions: RecipeAction[] = rawActions.map((a, index) => ({
    id: a.actionId ?? `a${index}`,
    type: a.action,
    ...(a.mode ? { mode: a.mode as DeliveryMode } : {}),
    ...(a.referenceId ? { reference_id: a.referenceId } : {}),
    ...(a.referenceRevision !== undefined ? { reference_revision: a.referenceRevision } : {}),
    ...(Array.isArray(a.contentsPreview) ? { contents_preview: a.contentsPreview } : {}),
    ...(Array.isArray(a.parts) && a.parts.length > 0
      ? {
          parts: a.parts.map((p: any, partIndex: number) => ({
            id: p.id ?? `part-${partIndex + 1}`,
            ...(p.label ? { label: p.label } : {}),
            ...(p.referenceId ? { reference_id: p.referenceId } : {}),
            ...(p.referenceRevision !== undefined
              ? { reference_revision: p.referenceRevision }
              : {}),
            ...(Array.isArray(p.contentsPreview)
              ? { contents_preview: p.contentsPreview }
              : {}),
          })),
        }
      : {}),
    ...(a.quantityMode ? { quantity_mode: a.quantityMode as QuantityMode } : {}),
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
    offline_execute: rawActions[0]?.offlineExecute ?? true,
    actions,
  };
}

/**
 * Normaliza uma ação pela quantidade comprada.
 *
 * `repeat` é quantos comandos a fila deve criar — **um por unidade comprada**.
 * O addon entrega uma unidade por comando; mandar só a variável `quantidade`
 * (comportamento antigo) fazia o cliente comprar 2 e receber 1.
 *
 * MULTIPLY → multiplica valores numéricos do payload (amount/value/qty/quantity)
 *            e entrega um único comando (o valor já representa o total).
 *            Sem nenhum número para multiplicar, cai em 1 comando por unidade.
 * REPEAT   → 1 comando por unidade.
 * IGNORE   → sempre 1 comando (cargos e itens que não podem duplicar).
 * (vazio)  → 1 comando por unidade: é o comportamento que o comprador espera.
 */
export function normalizeActionForQuantity(
  action: { quantityMode?: string; payload?: any },
  quantity: number,
): { payload: any; repeat: number } {
  const qty = Math.max(1, Math.trunc(quantity || 1));
  const mode = action.quantityMode;
  const payload = action.payload ?? {};

  if (mode === "IGNORE") return { payload, repeat: 1 };

  if (mode === "MULTIPLY" && qty > 1 && payload && typeof payload === "object") {
    const multiplied: any = { ...payload };
    let scaled = false;
    for (const k of ["amount", "value", "qty", "quantity", "count"]) {
      if (typeof multiplied[k] === "number" && Number.isFinite(multiplied[k])) {
        multiplied[k] = multiplied[k] * qty;
        scaled = true;
      }
    }
    if (scaled) return { payload: multiplied, repeat: 1 };
  }

  // REPEAT, MULTIPLY sem valores e o padrão do painel: por unidade.
  return { payload, repeat: qty };
}

/**
 * Resolve as partes físicas de uma ação (ou de um comando já criado).
 *
 * Produtos antigos não têm `parts`: devolve uma única parte com a referência
 * da própria ação, preservando exatamente o comportamento anterior.
 */
export function resolveActionParts(action: any): Array<{
  index: number;
  total: number;
  id: string;
  label: string;
  referenceId?: string;
  referenceRevision?: number;
  contentsPreview?: ContentsPreview[];
}> {
  const rawParts: any[] = Array.isArray(action?.parts) ? action.parts : [];
  if (rawParts.length === 0) {
    return [
      {
        index: 0,
        total: 1,
        id: action?.actionId ?? "part-1",
        label: action?.action ?? "Entrega",
        referenceId: action?.referenceId,
        referenceRevision: action?.referenceRevision,
        contentsPreview: action?.contentsPreview,
      },
    ];
  }
  return rawParts.map((part: any, index: number) => ({
    index,
    total: rawParts.length,
    id: part?.id ?? `part-${index + 1}`,
    label: part?.label ?? `Parte ${index + 1}`,
    referenceId: part?.referenceId ?? action?.referenceId,
    referenceRevision: part?.referenceRevision ?? action?.referenceRevision,
    contentsPreview: part?.contentsPreview,
  }));
}

/**
 * Valida a configuração interna `deliveryV1` (usada pelo produto).
 * Retorna a mensagem de erro, ou null se estiver válida.
 *
 * Uma ação LOCAL_REFERENCE sem `referenceId` produziria uma entrega vazia —
 * por isso é tratada como erro de configuração, tanto no painel quanto na
 * criação automática de entregas.
 */
export function deliveryV1ConfigError(deliveryV1: any): string | null {
  if (!deliveryV1 || !Array.isArray(deliveryV1.actions)) return null;
  for (const a of deliveryV1.actions) {
    if (a?.mode !== "LOCAL_REFERENCE") continue;
    const ref = typeof a.referenceId === "string" ? a.referenceId.trim() : "";
    if (!ref) {
      return `A ação '${a.action ?? a.actionId ?? "?"}' está em LOCAL_REFERENCE sem 'reference_id'.`;
    }
    if (
      a.referenceRevision !== undefined &&
      a.referenceRevision !== null &&
      !Number.isFinite(Number(a.referenceRevision))
    ) {
      return `A ação '${a.action ?? a.actionId ?? "?"}' tem 'reference_revision' inválida.`;
    }
    if (Array.isArray(a.parts) && a.parts.length > RECIPE_LIMITS.MAX_PARTS) {
      return `A ação '${a.action ?? a.actionId ?? "?"}' tem partes demais (máximo ${RECIPE_LIMITS.MAX_PARTS}).`;
    }
  }
  return null;
}

/** Lança se a configuração `deliveryV1` for inválida. */
export function assertDeliveryV1Valid(deliveryV1: any): void {
  const err = deliveryV1ConfigError(deliveryV1);
  if (err) throw new Error(err);
}

/** Valida/normaliza uma receita recebida pela API (lança em formato inválido). */
export function validateRecipe(raw: any): DeliveryRecipe {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("delivery_recipe deve ser um objeto.");
  }
  if (!Array.isArray(raw.actions)) {
    throw new Error("delivery_recipe.actions deve ser um array.");
  }
  if (raw.actions.length === 0) {
    throw new Error("delivery_recipe.actions não pode ser vazio.");
  }
  if (raw.actions.length > RECIPE_LIMITS.MAX_ACTIONS) {
    throw new Error(`delivery_recipe não pode ter mais de ${RECIPE_LIMITS.MAX_ACTIONS} ações.`);
  }
  if (typeof raw.version === "number" && (!Number.isFinite(raw.version) || raw.version < 1)) {
    throw new Error("delivery_recipe.version inválida.");
  }
  const seenIds = new Set<string>();
  for (const a of raw.actions) {
    if (!a || typeof a !== "object" || typeof a.type !== "string" || !a.type.trim()) {
      throw new Error("Cada ação precisa de um campo 'type' (string).");
    }
    if (a.parts !== undefined) {
      if (!Array.isArray(a.parts)) {
        throw new Error("`parts` deve ser um array.");
      }
      if (a.parts.length > RECIPE_LIMITS.MAX_PARTS) {
        throw new Error(`Cada ação pode ter no máximo ${RECIPE_LIMITS.MAX_PARTS} partes.`);
      }
      const partIds = new Set<string>();
      for (const p of a.parts) {
        if (!p || typeof p !== "object") throw new Error("Cada parte deve ser um objeto.");
        const pid = optStr(p.id);
        if (pid) {
          if (partIds.has(pid)) throw new Error(`id de parte duplicado: '${pid}'.`);
          partIds.add(pid);
        }
        if (
          p.reference_revision !== undefined &&
          optNum(p.reference_revision) === undefined
        ) {
          throw new Error("'reference_revision' de uma parte deve ser um número inteiro.");
        }
        if (p.contents_preview !== undefined && !Array.isArray(p.contents_preview)) {
          throw new Error("'contents_preview' de uma parte deve ser um array.");
        }
      }
    }
    const id = optStr(a.id);
    if (id) {
      if (seenIds.has(id)) throw new Error(`id de ação duplicado: '${id}'.`);
      seenIds.add(id);
    }
    const mode = normalizeMode(a.mode);
    if (mode === "LOCAL_REFERENCE") {
      if (!optStr(a.reference_id)) {
        throw new Error("Ação LOCAL_REFERENCE exige 'reference_id'.");
      }
      if (a.reference_revision !== undefined && optNum(a.reference_revision) === undefined) {
        throw new Error("'reference_revision' deve ser um número inteiro.");
      }
    }
    if (a.quantity_mode !== undefined && !normalizeQuantityMode(a.quantity_mode)) {
      throw new Error("'quantity_mode' deve ser MULTIPLY, REPEAT ou IGNORE.");
    }
    if (a.payload !== undefined) {
      const size = JSON.stringify(a.payload ?? null).length;
      if (size > RECIPE_LIMITS.MAX_PAYLOAD_CHARS) {
        throw new Error(
          `payload da ação '${a.type}' excede ${RECIPE_LIMITS.MAX_PAYLOAD_CHARS} caracteres.`,
        );
      }
    }
  }
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    offline_execute: raw.offline_execute,
    actions: raw.actions as RecipeAction[],
  };
}
