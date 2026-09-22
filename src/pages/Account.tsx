import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { StoreLayout } from "@/components/store/StoreLayout";
import { DeliveriesList } from "@/components/store/DeliveriesList";
import { formatBRL, formatDate, PAYMENT_STATUS_LABEL, DELIVERY_STATUS_LABEL, DELIVERY_TYPE_LABEL } from "@/lib/format";
import { PAYMENT_STATUS_COLOR, DELIVERY_STATUS_COLOR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Package, Clock, CheckCircle2, XCircle, User, ShoppingBag,
} from "lucide-react";

type Order = {
  _id: string;
  number: string;
  items: Array<{ name: string; variantName?: string; quantity: number; totalCents: number; image?: string }>;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: number;
  paidAt?: number;
  minecraftNick?: string;
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  paid: <CheckCircle2 className="size-5 text-emerald-600" />,
  delivered: <CheckCircle2 className="size-5 text-emerald-600" />,
  pending: <Clock className="size-5 text-yellow-600" />,
  processing: <Loader2 className="size-5 animate-spin text-sky-600" />,
  cancelled: <XCircle className="size-5 text-zinc-500" />,
  expired: <XCircle className="size-5 text-orange-600" />,
  refunded: <XCircle className="size-5 text-sky-600" />,
  failed: <XCircle className="size-5 text-red-600" />,
};

function StatusBadge({ status, kind }: { status: string; kind: "payment" | "delivery" }) {
  const label = kind === "payment" ? PAYMENT_STATUS_LABEL[status] ?? status : DELIVERY_STATUS_LABEL[status] ?? status;
  const color = kind === "payment" ? PAYMENT_STATUS_COLOR[status] : DELIVERY_STATUS_COLOR[status];
  return (
    <Badge variant="outline" className={color ?? ""}>
      {label}
    </Badge>
  );
}

export default function AccountPage() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const orders = useQuery(api.orders.myOrders) as Order[] | null | undefined;

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        </div>
      </StoreLayout>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <StoreLayout>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <User className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Entre para ver seus pedidos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Faça login com seu e-mail para acompanhar compras, pagamentos e o que você recebeu.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link to="/auth?returnTo=%2Fconta">Entrar</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/loja">Ver a loja</Link>
            </Button>
          </div>
        </div>
      </StoreLayout>
    );
  }

  const email = user.email ?? "";
  const list = orders === undefined || orders === null ? [] : orders;
  const paidOrders = list.filter((o) => o.paymentStatus === "paid");
  const totalSpent = paidOrders.reduce((acc, o) => acc + o.totalCents, 0);

  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-500 text-xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
            {(user.name ?? email).slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">
              {user.name ?? email.split("@")[0]}
            </h1>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/loja">
              <ShoppingBag className="mr-2 size-4" /> Loja
            </Link>
          </Button>
        </div>

        {/* Métricas */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Pedidos</p>
            <p className="mt-1 text-2xl font-bold">{list.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Pagos</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{paidOrders.length}</p>
          </div>
          <div className="col-span-2 rounded-xl border bg-card p-4 sm:col-span-1">
            <p className="text-xs text-muted-foreground">Total gasto</p>
            <p className="mt-1 text-2xl font-bold">{formatBRL(totalSpent)}</p>
          </div>
        </div>

        {/* Histórico */}
        <h2 className="mt-8 flex items-center gap-2 text-lg font-bold">
          <Package className="size-5 text-primary" /> Histórico de pedidos
        </h2>

        {orders === undefined && (
          <div className="mt-4 py-10 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {orders !== undefined && orders !== null && orders.length === 0 && (
          <div className="mt-4 rounded-xl border bg-card p-10 text-center">
            <Package className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 font-medium">Você ainda não fez nenhum pedido</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Dica: use o mesmo e-mail no checkout para vincular suas compras aqui.
            </p>
            <Button className="mt-5" asChild>
              <Link to="/loja">Explorar produtos</Link>
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {list.map((order) => (
            <div key={order._id} className="rounded-xl border bg-card">
              {/* Linha principal */}
              <div className="flex flex-wrap items-center gap-3 p-4">
                {STATUS_ICONS[order.paymentStatus]}
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/pedido/${order.number}`}
                    className="font-semibold hover:underline"
                  >
                    Pedido {order.number}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={order.paymentStatus} kind="payment" />
                  <StatusBadge status={order.deliveryStatus} kind="delivery" />
                  <span className="font-bold">{formatBRL(order.totalCents)}</span>
                </div>
              </div>

              {/* Itens */}
              <div className="space-y-1.5 border-t px-4 py-3 text-sm">
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {item.quantity}× {item.name}
                      {item.variantName ? ` — ${item.variantName}` : ""}
                    </span>
                    <span className="shrink-0 font-medium">{formatBRL(item.totalCents)}</span>
                  </div>
                ))}
              </div>

              {/* O que recebeu */}
              <div className="border-t p-3">
                <DeliveriesList number={order.number} collapsible />
              </div>
            </div>
          ))}
        </div>

        {orders !== undefined && orders !== null && orders.length > 0 && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Comprando com o e-mail <span className="font-medium">{email}</span> suas compras aparecem aqui automaticamente.
          </p>
        )}

        <Separator className="my-8" />
        <p className="text-center text-xs text-muted-foreground">
          Precisa de ajuda com algum pedido? Fale com o suporte da loja.
        </p>
      </div>
    </StoreLayout>
  );
}
