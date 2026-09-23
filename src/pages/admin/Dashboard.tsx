import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { formatBRL, formatRelative, PAYMENT_STATUS_COLOR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  BarChart3, DollarSign, Truck, AlertTriangle, Clock, ArrowRight, TrendingDown,
} from "lucide-react";

type Stats = {
  revenueToday: number;
  revenue30: number;
  revenueTotal: number;
  ordersTotal: number;
  ordersPaid: number;
  ordersPending: number;
  customersTotal: number;
  productsTotal: number;
  deliveriesPending: number;
  deliveriesFailed: number;
  series: Array<{ day: string; revenue: number; orders: number }>;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  recentOrders: Array<{
    _id: string; number: string; customerName: string; customerEmail: string;
    totalCents: number; paymentStatus: string; createdAt: number;
  }>;
};

function StatCard({
  icon: Icon,
  label,
  value,
  footer,
  iconClass,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  footer: string;
  iconClass: string;
}) {
  return (
    <Card className="gap-0 rounded-2xl py-0">
      <CardContent className="flex flex-col gap-4 p-5">
        <span className={cn("flex size-12 items-center justify-center rounded-xl", iconClass)}>
          <Icon className="size-6" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-3xl font-extrabold tracking-tight">{value}</p>
        </div>
        <div className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
          <Clock className="size-4" /> {footer}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const stats = useQuery(api.stats.dashboard) as Stats | undefined;

  if (!stats) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  }

  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div className="space-y-6">
      {(stats.deliveriesFailed > 0 || stats.ordersPending > 0) && (
        <div className="flex flex-wrap gap-3">
          {stats.ordersPending > 0 && (
            <Link
              to="/painel/pedidos?status=pending"
              className="flex items-center gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400"
            >
              <Clock className="size-4" /> {stats.ordersPending} pedidos aguardando pagamento
            </Link>
          )}
          {stats.deliveriesFailed > 0 && (
            <Link
              to="/painel/entregas?status=failed"
              className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400"
            >
              <AlertTriangle className="size-4" /> {stats.deliveriesFailed} entregas com falha
            </Link>
          )}
        </div>
      )}

      {/* Cards de métricas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={BarChart3}
          label="Vendas hoje"
          value={formatBRL(stats.revenueToday)}
          footer="Hoje"
          iconClass="bg-violet-500/15 text-violet-500"
        />
        <StatCard
          icon={DollarSign}
          label="Total em vendas"
          value={formatBRL(stats.revenueTotal)}
          footer="Vendas de todo o período"
          iconClass="bg-emerald-500/15 text-emerald-500"
        />
        <StatCard
          icon={Truck}
          label={`Vendas em ${monthName}`}
          value={`${stats.ordersPaid}`}
          footer={`${stats.ordersTotal} pedidos no total`}
          iconClass="bg-sky-500/15 text-sky-500"
        />
      </div>

      {/* Gráfico de vendas do mês */}
      <Card className="gap-0 rounded-2xl py-0">
        <CardContent className="p-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Vendas em {monthName}</p>
              <p className="text-3xl font-extrabold tracking-tight">{formatBRL(stats.revenue30)}</p>
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="dashRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  formatter={(v: number) => formatBRL(Math.round(v * 100))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#f59e0b" fill="url(#dashRev)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Últimos pagamentos */}
      <Card className="gap-0 rounded-2xl py-0">
        <CardContent className="p-0">
          <p className="px-5 pb-2 pt-5 text-sm font-semibold text-muted-foreground">
            Últimos pagamentos
          </p>
          <div>
            {stats.recentOrders.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nenhum pedido ainda.
              </p>
            )}
            {stats.recentOrders.map((o, i) => (
              <Link
                key={o._id}
                to={`/painel/pedidos/${o._id}`}
                className={cn(
                  "flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/60",
                  i > 0 && "border-t",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold uppercase text-muted-foreground">
                  {(o.customerName || o.customerEmail || "?").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{o.customerName || o.customerEmail}</p>
                  <p className="truncate text-sm text-muted-foreground">#{o.number}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-emerald-500">+ {formatBRL(o.totalCents)}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(o.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
          <Link
            to="/painel/pedidos"
            className="flex items-center justify-between border-t px-5 py-4 text-sm font-semibold transition-colors hover:bg-accent/60"
          >
            Ver todos os pagamentos <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      {/* Top produtos */}
      <Card className="gap-0 rounded-2xl py-0">
        <CardContent className="p-5">
          <p className="pb-3 text-sm font-semibold text-muted-foreground">Top produtos</p>
          {stats.topProducts.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">Sem vendas ainda.</p>
          )}
          <div className="space-y-3">
            {stats.topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {p.qty} un · {formatBRL(Math.round(p.revenue * 100))}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Aviso de pedidos pendentes / badges auxiliares */}
      {stats.ordersPending > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <TrendingDown className="size-3.5" /> Há pedidos aguardando confirmação de pagamento.
          <Badge variant="outline" className={cn("ml-1", PAYMENT_STATUS_COLOR.pending)}>pendente</Badge>
        </p>
      )}
    </div>
  );
}
