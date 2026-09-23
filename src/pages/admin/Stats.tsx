import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatBRL } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { DollarSign, Users, Receipt, TrendingUp } from "lucide-react";

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
  recentOrders: any[];
};

export default function AdminStats() {
  const stats = useQuery(api.stats.dashboard) as Stats | undefined;

  if (!stats) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  }

  const avgTicket = stats.ordersPaid > 0 ? stats.revenueTotal / stats.ordersPaid : 0;

  const cards = [
    { label: "Total em vendas", value: formatBRL(stats.revenueTotal), icon: DollarSign, sub: "Todo o período" },
    { label: "Últimos 30 dias", value: formatBRL(stats.revenue30), icon: TrendingUp, sub: "Receita do mês" },
    { label: "Ticket médio", value: formatBRL(Math.round(avgTicket)), icon: Receipt, sub: "Por pedido pago" },
    { label: "Clientes", value: String(stats.customersTotal), icon: Users, sub: "Compradores únicos" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Estatísticas</h1>
        <p className="text-sm text-muted-foreground">Desempenho da loja</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-extrabold tracking-tight">{c.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendas nos últimos 14 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.series}>
                <defs>
                  <linearGradient id="statRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  formatter={(v: number) => formatBRL(Math.round(v * 100))}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)" }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#f59e0b" fill="url(#statRev)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.series}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)" }}
                />
                <Bar dataKey="orders" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
          {stats.topProducts.map((p, i) => (
            <div key={p.name} className="flex items-center justify-between text-sm">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="truncate font-medium">{p.name}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                {p.qty} un · {formatBRL(Math.round(p.revenue * 100))}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
