import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatBRL, formatDate, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_COLOR } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2, Mail } from "lucide-react";

type Customer = {
  _id: string; email: string; name?: string; discord?: string; minecraftNick?: string;
  phone?: string; ordersCount: number; totalSpentCents: number;
  firstOrderAt?: number; lastOrderAt?: number;
};

export default function AdminCustomers() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const customers = useQuery(api.customers.adminList, { search: search || undefined }) as Customer[] | undefined;
  const detail = useQuery(
    api.customers.adminGet,
    selectedId ? { id: selectedId as any } : "skip",
  ) as { customer: Customer; orders: any[] } | undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">Base de clientes e histórico de compras</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por e-mail, nome, nick..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3">Total gasto</th>
                  <th className="px-4 py-3">Última compra</th>
                </tr>
              </thead>
              <tbody>
                {customers === undefined && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
                )}
                {customers?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum cliente ainda</td></tr>
                )}
                {customers?.map((c) => (
                  <tr
                    key={c._id}
                    className="cursor-pointer border-b hover:bg-muted/50"
                    onClick={() => setSelectedId(c._id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.name ?? c.email.split("@")[0]}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="size-3" /> {c.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.discord && <p>Discord: {c.discord}</p>}
                      {c.minecraftNick && <p>MC: {c.minecraftNick}</p>}
                      {c.phone && <p>Tel: {c.phone}</p>}
                      {!c.discord && !c.minecraftNick && !c.phone && "—"}
                    </td>
                    <td className="px-4 py-3">{c.ordersCount}</td>
                    <td className="px-4 py-3 font-semibold">{formatBRL(c.totalSpentCents)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>{detail.customer.name ?? detail.customer.email}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Pedidos</p>
                    <p className="text-xl font-bold">{detail.customer.ordersCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Total gasto</p>
                    <p className="text-xl font-bold">{formatBRL(detail.customer.totalSpentCents)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Ticket médio</p>
                    <p className="text-xl font-bold">
                      {formatBRL(
                        detail.customer.ordersCount
                          ? Math.round(detail.customer.totalSpentCents / detail.customer.ordersCount)
                          : 0,
                      )}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 font-medium">Pedidos</p>
                  <div className="space-y-2">
                    {detail.orders.length === 0 && <p className="text-muted-foreground">Nenhum pedido.</p>}
                    {detail.orders.map((o) => (
                      <div key={o._id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="font-medium">{o.number}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatBRL(o.totalCents)}</p>
                          <Badge variant="outline" className={PAYMENT_STATUS_COLOR[o.paymentStatus]}>
                            {PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
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
