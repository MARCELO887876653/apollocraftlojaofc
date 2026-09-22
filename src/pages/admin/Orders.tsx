import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { formatBRL, formatDate, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_COLOR, DELIVERY_STATUS_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Loader2, Ban } from "lucide-react";

type Order = {
  _id: string; number: string; customerName: string; customerEmail: string;
  discord?: string; minecraftNick?: string; phone?: string; uuidField?: string;
  items: Array<{ name: string; variantName?: string; quantity: number; unitPriceCents: number; totalCents: number }>;
  subtotalCents: number; discountCents: number; totalCents: number; couponCode?: string;
  paymentStatus: string; deliveryStatus: string; gateway?: string; gatewayPaymentId?: string;
  createdAt: number; paidAt?: number; statusHistory: Array<{ status: string; at: number; note?: string }>;
};

const STATUSES = ["pending", "paid", "cancelled", "expired", "refunded", "failed"] as const;

export default function AdminOrders() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orders = useQuery(api.orders.adminList, {
    status: status === "all" ? undefined : status,
    search: search || undefined,
  }) as Order[] | undefined;

  const detail = useQuery(
    api.orders.adminGet,
    selectedId ? { id: selectedId as any } : "skip",
  ) as { order: Order; deliveries: any[] } | undefined;

  const updateStatus = useMutation(api.orders.adminUpdateStatus);
  const cancelOrder = useMutation(api.orders.adminCancel);

  const setStatusOf = async (id: string, next: string) => {
    try {
      await updateStatus({ id: id as any, paymentStatus: next as any });
      toast.success("Status atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    }
  };

  const cancel = async (id: string) => {
    try {
      await cancelOrder({ id: id as any });
      toast.success("Pedido cancelado e estoque devolvido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
        <p className="text-sm text-muted-foreground">Gerencie pedidos, pagamentos e status</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente, e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Pagamento</th>
                  <th className="px-4 py-3">Entrega</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {orders === undefined && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></td></tr>
                )}
                {orders?.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum pedido encontrado</td></tr>
                )}
                {orders?.map((o) => (
                  <tr
                    key={o._id}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                    onClick={() => setSelectedId(o._id)}
                  >
                    <td className="px-4 py-3 font-medium">{o.number}</td>
                    <td className="px-4 py-3">
                      <p>{o.customerName}</p>
                      <p className="text-xs text-muted-foreground">{o.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatBRL(o.totalCents)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={PAYMENT_STATUS_COLOR[o.paymentStatus]}>
                        {PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{DELIVERY_STATUS_LABEL[o.deliveryStatus] ?? o.deliveryStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>Pedido {detail.order.number}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="font-medium">{detail.order.customerName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="font-medium">{detail.order.customerEmail}</p>
                  </div>
                  {detail.order.discord && (
                    <div><p className="text-xs text-muted-foreground">Discord</p><p>{detail.order.discord}</p></div>
                  )}
                  {detail.order.minecraftNick && (
                    <div><p className="text-xs text-muted-foreground">Minecraft</p><p>{detail.order.minecraftNick}</p></div>
                  )}
                  {detail.order.phone && (
                    <div><p className="text-xs text-muted-foreground">Telefone</p><p>{detail.order.phone}</p></div>
                  )}
                  {detail.order.uuidField && (
                    <div><p className="text-xs text-muted-foreground">UUID</p><p className="truncate">{detail.order.uuidField}</p></div>
                  )}
                </div>

                <div>
                  <p className="mb-2 font-medium">Itens</p>
                  <div className="space-y-1.5">
                    {detail.order.items.map((it, i) => (
                      <div key={i} className="flex justify-between rounded-md border px-3 py-2">
                        <span>{it.quantity}× {it.name}{it.variantName ? ` — ${it.variantName}` : ""}</span>
                        <span className="font-medium">{formatBRL(it.totalCents)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="font-semibold">{formatBRL(detail.order.subtotalCents)}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">Desconto</p>
                    <p className="font-semibold">{formatBRL(detail.order.discountCents)}</p>
                  </div>
                  <div className="rounded-lg border border-primary/40 bg-primary/5 p-2">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold text-primary">{formatBRL(detail.order.totalCents)}</p>
                  </div>
                </div>

                {detail.order.gatewayPaymentId && (
                  <p className="text-xs text-muted-foreground">
                    Gateway: {detail.order.gateway} · ID: {detail.order.gatewayPaymentId}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Select
                    value={detail.order.paymentStatus}
                    onValueChange={(v) => setStatusOf(detail.order._id, v)}
                  >
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {detail.order.paymentStatus === "pending" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancel(detail.order._id)}
                    >
                      <Ban className="mr-1 size-3.5" /> Cancelar
                    </Button>
                  )}
                </div>

                {detail.deliveries.length > 0 && (
                  <div>
                    <p className="mb-2 font-medium">Entregas</p>
                    <div className="space-y-1.5">
                      {detail.deliveries.map((d) => (
                        <div key={d._id} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                          <span>{d.productName} → {d.target ?? "—"} ({d.type})</span>
                          <Badge variant="outline">{DELIVERY_STATUS_LABEL[d.status] ?? d.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 font-medium">Histórico</p>
                  <ol className="space-y-1.5">
                    {detail.order.statusHistory.map((h, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        {formatDate(h.at)} — <span className="font-medium text-foreground">{h.status}</span>
                        {h.note ? ` · ${h.note}` : ""}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </>
          ) : (
            <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin" /></div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
