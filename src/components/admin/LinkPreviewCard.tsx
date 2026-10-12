import type { ShareMeta } from "@/convex/lib/seo";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";

/**
 * Prévia de como a bio aparece quando o link da loja é compartilhado no
 * Discord (é o formato mais exigente: mostra site name, título, descrição e a
 * capa). O mesmo conteúdo alimenta o WhatsApp/Telegram/Google.
 */
export function LinkPreviewCard({
  meta,
  className,
}: {
  meta: ShareMeta;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-[#313338] p-3", className)}>
      <div className="flex gap-3">
        <span
          className="w-1 shrink-0 rounded-full bg-sky-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xs font-semibold text-[#b5bac1]">
              {meta.siteName}
            </span>
            {meta.imageAnimated && (
              <span className="flex items-center gap-1 rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                <Play className="size-2.5 fill-current" /> GIF
              </span>
            )}
          </div>

          <p className="text-[15px] font-semibold leading-snug text-[#00a8fc]">
            {meta.title}
          </p>

          {meta.description && (
            <p className="line-clamp-3 text-sm leading-snug text-[#dbdee1]">
              {meta.description}
            </p>
          )}

          {meta.image ? (
            <img
              src={meta.image}
              alt={meta.title}
              className="max-h-64 w-full rounded-lg object-cover"
            />
          ) : (
            <p className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-xs text-[#949ba4]">
              Sem capa — o link aparece só com o texto. Envie uma imagem ou GIF
              para personalizar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
