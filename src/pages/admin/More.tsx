import { NavLink } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Package, FolderTree, ShoppingCart, Ticket, Users, Truck,
  FileText, Palette, Settings, Plug, ScrollText, Megaphone, UserPlus,
  ChevronRight, Store, ExternalLink,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Package;
  perm: string;
  end?: boolean;
  badge?: "novo" | "beta";
  more?: boolean;
};

const NAV: NavItem[] = [
  { to: "/painel", label: "Dashboard", icon: LayoutDashboard, perm: "orders.view", end: true },
  { to: "/painel/produtos", label: "Produtos", icon: Package, perm: "products.manage" },
  { to: "/painel/pedidos", label: "Pedidos", icon: ShoppingCart, perm: "orders.view" },
  { to: "/painel/categorias", label: "Categorias", icon: FolderTree, perm: "categories.manage" },
  { to: "/painel/cupons", label: "Cupons", icon: Ticket, perm: "coupons.manage" },
  { to: "/painel/promocoes", label: "Promoções", icon: Megaphone, perm: "products.manage", badge: "novo" },
  { to: "/painel/entregas", label: "Entregas", icon: Truck, perm: "deliveries.view" },
  { to: "/painel/conteudo", label: "Postagens", icon: FileText, perm: "content.manage" },
  { to: "/painel/clientes", label: "Clientes", icon: Users, perm: "customers.view" },
  { to: "/painel/equipe", label: "Membros", icon: UserPlus, perm: "team.manage" },
  { to: "/painel/integracoes", label: "Integrações", icon: Plug, perm: "integrations.manage" },
  { to: "/painel/aparencia", label: "Aparência", icon: Palette, perm: "appearance.manage" },
  { to: "/painel/logs", label: "Auditoria", icon: ScrollText, perm: "logs.view" },
  { to: "/painel/configuracoes", label: "Configurações", icon: Settings, perm: "settings.manage" },
];

export default function AdminMore() {
  const me = useQuery(api.team.me) as
    | { user: any; admin: { name: string; email: string; role: string; permissions: string[] } | null }
    | null
    | undefined;
  const store = useQuery(api.settings.getStore) as { name?: string; logoUrl?: string } | undefined;

  const perms = me?.admin?.role === "owner" ? ["*"] : me?.admin?.permissions ?? [];
  const can = (perm: string) => perms.includes("*") || perms.includes(perm);
  const items = NAV.filter((n) => can(n.perm));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Card da loja */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          {store?.logoUrl ? (
            <img src={store.logoUrl} alt="" className="size-11 rounded-xl object-cover" />
          ) : (
            <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600">
              <Store className="size-5 text-emerald-950" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{store?.name ?? "Minha loja"}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {me?.admin ? `${me.admin.name} · ${me.admin.role}` : "Painel administrativo"}
            </p>
          </div>
          <NavLink to="/" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Abrir loja">
            <ExternalLink className="size-5" />
          </NavLink>
        </div>
      </div>

      {/* Lista de menus */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        {items.map((item, i) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={cn(
              "flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/60",
              i > 0 && "border-t",
            )}
          >
            <item.icon className="size-5 shrink-0 text-foreground" />
            <span className="flex-1 text-[15px] font-semibold">{item.label}</span>
            {item.badge && (
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase",
                  item.badge === "novo" ? "bg-violet-500 text-white" : "bg-emerald-500 text-emerald-950",
                )}
              >
                {item.badge}
              </span>
            )}
            <ChevronRight className="size-4 text-muted-foreground" />
          </NavLink>
        ))}
      </div>
    </div>
  );
}
