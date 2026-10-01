import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { formatBRL, formatRelative } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ChartPie, Clock, ArrowRight, TrendingDown, TrendingUp, Wallet, Receipt,
  AlertTriangle, Eye,
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
  monthSeries: Array<{ day: string; revenue: number; orders: number }>;
  monthRevenue: number;
  monthOrders: number;
  monthTrend: number | null;
  visitsWeek: Array<{ day: string; count: number }>;
  visitsThisWeek: number;
  visitsTotal: number;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  recentOrders: Array<{
    _id: string; number: string; customerName: string; customerEmail: string;
    totalCents: number; paymentStatus: string; createdAt: number;
  }>;
};

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  fontSize: 12,
} as const;

function KpiCard({
  icon: Icon,
  label,
  value,
  footer,
  tileClass,
}: {
  icon: typeof ChartPie;
  label: string;
  value: string;
  footer: string;
  tileClass: string;
}) {
  return (
    <Card className="gap-0 rounded-2xl py-0 shadow-none">
      <CardContent className="flex flex-col gap-4 p-5">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-2xl border border-border/60",
            tileClass,
          )}
        >
          <Icon className="size-7" strokeWidth={2.2} />
        </span>
        <div>
          <p className="text-[15px] text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-[28px] font-bold leading-tight tracking-tight">{value}</p>
        </div>
        <div className="mt-1 flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
          <Clock className="size-4" /> {footer}
        </div>
      </CardContent>
    </Card>
  );
}

function Skeletons() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-muted/60" />
      <div className="h-56 animate-pulse rounded-2xl bg-muted/60" />
    </div>
  );
}

export default function AdminDashboard() {
  const stats = useQuery(api.stats.dashboard) as Stats | undefined;

  if (!stats) return <Skeletons />;

  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const trend = stats.monthTrend;
  const trendLabel =
    trend === null
      ? null
      : `${trend >= 0 ? "+" : ""}${trend.toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })}%`;

  return (
    <div className="space-y-4">
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

      {/* Cards de métricas — estilo CentralCart */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          icon={ChartPie}
          label="Total em vendas"
          value={formatBRL(stats.revenueTotal)}
          footer="Vendas de todo o período"
          tileClass="bg-red-500/10 text-red-400"
        />
        <KpiCard
          icon={Wallet}
          label="Vendas hoje"
          value={formatBRL(stats.revenueToday)}
          footer="Faturamento do dia"
          tileClass="bg-sky-500/10 text-sky-400"
        />
        <KpiCard
          icon={Receipt}
          label="Ticket médio"
          value={formatBRL(
            stats.ordersPaid > 0 ? Math.round(stats.revenueTotal / stats.ordersPaid) : 0,
          )}
          footer={`${stats.ordersPaid} pedidos pagos`}
          tileClass="bg-violet-500/10 text-violet-400"
        />
      </div>

      {/* Vendas do mês + tendência */}
      <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-none">
        <CardContent className="p-5 pb-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px] text-muted-foreground">
                Vendas em {monthName} ({stats.monthOrders})
              </p>
              <p className="mt-0.5 text-[28px] font-bold leading-tight tracking-tight">
                {formatBRL(stats.monthRevenue)}
              </p>
            </div>
            {trendLabel && (
              <span
                className={cn(
                  "mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold",
                  trend! >= 0
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400",
                )}
              >
                {trend! >= 0 ? (
                  <TrendingUp className="size-4" />
                ) : (
                  <TrendingDown className="size-4" />
                )}
                {trendLabel}
              </span>
            )}
          </div>
        </CardContent>
        <div className="-mx-2 h-44 pb-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.monthSeries} margin={{ top: 16, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="dashMonth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb923c" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#fb923c" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" hide />
              <YAxis hide />
              <Tooltip
                formatter={(v: number) => formatBRL(Math.round(v * 100))}
                contentStyle={tooltipStyle}
                labelStyle={{ color: "var(--muted-foreground)" }}
                cursor={{ stroke: "var(--border)" }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#fb923c"
                strokeWidth={2.5}
                fill="url(#dashMonth)"
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Visitas na loja */}
      <Card className="gap-0 rounded-2xl py-0 shadow-none">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-[15px] text-muted-foreground">
              <Eye className="size-4" /> Visitas na loja
            </p>
            <span className="text-sm text-muted-foreground">Esta semana</span>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.visitsWeek} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number) => [`${v} visitas`, ""]}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                />
                <Bar
                  dataKey="count"
                  fill="#ec4899"
                  radius={[6, 6, 6, 6]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{stats.visitsThisWeek}</span> visitas
            esta semana · <span className="font-semibold text-foreground">{stats.visitsTotal}</span>{" "}
            no total
          </p>
        </CardContent>
      </Card>

      {/* Últimos pagamentos */}
      <Card className="gap-0 rounded-2xl py-0 shadow-none">
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
      <Card className="gap-0 rounded-2xl py-0 shadow-none">
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
    </div>
  );
}
