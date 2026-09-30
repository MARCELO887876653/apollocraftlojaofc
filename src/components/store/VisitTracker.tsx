import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const KEY = "apollloVisit";

/** Registra 1 visita por sessão do navegador (sessionStorage). */
export function VisitTracker() {
  const trackVisit = useMutation(api.stats.trackVisit);

  useEffect(() => {
    let seen = false;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
      seen = true;
    } catch {
      seen = true; // storage indisponível — registra mesmo assim
    }
    if (seen) trackVisit({}).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
