import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAction, useQuery } from "convex/react";
import { Link, useParams, useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { DeliveriesList } from "@/components/store/DeliveriesList";
import { formatBRL, formatDate, PAYMENT_STATUS_LABEL, DELIVERY_STATUS_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, Copy, Loader2, PackageCheck, QrCode, XCircle, CreditCard, CheckCheck,
} from "lucide-react";

type Order = {
  _id: string;
  number: string;
  customerName: string;
  customerEmail: string;
  items: Array<{ name: string; variantName?: string; quantity: number; totalCents: number }>;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentStatus: string;
  deliveryStatus: string;
  gatewayPaymentId?: string;
  pixQrCode?: string;
  pixQrCodeBase64?: string;
  pixTicketUrl?: string;
  createdAt: number;
  paidAt?: number;
  statusHistory: Array<{ status: string; at: number; note?: string }>;
};

/** Depois disso o PIX já venceu: paramos de perguntar ao gateway. */
const MAX_PIX_POLL_MS = 10 * 60 * 1000;

/**
 * Primeira consulta ao gateway: dá tempo de o webhook do Mercado Pago chegar
 * sozinho (é o caminho normal, e a página reage na hora pela assinatura do
 * banco). Só depois disso é que vale gastar uma chamada.
 */
const FIRST_PIX_CHECK_MS = 15 * 1000;

/**
 * Intervalo das consultas seguintes.
 *
 * Antes: 5s no primeiro minuto, 15s até 5 min e 30s até 20 min ≈ 58 actions por
 * pedido pendente (cada uma custa uma action + consultas internas + uma
 * chamada ao gateway). Agora: 1 por minuto, no máximo 10.
 */
const NEXT_PIX_CHECK_MS = 60 * 1000;

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  delivered: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  pending: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  processing: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  failed: "bg-red-500/15 text-red-700 border-red-500/30",
};

function StatusBadge({ status, kind }: { status: string; kind: "payment" | "delivery" }) {
  const label = kind === "payment" ? PAYMENT_STATUS_LABEL[status] ?? status : DELIVERY_STATUS_LABEL[status] ?? status;
  return (
    <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>
      {label}
    </Badge>
  );
}

export default function OrderStatusPage() {
  const { number = "" } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const order = useQuery(api.orders.getByNumber, {
    number: decodeURIComponent(number),
    token: token || undefined,
  }) as Order | null | undefined;

  const [creatingPix, setCreatingPix] = useState(false);
  const [pixFailed, setPixFailed] = useState(false);
  const createPix = useAction(api.payments.createPixPayment);
  const refreshStatus = useAction(api.payments.refreshPaymentStatus);

  // Consulta o gateway só enquanto o PIX está pendente — e devagar.
  //
  // O webhook do gateway grava a confirmação no banco e esta tela reage sozinha
  // (a assinatura do pedido continua aberta); o cron de reconciliação cobre o
  // caso de o webhook não estar configurado. Este laço é apenas a rede de
  // segurança de quem está com a página aberta esperando, e cada rodada custa
  // uma action + uma consulta interna + uma chamada ao Mercado Pago — por isso
  // 1x por minuto, no máximo 10 vezes.
  useEffect(() => {
    const orderId = order?._id;
    if (order?.paymentStatus !== "pending" || !order?.gatewayPaymentId || !orderId) return;

    const startedAt = Date.now();
    let timer: number | undefined;
    let stopped = false;
    let firstCheck = true;

    const ask = () => {
      if (stopped || document.visibilityState !== "visible") return;
      void refreshStatus({ orderId: orderId as any }).catch(() => {});
    };

    const schedule = () => {
      if (stopped) return;
      const elapsed = Date.now() - startedAt;
      // Passou do prazo do PIX: o QR já venceu e não há o que esperar.
      if (elapsed > MAX_PIX_POLL_MS) return;
      const delay = firstCheck ? FIRST_PIX_CHECK_MS : NEXT_PIX_CHECK_MS;
      firstCheck = false;
      timer = window.setTimeout(() => {
        ask();
        schedule();
      }, delay);
    };

    // Aba voltou a ficar visível: confere na hora, sem esperar o intervalo.
    const onVisible = () => ask();

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [order?._id, order?.paymentStatus, order?.gatewayPaymentId, refreshStatus]);

  // Auto-criar PIX quando o pedido está pendente sem dados de pagamento
  useEffect(() => {
    if (order && order.paymentStatus === "pending" && !order.pixQrCode && !creatingPix && !pixFailed) {
      setCreatingPix(true);
      createPix({ orderId: order._id as any })
        .catch(() => setPixFailed(true))
        .finally(() => setCreatingPix(false));
    }
  }, [order, createPix, creatingPix, pixFailed]);

  const copyPix = async () => {
    if (!order?.pixQrCode) return;
    await navigator.clipboard.writeText(order.pixQrCode);
    toast.success("Código PIX copiado!");
  };

  if (order === undefined) {
    return (
      <StoreLayout>
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        </div>
      </StoreLayout>
    );
  }

  if (!order) {
    return (
      <StoreLayout>
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <XCircle className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Pedido não encontrado</h1>
          <Button className="mt-6" asChild><Link to="/">Voltar à loja</Link></Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="text-center">
          {order.paymentStatus === "paid" ? (
            <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
          ) : order.paymentStatus === "pending" ? (
            <Clock className="mx-auto size-14 text-yellow-600" />
          ) : (
            <XCircle className="mx-auto size-14 text-red-600" />
          )}
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Pedido {order.number}</h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <StatusBadge status={order.paymentStatus} kind="payment" />
            <StatusBadge status={order.deliveryStatus} kind="delivery" />
          </div>
        </div>

        {/* PIX */}
        {order.paymentStatus === "pending" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mt-8 rounded-xl border bg-card p-6"
          >
            <div className="flex items-center gap-2">
              <QrCode className="size-5 text-primary" />
              <h2 className="font-semibold">Pague com PIX</h2>
              {creatingPix && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>

            {order.pixQrCodeBase64 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="mt-4 flex justify-center"
              >
                <img
                  src={`data:image/png;base64,${order.pixQrCodeBase64}`}
                  alt="QR Code PIX"
                  className="size-64 rounded-xl border bg-white p-3 shadow-lg sm:size-72"
                />
              </motion.div>
            )}

            {order.pixQrCode && (
              <>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Escaneie o QR Code ou use o copia e cola:
                </p>
                <div className="mt-2 flex gap-2">
                  <code className="flex-1 truncate rounded-lg border bg-muted px-3 py-2 text-xs">
                    {order.pixQrCode}
                  </code>
                  <Button variant="secondary" onClick={copyPix}>
                    <Copy className="mr-2 size-4" /> Copiar
                  </Button>
                </div>
              </>
            )}

            {!order.pixQrCode && !creatingPix && (
              <Button
                className="mt-4 w-full"
                onClick={async () => {
                  setCreatingPix(true);
                  setPixFailed(false);
                  try {
                    await createPix({ orderId: order._id as any });
                  } catch (e) {
                    setPixFailed(true);
                    toast.error(e instanceof Error ? e.message : "Erro ao gerar PIX");
                  } finally {
                    setCreatingPix(false);
                  }
                }}
              >
                <CreditCard className="mr-2 size-4" /> Gerar QR Code PIX
              </Button>
            )}

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Aguardando confirmação do pagamento…
            </p>
          </motion.div>
        )}

        {/* O que você recebeu (entregas automáticas) */}
        {order.paymentStatus === "paid" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mt-8"
          >
            <DeliveriesList number={order.number} token={token || undefined} variant="guest" />
          </motion.div>
        )}

        {/* Entrega */}
        {order.paymentStatus === "paid" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center"
          >
            {order.deliveryStatus === "delivered" ? (
              <>
                <CheckCheck className="mx-auto size-8 text-emerald-600" />
                <p className="mt-2 font-semibold">Entrega concluída!</p>
                <p className="text-sm text-muted-foreground">
                  Confira seus produtos. Em caso de problemas, contate o suporte.
                </p>
              </>
            ) : (
              <>
                <PackageCheck className="mx-auto size-8 text-primary" />
                <p className="mt-2 font-semibold">Pagamento confirmado</p>
                <p className="text-sm text-muted-foreground">
                  Sua entrega está sendo processada automaticamente. Atualize esta página em instantes.
                </p>
              </>
            )}
          </motion.div>
        )}

        {/* Resumo */}
        <div className="mt-8 rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Resumo do pedido</h2>
          <div className="mt-4 space-y-2 text-sm">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  {item.quantity}× {item.name}
                  {item.variantName ? ` — ${item.variantName}` : ""}
                </span>
                <span className="font-medium">{formatBRL(item.totalCents)}</span>
              </div>
            ))}
            <Separator className="my-2" />
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{formatBRL(order.subtotalCents)}</span>
            </div>
            {order.discountCents > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Desconto</span><span>−{formatBRL(order.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>Total</span><span>{formatBRL(order.totalCents)}</span>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>Cliente: <span className="text-foreground">{order.customerName}</span></p>
            <p>E-mail: <span className="text-foreground">{order.customerEmail}</span></p>
            <p>Criado em: <span className="text-foreground">{formatDate(order.createdAt)}</span></p>
            {order.paidAt && <p>Pago em: <span className="text-foreground">{formatDate(order.paidAt)}</span></p>}
          </div>
        </div>

        {/* Histórico */}
        <div className="mt-8 rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Histórico</h2>
          <ol className="mt-4 space-y-3">
            {order.statusHistory.map((h, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="font-medium">{h.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(h.at)}{h.note ? ` · ${h.note}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 text-center">
          <Button variant="outline" asChild><Link to="/loja">Continuar comprando</Link></Button>
        </div>
      </div>
    </StoreLayout>
  );
}
