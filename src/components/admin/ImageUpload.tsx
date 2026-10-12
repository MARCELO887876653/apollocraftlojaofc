import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  label: string;
  value?: string;
  onChange: (url: string | undefined) => void;
  aspect?: "square" | "wide";
  /**
   * Recebe o tipo do arquivo enviado (ex.: "image/gif"). Usado pela bio do
   * link para marcar uma capa animada sem o admin precisar dizer o formato.
   */
  onFileType?: (mimeType: string) => void;
};

/**
 * Campo de imagem que permite escolher uma foto do celular/computador
 * (além de colar uma URL). O arquivo vai direto para o storage do Convex.
 */
export function ImageUpload({
  label,
  value,
  onChange,
  aspect = "square",
  onFileType,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const finalizeUpload = useMutation(api.files.finalizeUpload);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (JPG, PNG, WEBP, GIF…)");
      return;
    }
    // GIFs animados costumam passar de 5 MB; damos um pouco mais de espaço.
    const limit = file.type === "image/gif" ? 8 : 5;
    if (file.size > limit * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máx. ${limit} MB)`);
      return;
    }
    setUploading(true);
    try {
      const postUrl = await generateUploadUrl();
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Falha no envio da imagem");
      const { storageId } = (await res.json()) as { storageId: string };
      const { url } = await finalizeUpload({ storageId: storageId as any });
      onChange(url);
      onFileType?.(file.type || "");
      toast.success("Imagem enviada!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const ratioClass = aspect === "wide" ? "aspect-[16/9]" : "aspect-square";

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <div
          className={`relative size-24 shrink-0 overflow-hidden rounded-lg border bg-muted ${ratioClass === "aspect-[16/9]" ? "w-40" : ""}`}
        >
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImagePlus className="size-6" />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {value && !uploading && (
            <button
              type="button"
              aria-label="Remover imagem"
              className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground shadow hover:bg-background"
              onClick={() => onChange(undefined)}
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImagePlus className="mr-2 size-4" />}
            {uploading ? "Enviando…" : "Escolher imagem ou GIF"}
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowUrl((s) => !s)}
          >
            {showUrl ? "Ocultar URL" : "Usar URL"}
          </button>
          {showUrl && (
            <Input
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value || undefined)}
              placeholder="https://..."
              className="h-8 text-xs"
            />
          )}
        </div>
      </div>
    </div>
  );
}
