import { useMutation, useQuery } from "convex/react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  LayoutDashboard, Package, FolderTree, ShoppingCart, Ticket, Users, Truck,
  FileText, Palette, Settings, Plug, ShieldCheck, ScrollText, Store, LogOut, Loader2,
} from "lucide-react";

const NAV = [
  { to: "/painel", label: "Dashboard", icon: LayoutDashboard, perm: "orders.view", end: true },
  { to: "/painel/pedidos", label: "Pedidos", icon: ShoppingCart, perm: "orders.view" },
  { to: "/painel/produtos", label: "Produtos", icon: Package, perm: "products.manage" },
  { to: "/painel/categorias", label: "Categorias", icon: FolderTree, perm: "categories.manage" },
  { to: "/painel/cupons", label: "Cupons", icon: Ticket, perm: "coupons.manage" },
  { to: "/painel/clientes", label: "Clientes", icon: Users, perm: "customers.view" },
  { to: "/painel/entregas", label: "Entregas", icon: Truck, perm: "deliveries.view" },
  { to: "/painel/conteudo", label: "Conteúdo", icon: FileText, perm: "content.manage" },
  { to: "/painel/aparencia", label: "Aparência", icon: Palette, perm: "appearance.manage" },
  { to: "/painel/integracoes", label: "Integrações", icon: Plug, perm: "integrations.manage" },
  { to: "/painel/equipe", label: "Equipe", icon: ShieldCheck, perm: "team.manage" },
  { to: "/painel/logs", label: "Auditoria", icon: ScrollText, perm: "logs.view" },
  { to: "/painel/configuracoes", label: "Configurações", icon: Settings, perm: "settings.manage" },
];

function AdminShell() {
  const me = useQuery(api.team.me) as
    | { user: any; admin: { name: string; email: string; role: string; permissions: string[] } | null }
    | null
    | undefined;
  const navigate = useNavigate();

  if (me === undefined || me === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!me.admin) {
    return <NoAccess email={me.user?.email} />;
  }

  const perms = me.admin.role === "owner" ? ["*"] : me.admin.permissions;
  const can = (perm: string) => perms.includes("*") || perms.includes(perm);
  const items = NAV.filter((n) => can(n.perm));

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <Store className="size-5 text-primary" />
          <div>
            <p className="text-sm font-bold leading-tight">{me.admin.name}</p>
            <p className="text-[11px] capitalize text-muted-foreground">{me.admin.role}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "hover:bg-accent hover:text-foreground",
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/")}>
            <Store className="mr-3 size-4" /> Ver loja
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen w-full flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-6 backdrop-blur lg:hidden">
          <Store className="size-5 text-primary" />
          <span className="font-bold">Painel</span>
        </header>
        <div className="lg:hidden">
          <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <RequireAuth>
      <AdminShell />
    </RequireAuth>
  );
}

/** Tela de acesso negado — com bootstrap do primeiro owner quando nenhum admin existe. */
function NoAccess({ email }: { email?: string }) {
  const navigate = useNavigate();
  const [claiming, setClaiming] = useState(false);
  const claimOwnership = useMutation(api.team.claimOwnership);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await claimOwnership({});
      if (res.claimed) {
        toast.success("Você agora é o owner da loja!");
      } else {
        toast.error(
          res.reason === "already-exists"
            ? "A loja já possui um administrador. Solicite acesso a ele."
            : "Não foi possível reivindicar o acesso.",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <ShieldCheck className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta ({email ?? "sem e-mail"}) não faz parte da equipe administrativa.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button onClick={claim} disabled={claiming}>
            <ShieldCheck className="mr-2 size-4" />
            {claiming ? "Verificando..." : "Sou o dono da loja — reivindicar acesso"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            <Store className="mr-2 size-4" /> Ir para a loja
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          “Reivindicar acesso” funciona apenas quando a loja ainda não tem nenhum administrador
          (primeiro acesso). Depois, apenas o owner convida a equipe pelo painel → Equipe.
        </p>
      </div>
    </div>
  );
}
