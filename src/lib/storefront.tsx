import { api } from "@/convex/_generated/api";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────
// Leitura da vitrine em PACOTES (poucas chamadas de função).
//
// O Convex cobra por chamada, e cada `useQuery` é uma chamada: com os hooks
// antigos, só a home disparava ~13 antes de pintar. Aqui o "shell" (loja, tema,
// menu, bio do link) vive num provider — UMA assinatura compartilhada por todas
// as telas — e a home/os catálogos recebem o resto de uma vez.
//
// Ver o porquê no backend: src/convex/storefront.ts
//
// IMPORTANTE — por que este provider NÃO usa `useQuery`:
// `useQuery` deixa o erro do servidor subir pelo render, e como o shell é
// montado em toda página, um endereço errado/morto derrubava o site inteiro
// ("Preview runtime error"). Aqui a resposta é lida à mão (`watchQuery` +
// `localQueryResult` dentro de try/catch): o erro vira ESTADO, o app continua
// de pé, mostra o esqueleto e troca de endereço sozinho.
// ─────────────────────────────────────────────────────────────

/**
 * Formatos devolvidos pelo backend, tipados pelo próprio Convex — assim o
 * frontend não repete o formato à mão (nem precisa de cast para `any`).
 */
export type StoreShell = FunctionReturnType<typeof api.storefront.getShell>;

/** Tudo o que a home mostra: seções, banner, categorias, top 3 e FAQ. */
export type HomeData = FunctionReturnType<typeof api.storefront.getHome>;

/** Dados exclusivos da categoria: ela, as filhas (chips) e os produtos. */
export type CategoryPageData = FunctionReturnType<typeof api.storefront.getCategoryPage>;

/** Produto, variações, categoria e relacionados numa resposta só. */
export type ProductPageData = FunctionReturnType<typeof api.storefront.getProductPage>;

type ShellState = {
  /** Dados do shell; `undefined` enquanto não chegaram. */
  shell: StoreShell | undefined;
  /** O servidor recusou a consulta (endereço errado, limite de uso, fora do ar). */
  failed: boolean;
};

const ShellContext = createContext<ShellState>({ shell: undefined, failed: false });

/**
 * Uma única assinatura do shell para a loja inteira. Nunca lança: erro do
 * servidor vira `failed`, para o guard de conexão explicar e trocar o endereço.
 */
export function StoreShellProvider({ children }: { children: ReactNode }) {
  const client = useConvex();
  const [state, setState] = useState<ShellState>({ shell: undefined, failed: false });

  useEffect(() => {
    const watch = client.watchQuery(api.storefront.getShell, {});
    const read = () => {
      try {
        const value = watch.localQueryResult();
        if (value !== undefined) {
          setState({ shell: value as StoreShell, failed: false });
        }
      } catch {
        setState({ shell: undefined, failed: true });
      }
    };
    read();
    return watch.onUpdate(read);
  }, [client]);

  return <ShellContext.Provider value={state}>{children}</ShellContext.Provider>;
}

export function useStoreShell(): StoreShell | undefined {
  return useContext(ShellContext).shell;
}

/** `true` quando o servidor recusou o shell (o guard usa para reagir na hora). */
export function useStoreShellFailed(): boolean {
  return useContext(ShellContext).failed;
}

/** Dados exclusivos da home (seções, banner, categorias, top 3, FAQ). */
export function useHomeData(): HomeData | undefined {
  return useQuery(api.storefront.getHome);
}
