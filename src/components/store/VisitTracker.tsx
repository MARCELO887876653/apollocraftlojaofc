import { useEffect } from "react";

const KEY = "apollloVisit";

/** Registra 1 visita por sessão do navegador (sessionStorage). */
export function VisitTracker() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      // storage indisponível — segue o fluxo e registra a visita
    }
    fetch("/api/track-visit", { method: "POST" }).catch(() => {});
  }, []);

  return null;
}
