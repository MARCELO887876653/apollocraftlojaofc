import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { formatDate, DELIVERY_STATUS_LABEL, DELIVERY_TYPE_LABEL, DELIVERY_STATUS_COLOR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, RotateCcw, CheckCircle2, Truck } from "lucide-react";

type Delivery = {
  _id: string; orderNumber: string; productName: string; type: string;
  target?: string; quantity: number; status: string; attempts: number;
  maxAttempts: number; lastError?: string; createdAt: number; deliveredAt?: number;
};

export default function AdminDeliveries() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");

  const deliveries = useQuery(api.deliveriesAdmin.adminList, {
    status: status === "all" ? undefined : status,
  }) as Delivery[] | undefined;

  const retry = useMutation(api.deliveriesAdmin.adminRetry);
  const markDelivered = useMutation(api.deliveriesAdmin.adminMarkDelivered);

  const doRetry = async (id: string) => {
    try {
      await retry({ id: id as any });
      toast.success("Entrega reenfileirada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reprocessar");
    }
  };

  const doMark = async (id: string) => {
    try {
      await markDelivered({ id: id as any });
      toast.success("Marcada como entregue");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entregas</h1>
        <p className="text-sm text-muted-foreground">Fila de entrega automática dos pedidos pagos</p>
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="pending">Pendente</SelectItem>
          <SelectItem value="processing">Processando</SelectItem>
          <SelectItem value="delivered">Entregue</SelectItem>
          <SelectItem value="failed">Falhou</SelectItem>
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tentativas</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {deliveries === undefined && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
                )}
                {deliveries?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <Truck className="mx-auto mb-2 size-8" />
                      Nenhuma entrega na fila
                    </td>
                  </tr>
                )}
                {deliveries?.map((d) => (
                  <tr key={d._id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium">{d.orderNumber}</td>
                    <td className="px-4 py-3">{d.productName} <span className="text-muted-foreground">×{d.quantity}</span></td>
                    <td className="px-4 py-3 text-xs">{d.target ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{DELIVERY_TYPE_LABEL[d.type] ?? d.type}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={DELIVERY_STATUS_COLOR[d.status]}>
                        {DELIVERY_STATUS_LABEL[d.status] ?? d.status}
                      </Badge>
                      {d.lastError && (
                        <p className="mt-1 max-w-xs truncate text-xs text-red-600" title={d.lastError}>
                          {d.lastError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{d.attempts}/{d.maxAttempts}</td>
                    <td className="px-4 py-3 text-right">
                      {d.status !== "delivered" && (
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => doRetry(d._id)}>
                            <RotateCcw className="mr-1 size-3.5" /> Reprocessar
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => doMark(d._id)}>
                            <CheckCircle2 className="mr-1 size-3.5" /> Entregue
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
