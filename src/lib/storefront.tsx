import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createContext, useContext, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────
// Leitura da vitrine em DUAS chamadas de função.
//
// O Convex cobra por chamada, e cada `useQuery` é uma chamada: com os hooks
// antigos, só a home disparava ~13 antes de pintar. Aqui o "shell" (loja, tema,
// menu, bio do link) vive num provider — UM `useQuery` compartilhado por todas
// as telas — e a home recebe o resto de uma vez (`getHome`).
//
// Ver o porquê no backend: src/convex/storefront.ts
// ─────────────────────────────────────────────────────────────

/**
 * Formatos devolvidos pelo backend, tipados pelo próprio Convex — assim o
 * frontend não repete o formato à mão (nem precisa de cast para `any`).
 *
 * - `store`   → configuração da loja (nome, logo, redes, manutenção…)
 * - `theme`   → cores e raio aplicados como variáveis CSS
 * - `menu`    → itens do menu do topo
 * - `shareMeta` → bio do link com as tags `<head>` já prontas
 * - `brandMigrationPending` → ainda falta rodar a migração de marca? (quase nunca)
 */
export type StoreShell = FunctionReturnType<typeof api.storefront.getShell>;

/** Tudo o que a home mostra: seções, banner, categorias, top 3 e FAQ. */
export type HomeData = FunctionReturnType<typeof api.storefront.getHome>;

const StoreShellContext = createContext<StoreShell | undefined>(undefined);

/**
 * Uma única assinatura do "shell" para a loja inteira. Enquanto os dados não
 * chegam, o valor é `undefined` (os componentes já tratam isso como "carregando").
 */
export function StoreShellProvider({ children }: { children: ReactNode }) {
  const shell = useQuery(api.storefront.getShell);
  return <StoreShellContext.Provider value={shell}>{children}</StoreShellContext.Provider>;
}

export function useStoreShell(): StoreShell | undefined {
  return useContext(StoreShellContext);
}

/** Dados exclusivos da home (seções, banner, categorias, top 3, FAQ). */
export function useHomeData(): HomeData | undefined {
  return useQuery(api.storefront.getHome);
}
