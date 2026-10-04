import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Gift, Copy } from "lucide-react";
import {
  DELIVERY_STATUS_COLOR,
  DELIVERY_STATUS_LABEL,
  DELIVERY_TYPE_LABEL,
} from "@/lib/format";
import { toast } from "sonner";

export type DeliveryItem = {
  productName: string;
  quantity: number;
  type: string;
  status: string;
  deliveredAt?: number;
  payload?: any;
};

function PayloadBox({ payload }: { payload: any }) {
  if (payload === undefined || payload === null || payload === "") return null;
  const lines = Array.isArray(payload) ? payload : [String(payload)];
  return (
    <div className="mt-2 space-y-1.5">
      {lines.map((line, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
        >
          <code className="flex-1 break-all text-xs text-foreground">{line}</code>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label="Copiar"
            onClick={() => {
              void navigator.clipboard.writeText(String(line));
              toast.success("Copiado!");
            }}
          >
            <Copy className="size-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

/**
 * "O que você recebeu" — lista as entregas de um pedido.
 * `number` é o número do pedido; a variante `guest` usa a query pública
 * (para a página do pedido, sem login) e a padrão a query do cliente logado.
 */
export function DeliveriesList({
  number,
  token,
  variant = "account",
  collapsible = false,
}: {
  number: string;
  /** Token de acesso do pedido — obrigatório na variante "guest". */
  token?: string;
  variant?: "account" | "guest";
  collapsible?: boolean;
}) {
  const isGuest = variant === "guest";
  // Hook chamado incondicionalmente (regra dos hooks): só o alvo/args variam.
  const deliveries = useQuery(
    (isGuest ? api.orders.guestDeliveries : api.orders.myOrderDeliveries) as typeof api.orders.myOrderDeliveries,
    isGuest ? ({ number, token: token || undefined } as any) : { number },
  ) as DeliveryItem[] | null | undefined;

  if (variant === "guest" && deliveries === null) return null;

  const body = (
    <div className="text-sm">
      {deliveries === undefined && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Carregando entregas…
        </p>
      )}
      {deliveries !== undefined && deliveries !== null && deliveries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhuma entrega automática para este pedido.
        </p>
      )}
      <div className="space-y-3">
        {(deliveries ?? []).map((d, i) => (
          <div key={i}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {d.quantity}× {d.productName}
              </span>
              <Badge variant="outline" className={DELIVERY_STATUS_COLOR[d.status] ?? ""}>
                {DELIVERY_STATUS_LABEL[d.status] ?? d.status}
              </Badge>
              {d.type !== "none" && (
                <span className="text-xs text-muted-foreground">
                  {DELIVERY_TYPE_LABEL[d.type] ?? d.type}
                </span>
              )}
            </div>
            {d.status === "delivered" ? (
              <PayloadBox payload={d.payload} />
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {d.status === "failed"
                  ? "Houve um problema na entrega automática — fale com o suporte."
                  : "Aguardando processamento…"}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  if (collapsible) {
    return (
      <details className="group rounded-lg border bg-muted/30">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <Gift className="size-4 text-primary" />
          O que você recebeu
          {deliveries !== undefined && deliveries !== null && deliveries.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {deliveries.filter((d) => d.status === "delivered").length}/{deliveries.length}{" "}
              entregue(s)
            </span>
          )}
        </summary>
        <div className="border-t px-4 py-3">{body}</div>
      </details>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Gift className="size-4 text-primary" /> O que você recebeu
      </p>
      {body}
    </div>
  );
}
