import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { publishedShareMeta, shareMetaDiff } from "@/lib/shareMetaHtml";
import type { ShareMeta } from "@/convex/lib/seo";
import { AlertTriangle, CheckCircle2, Copy, HelpCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Status =
  | { kind: "checking" }
  | { kind: "preview" }
  | { kind: "ok" }
  | { kind: "stale"; fields: string[] }
  | { kind: "unknown" };

/**
 * Compara o card que está NO AR com o que está salvo no painel.
 *
 * Por que existe: quem edita a bio só descobre que o Discord continua mostrando
 * o texto antigo quando alguém reclama no chat. O painel passa a responder isso
 * — lendo o HTML publicado (mesma origem, sem CORS) e apontando o que está
 * diferente. O que o robô do Discord lê é o HTML gerado no build, não o painel:
 * por isso a correção é "salvar e publicar de novo".
 *
 * A comparação usa os valores SALVOS (primitivos, vindos da query), não o
 * formulário — assim a verificação não dispara a cada tecla digitada.
 */
export function PublishedShareStatus({ meta }: { meta: ShareMeta }) {
  const { title, description, image, siteName } = meta;
  const [status, setStatus] = useState<Status>(() =>
    import.meta.env.DEV ? { kind: "preview" } : { kind: "checking" },
  );

  const check = useCallback(async () => {
    if (import.meta.env.DEV) {
      setStatus({ kind: "preview" });
      return;
    }
    try {
      // O parâmetro extra força uma leitura sem cache de borda: queremos o HTML
      // publicado neste momento, não a cópia do CDN.
      const response = await fetch(`/?seo-check=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { stale, comparable } = shareMetaDiff(publishedShareMeta(await response.text()), {
        title,
        description,
        image,
        siteName,
      });
      if (!comparable) setStatus({ kind: "unknown" });
      else if (stale.length) setStatus({ kind: "stale", fields: stale });
      else setStatus({ kind: "ok" });
    } catch {
      setStatus({ kind: "unknown" });
    }
  }, [title, description, image, siteName]);

  useEffect(() => {
    void check();
  }, [check]);

  const copyTestLink = async () => {
    const url = `${window.location.origin}/?v=${Date.now().toString(36)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link de teste copiado — cole no Discord para ver a prévia nova.");
    } catch {
      toast.error(`Não foi possível copiar. Link: ${url}`);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-3 text-xs">
      {status.kind === "checking" && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Verificando o que está publicado…
        </p>
      )}

      {status.kind === "ok" && (
        <p className="flex items-start gap-2 text-emerald-500">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          <span>
            O card no ar está igual ao painel. O Discord/WhatsApp ainda podem mostrar a prévia antiga
            por algumas horas (é cache do aplicativo).
          </span>
        </p>
      )}

      {status.kind === "stale" && (
        <p className="flex items-start gap-2 text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            O que está no ar ainda é o antigo: <strong>{status.fields.join(", ")}</strong>. Salve e{" "}
            <strong>publique a loja</strong> — o Discord e o WhatsApp leem o HTML publicado, não o
            painel.
          </span>
        </p>
      )}

      {(status.kind === "preview" || status.kind === "unknown") && (
        <p className="flex items-start gap-2 text-muted-foreground">
          <HelpCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {status.kind === "preview"
              ? "A verificação roda no site publicado — aqui, na prévia, o HTML não é gerado pelo build."
              : "Não foi possível ler as tags do site publicado agora. Tente de novo."}
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setStatus({ kind: "checking" });
            void check();
          }}
        >
          <RefreshCw className="mr-1.5 size-3.5" /> Verificar de novo
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void copyTestLink()}>
          <Copy className="mr-1.5 size-3.5" /> Copiar link de teste
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        O link de teste leva um <code>?v=</code> no fim: o Discord trata como endereço novo e busca a
        prévia na hora, sem esperar o cache dele expirar.
      </p>
    </div>
  );
}
