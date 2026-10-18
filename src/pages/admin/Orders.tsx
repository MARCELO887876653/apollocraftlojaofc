import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { formatBRL, formatDate, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_COLOR, DELIVERY_STATUS_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Loader2, Ban, CheckCircle2, PackagePlus, RefreshCw, RotateCcw } from "lucide-react";

type Order = {
  _id: string; number: string; customerName: string; customerEmail: string;
  discord?: string; minecraftNick?: string; phone?: string; uuidField?: string;
  items: Array<{ name: string; variantName?: string; quantity: number; unitPriceCents: number; totalCents: number }>;
  subtotalCents: number; discountCents: number; totalCents: number; couponCode?: string;
  paymentStatus: string; deliveryStatus: string; gateway?: string; gatewayPaymentId?: string;
  createdAt: number; paidAt?: number; statusHistory: Array<{ status: string; at: number; note?: string }>;
};

const STATUSES = ["pending", "paid", "cancelled", "expired", "refunded", "failed"] as const;

type Command = {
  _id: string;
  action: string;
  productName: string;
  clientIdentifier: string;
  serverId: string;
  addonId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
};

const COMMAND_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSING: "Processando",
  DONE: "Concluída",
  FAILED: "Falhou",
  CANCELED: "Cancelada",
};

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
  const deliverManually = useMutation(api.orders.adminDeliverManually);
  const refreshPayment = useAction(api.payments.refreshPaymentStatus);
  const retryCommand = useMutation(api.deliveryCommands.adminRetry);
  const redeliverCommand = useMutation(api.deliveryCommands.adminRedeliver);
  // Entregas automáticas (Minecraft) do pedido aberto — é o que o addon
  // consome; ficava invisível no detalhe do pedido.
  const commands = useQuery(
    api.deliveryCommands.adminListByOrder,
    selectedId ? { orderId: selectedId as any } : "skip",
  ) as Command[] | undefined;

  // Entrega manual: o admin confirma o recebimento (PIX caiu mas o webhook
  // atrasou, por exemplo), escreve o que entregou e o pedido é fechado.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [busy, setBusy] = useState<"confirm" | "gateway" | "manual" | null>(null);

  const setStatusOf = async (id: string, next: string) => {
    try {
      await updateStatus({ id: id as any, paymentStatus: next as any });
      toast.success("Status atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    }
  };

  const confirmPayment = async (id: string) => {
    setBusy("confirm");
    try {
      await updateStatus({ id: id as any, paymentStatus: "paid" });
      toast.success("Pagamento confirmado — entrega automática enfileirada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar o pagamento");
    } finally {
      setBusy(null);
    }
  };

  const checkGateway = async (id: string) => {
    setBusy("gateway");
    try {
      const res = (await refreshPayment({ orderId: id as any })) as { status: string };
      const labels: Record<string, string> = {
        paid: "Pagamento aprovado no gateway — pedido atualizado",
        pending: "O gateway ainda não registrou o pagamento",
        cancelled: "O gateway informa pagamento cancelado",
        failed: "O gateway recusou o pagamento",
        refunded: "O gateway informa pagamento reembolsado",
      };
      toast.success(labels[res?.status] ?? `Status no gateway: ${res?.status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao consultar o gateway");
    } finally {
      setBusy(null);
    }
  };

  const retryCommandById = async (id: string) => {
    try {
      await retryCommand({ id: id as any });
      toast.success("Entrega reenviada para a fila");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reenviar a entrega");
    }
  };

  /** Reenvia uma entrega JÁ CONCLUÍDA (ex.: cliente comprou 2 e recebeu 1).
   *  Cada reenvio entrega uma unidade a mais, por isso pede confirmação. */
  const redeliverCommandById = async (id: string) => {
    if (
      !confirm(
        "Reenviar uma entrega já concluída? O jogador vai receber este item novamente. Use isso para repor uma unidade que faltou.",
      )
    ) {
      return;
    }
    try {
      await redeliverCommand({ id: id as any, confirm: true });
      toast.success("Entrega reenviada — o addon vai entregar de novo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reenviar a entrega");
    }
  };

  const submitManual = async (id: string, confirmPaymentFlag: boolean) => {
    setBusy("manual");
    try {
      const res = await deliverManually({
        id: id as any,
        note: manualNote.trim() || undefined,
        confirmPayment: confirmPaymentFlag,
      });
      toast.success(
        `Entrega manual registrada${res.delivered > 0 ? ` (${res.delivered} item(ns))` : ""}`,
      );
      setManualOpen(false);
      setManualNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao entregar manualmente");
    } finally {
      setBusy(null);
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
          {/* Celular: cartões legíveis (a tabela no celular cortava nome e status). */}
          <div className="divide-y sm:hidden">
            {orders === undefined && (
              <div className="flex justify-center px-4 py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {orders?.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum pedido encontrado
              </p>
            )}
            {orders?.map((o) => (
              <button
                key={o._id}
                type="button"
                onClick={() => setSelectedId(o._id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{o.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.customerEmail}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {o.number} · {formatDate(o.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  <p className="text-sm font-semibold">{formatBRL(o.totalCents)}</p>
                  <Badge variant="outline" className={PAYMENT_STATUS_COLOR[o.paymentStatus]}>
                    {PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}
                  </Badge>
                  <p className="text-[11px] text-muted-foreground">
                    {DELIVERY_STATUS_LABEL[o.deliveryStatus] ?? o.deliveryStatus}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
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

      <Dialog
        open={!!selectedId}
        onOpenChange={(open) => {
          if (open) return;
          setSelectedId(null);
          setManualOpen(false);
          setManualNote("");
        }}
      >
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

                {/* Ações: confirmar o que o gateway não confirmou, entregar
                    na mão (nick, cargo, produto) e cancelar. */}
                <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <div className="flex flex-wrap gap-2">
                    {detail.order.paymentStatus !== "paid" && (
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => confirmPayment(detail.order._id)}
                      >
                        {busy === "confirm" ? (
                          <Loader2 className="mr-1 size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1 size-3.5" />
                        )}
                        Confirmar pagamento
                      </Button>
                    )}
                    {(detail.order.paymentStatus !== "paid" ||
                      detail.order.deliveryStatus !== "delivered") && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => setManualOpen((o) => !o)}
                      >
                        <PackagePlus className="mr-1 size-3.5" /> Entregar manualmente
                      </Button>
                    )}
                    {detail.order.gatewayPaymentId && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => checkGateway(detail.order._id)}
                      >
                        {busy === "gateway" ? (
                          <Loader2 className="mr-1 size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 size-3.5" />
                        )}
                        Verificar no gateway
                      </Button>
                    )}
                    {detail.order.paymentStatus === "pending" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => cancel(detail.order._id)}
                      >
                        <Ban className="mr-1 size-3.5" /> Cancelar
                      </Button>
                    )}
                  </div>

                  {manualOpen && (
                    <div className="space-y-2 border-t pt-2">
                      <p className="text-xs text-muted-foreground">
                        O que foi entregue ao cliente (fica no histórico do pedido e
                        aparece para ele).
                      </p>
                      <Textarea
                        value={manualNote}
                        onChange={(e) => setManualNote(e.target.value)}
                        placeholder="Ex.: VIP entregue no servidor e confirmado no Discord"
                        rows={2}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => submitManual(detail.order._id, true)}
                        >
                          {busy === "manual" ? (
                            <Loader2 className="mr-1 size-3.5 animate-spin" />
                          ) : (
                            <PackagePlus className="mr-1 size-3.5" />
                          )}
                          Confirmar entrega
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => {
                            setManualOpen(false);
                            setManualNote("");
                          }}
                        >
                          Voltar
                        </Button>
                      </div>
                      {detail.order.paymentStatus !== "paid" && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          O pagamento também será marcado como recebido.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                    <span className="text-xs text-muted-foreground">Status do pagamento:</span>
                    <Select
                      value={detail.order.paymentStatus}
                      onValueChange={(v) => setStatusOf(detail.order._id, v)}
                    >
                      <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {detail.deliveries.length > 0 && (
                  <div>
                    <p className="mb-2 font-medium">Entregas</p>
                    <div className="space-y-1.5">
                      {detail.deliveries.map((d) => (
                        <div key={d._id} className="rounded-md border px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span>{d.productName} → {d.target ?? "—"} ({d.type})</span>
                            <Badge variant="outline">
                              {DELIVERY_STATUS_LABEL[d.status] ?? d.status}
                            </Badge>
                          </div>
                          {d.payload !== undefined && d.payload !== null && (
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                              {typeof d.payload === "string"
                                ? d.payload
                                : JSON.stringify(d.payload)}
                            </p>
                          )}
                          {d.lastError && (
                            <p className="mt-1 text-red-600 dark:text-red-400">{d.lastError}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {commands && commands.length > 0 && (
                  <div>
                    <p className="mb-2 font-medium">Entregas automáticas</p>
                    <div className="space-y-1.5">
                      {commands.map((c) => (
                        <div key={c._id} className="rounded-md border px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-sky-500">{c.action}</span>
                            <Badge variant="outline">
                              {COMMAND_LABEL[c.status] ?? c.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {c.productName} → {c.clientIdentifier} · {c.serverId}/{c.addonId} ·{" "}
                            {c.attempts}/{c.maxAttempts} tentativas
                          </p>
                          {c.lastError && (
                            <p className="mt-1 text-red-600 dark:text-red-400">{c.lastError}</p>
                          )}
                          {c.status === "DONE" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1.5 h-7"
                              onClick={() => redeliverCommandById(c._id)}
                            >
                              <RefreshCw className="mr-1 size-3" /> Reenviar (dar de novo)
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1.5 h-7"
                              onClick={() => retryCommandById(c._id)}
                            >
                              <RotateCcw className="mr-1 size-3" /> Reenviar
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Cliente recebeu menos do que comprou? Use{" "}
                      <strong>Reenviar (dar de novo)</strong> na entrega — cada reenvio dá uma
                      unidade extra no servidor.
                    </p>
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
