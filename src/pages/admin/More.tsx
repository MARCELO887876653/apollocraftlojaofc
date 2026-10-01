import { NavLink } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Package, FolderTree, Ticket, Megaphone, FileText, Users, Truck, Palette,
  Settings, Plug, ScrollText, UserPlus, ChevronRight, Store, ExternalLink,
  Gem, type LucideIcon,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  perm: string;
  badge?: "novo" | "beta";
};

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Loja",
    items: [
      { to: "/painel/produtos", label: "Produtos", icon: Package, perm: "products.manage" },
      { to: "/painel/categorias", label: "Categorias", icon: FolderTree, perm: "categories.manage" },
      { to: "/painel/entregas", label: "Entregas", icon: Truck, perm: "deliveries.view" },
      { to: "/painel/clientes", label: "Clientes", icon: Users, perm: "customers.view" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { to: "/painel/cupons", label: "Cupons", icon: Ticket, perm: "coupons.manage" },
      { to: "/painel/promocoes", label: "Promoções", icon: Megaphone, perm: "products.manage", badge: "novo" },
      { to: "/painel/conteudo", label: "Postagens", icon: FileText, perm: "content.manage" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { to: "/painel/equipe", label: "Membros", icon: UserPlus, perm: "team.manage" },
      { to: "/painel/integracoes", label: "Integrações", icon: Plug, perm: "integrations.manage" },
      { to: "/painel/aparencia", label: "Aparência", icon: Palette, perm: "appearance.manage" },
      { to: "/painel/logs", label: "Auditoria", icon: ScrollText, perm: "logs.view" },
      { to: "/painel/configuracoes", label: "Configurações", icon: Settings, perm: "settings.manage" },
    ],
  },
];

/** Meta visual de faturamento exibida na barra de progresso do card da loja. */
const GOAL_CENTS = 2_000_000;

export default function AdminMore() {
  const me = useQuery(api.team.me) as
    | { user: any; admin: { name: string; email: string; role: string; permissions: string[] } | null }
    | null
    | undefined;
  const store = useQuery(api.settings.getStore) as { name?: string; logoUrl?: string } | undefined;
  const summary = useQuery(api.stats.summary) as
    | { revenueTotal: number; customersTotal: number }
    | undefined;

  const perms = me?.admin?.role === "owner" ? ["*"] : me?.admin?.permissions ?? [];
  const can = (perm: string) => perms.includes("*") || perms.includes(perm);

  const revenue = summary?.revenueTotal ?? 0;
  const progress = Math.min(100, (revenue / GOAL_CENTS) * 100);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* Card da loja */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-none">
        <div className="flex items-center gap-3 p-4">
          {store?.logoUrl ? (
            <img src={store.logoUrl} alt="" className="size-12 rounded-xl object-cover" />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-400 to-red-600">
              <Store className="size-6 text-red-950" />
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-[17px] font-bold">
            Loja - {store?.name ?? "Minha loja"}
          </p>
          <NavLink
            to="/"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Abrir loja"
          >
            <ExternalLink className="size-5" />
          </NavLink>
        </div>
        <div className="flex items-center gap-3 px-4 pb-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
            <Gem className="size-4 text-amber-500" />
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-semibold text-muted-foreground">
            R$ 20.0K
          </span>
        </div>
        <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          {formatBRL(revenue)} faturados ·{" "}
          <span className="font-semibold text-foreground">
            {summary?.customersTotal ?? 0}
          </span>{" "}
          clientes
        </div>
      </div>

      {/* Grupos de menus */}
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => can(i.perm));
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {group.title}
            </p>
            <div className="overflow-hidden rounded-2xl border bg-card shadow-none">
              {items.map((item, i) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/60",
                    i > 0 && "border-t",
                  )}
                >
                  <item.icon className="size-5 shrink-0 text-foreground" strokeWidth={2.2} />
                  <span className="flex-1 text-[15px] font-bold">{item.label}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide",
                        item.badge === "novo"
                          ? "bg-violet-500 text-white"
                          : "bg-emerald-500 text-emerald-950",
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
