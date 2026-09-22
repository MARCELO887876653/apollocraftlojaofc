import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { formatBRL, formatDate, PAYMENT_STATUS_COLOR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { DollarSign, ShoppingCart, Users, Package, Truck, AlertTriangle } from "lucide-react";

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

export default function AdminDashboard() {
  const stats = useQuery(api.stats.dashboard) as Stats | undefined;

  if (!stats) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  }

  const cards = [
    { label: "Receita hoje", value: formatBRL(stats.revenueToday), icon: DollarSign },
    { label: "Receita 30 dias", value: formatBRL(stats.revenue30), icon: DollarSign },
    { label: "Receita total", value: formatBRL(stats.revenueTotal), icon: DollarSign },
    { label: "Pedidos", value: `${stats.ordersPaid} pagos / ${stats.ordersTotal}`, icon: ShoppingCart },
    { label: "Clientes", value: String(stats.customersTotal), icon: Users },
    { label: "Produtos", value: String(stats.productsTotal), icon: Package },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da loja</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(stats.deliveriesFailed > 0 || stats.ordersPending > 0) && (
        <div className="flex flex-wrap gap-3">
          {stats.ordersPending > 0 && (
            <Link
              to="/painel/pedidos?status=pending"
              className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-700"
            >
              <Truck className="size-4" /> {stats.ordersPending} pedidos aguardando pagamento
            </Link>
          )}
          {stats.deliveriesFailed > 0 && (
            <Link
              to="/painel/entregas?status=failed"
              className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-700"
            >
              <AlertTriangle className="size-4" /> {stats.deliveriesFailed} entregas com falha
            </Link>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receita dos últimos 14 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.series}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(262 83% 58%)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(262 83% 58%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  formatter={(v: number) => formatBRL(Math.round(v * 100))}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(262 83% 58%)" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pedidos recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentOrders.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
            )}
            {stats.recentOrders.map((o) => (
              <div key={o._id} className="flex items-center justify-between text-sm">
                <div>
                  <Link to={`/painel/pedidos/${o._id}`} className="font-medium hover:text-primary">
                    {o.number}
                  </Link>
                  <p className="text-xs text-muted-foreground">{o.customerEmail}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatBRL(o.totalCents)}</p>
                  <Badge variant="outline" className={PAYMENT_STATUS_COLOR[o.paymentStatus]}>
                    {o.paymentStatus === "paid" ? "Pago" : o.paymentStatus === "pending" ? "Pendente" : o.paymentStatus}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top produtos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topProducts.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem vendas ainda.</p>
            )}
            {stats.topProducts.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">
                  {p.qty} un · {formatBRL(Math.round(p.revenue * 100))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
