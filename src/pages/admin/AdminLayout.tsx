import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  LayoutDashboard, Package, FolderTree, ShoppingCart, Ticket, Users, Truck,
  FileText, Palette, Settings, Plug, ShieldCheck, ScrollText, Store, Loader2,
  Home, BarChart3, MoreHorizontal, Megaphone, Bell, ExternalLink, UserPlus, Zap,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Package;
  perm: string;
  end?: boolean;
  badge?: "novo" | "beta";
  /** aparece no menu "Mais" (mobile) e/ou na sidebar (desktop) */
  more?: boolean;
};

const NAV: NavItem[] = [
  { to: "/painel", label: "Dashboard", icon: LayoutDashboard, perm: "orders.view", end: true },
  { to: "/painel/pedidos", label: "Pedidos", icon: ShoppingCart, perm: "orders.view", more: true },
  { to: "/painel/produtos", label: "Produtos", icon: Package, perm: "products.manage" },
  { to: "/painel/categorias", label: "Categorias", icon: FolderTree, perm: "categories.manage", more: true },
  { to: "/painel/cupons", label: "Cupons", icon: Ticket, perm: "coupons.manage", more: true },
  { to: "/painel/promocoes", label: "Promoções", icon: Megaphone, perm: "products.manage", more: true, badge: "novo" },
  { to: "/painel/entregas", label: "Entregas", icon: Truck, perm: "deliveries.view", more: true },
  { to: "/painel/entregas-auto", label: "Entregas automáticas", icon: Zap, perm: "deliveries.view", more: true },
  { to: "/painel/api-logs", label: "Logs da API", icon: ScrollText, perm: "logs.view", more: true },
  { to: "/painel/conteudo", label: "Postagens", icon: FileText, perm: "content.manage", more: true },
  { to: "/painel/clientes", label: "Clientes", icon: Users, perm: "customers.view", more: true },
  { to: "/painel/equipe", label: "Membros", icon: UserPlus, perm: "team.manage", more: true },
  { to: "/painel/integracoes", label: "Integrações", icon: Plug, perm: "integrations.manage", more: true },
  { to: "/painel/aparencia", label: "Aparência", icon: Palette, perm: "appearance.manage", more: true },
  { to: "/painel/logs", label: "Auditoria", icon: ScrollText, perm: "logs.view", more: true },
  { to: "/painel/configuracoes", label: "Configurações", icon: Settings, perm: "settings.manage", more: true },
];

/** Abas fixas do rodapé mobile (ordem do CentralCart). */
const TABS = [
  { to: "/painel", label: "Dashboard", icon: Home, end: true, perm: "orders.view" },
  { to: "/painel/produtos", label: "Produtos", icon: Package, perm: "products.manage" },
  { to: "/painel/pedidos", label: "Pedidos", icon: ShoppingCart, perm: "orders.view" },
  { to: "/painel/stats", label: "Estatísticas", icon: BarChart3, perm: "orders.view" },
  { to: "/painel/mais", label: "Mais", icon: MoreHorizontal, perm: "*" },
];

type TeamUser = { email?: string; name?: string; isAnonymous?: boolean } | null;

function AdminShell() {
  const me = useQuery(api.team.me) as
    | { user: TeamUser; admin: { name: string; email: string; role: string; permissions: string[] } | null }
    | null
    | undefined;
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stuck, setStuck] = useState(false);

  // Uma consulta que nunca responde (conexão/autenticação travada) não pode
  // deixar o painel girando para sempre: depois de alguns segundos mostramos
  // um estado com ação em vez do spinner infinito.
  useEffect(() => {
    if (me !== undefined) {
      setStuck(false);
      return;
    }
    const timer = setTimeout(() => setStuck(true), 12000);
    return () => clearTimeout(timer);
  }, [me]);

  if (me === undefined) {
    if (stuck) return <SessionUnknown retry />;
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // `null` = o servidor não reconheceu a sessão (token expirado/revogado ou
  // conta que não existe mais). Antes isso caía no mesmo spinner do "carregando"
  // e o painel ficava carregando para sempre.
  if (me === null) return <SessionUnknown />;

  if (!me.admin) {
    return <NoAccess user={me.user} />;
  }

  const perms = me.admin.role === "owner" ? ["*"] : me.admin.permissions;
  const can = (perm: string) => perms.includes("*") || perms.includes(perm);
  const items = NAV.filter((n) => can(n.perm));
  const tabs = TABS.filter((t) => t.label === "Mais" || can(t.perm));
  const moreItems = items.filter((n) => n.more);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b px-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/25">
            <Store className="size-4.5 text-sky-950" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{me.admin.name}</p>
            <p className="text-[11px] capitalize text-muted-foreground">{me.admin.role}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
              {item.badge && (
                <span
                  className={cn(
                    "ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase",
                    item.badge === "novo" ? "bg-violet-500 text-white" : "bg-emerald-500 text-emerald-950",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/")}>
            <Store className="mr-3 size-4" /> Ver loja
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen w-full flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <button
            className="flex items-center gap-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/25">
              <Store className="size-4.5 text-sky-950" />
            </span>
            <span className="text-base font-extrabold tracking-tight">apollocraft</span>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" asChild aria-label="Ver loja" className="hidden sm:inline-flex">
              <Link to="/">
                <ExternalLink className="size-4.5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" aria-label="Notificações">
              <Bell className="size-4.5" />
            </Button>
            <span className="flex size-10 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
              {me.admin.name?.charAt(0).toUpperCase() || "A"}
            </span>
          </div>
        </header>

        {/* Drawer mobile */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r bg-sidebar shadow-2xl">
              <div className="flex h-16 items-center gap-2.5 border-b px-5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600">
                  <Store className="size-4.5 text-sky-950" />
                </span>
                <p className="truncate text-sm font-bold">{me.admin.name}</p>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                        isActive ? "bg-primary/15 text-primary" : "text-muted-foreground",
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
            </div>
          </div>
        )}

        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          <Outlet />
        </main>

        {/* Bottom tab bar (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          <div className="flex h-[68px] items-stretch">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                    isActive
                      ? "font-bold text-primary"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <t.icon className={cn("size-5", isActive && "text-primary")} strokeWidth={isActive ? 2.4 : 2} />
                    {t.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
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

/**
 * Sessão que o servidor não reconhece. Oferece entrar novamente limpando a
 * sessão local — sem isso a única saída era apagar os dados do site no
 * navegador.
 */
function SessionUnknown({ retry }: { retry?: boolean }) {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const [busy, setBusy] = useState(false);

  const signInAgain = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch {
      // Mesmo que a limpeza da sessão falhe, seguimos para a tela de login.
    }
    navigate("/auth?returnTo=%2Fpainel");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <ShieldCheck className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Sessão não reconhecida</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {retry
            ? "O painel não conseguiu falar com o servidor. Confira sua conexão e tente novamente."
            : "Sua sessão de acesso ao painel expirou ou não é mais válida. Entre novamente para continuar."}
        </p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button onClick={() => void signInAgain()} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 size-4" />
            )}
            Entrar novamente
          </Button>
          {retry && (
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Recarregar página
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate("/")}>
            <Store className="mr-2 size-4" /> Ir para a loja
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Tela de acesso negado — com bootstrap do primeiro owner quando nenhum admin existe. */
function NoAccess({ user }: { user?: TeamUser }) {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const [claiming, setClaiming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const claimOwnership = useMutation(api.team.claimOwnership);
  const isGuest = user?.isAnonymous === true;
  const email = user?.email;

  const enterWithEmail = async () => {
    setSwitching(true);
    try {
      await signOut();
    } catch {
      // Mesmo que a limpeza da sessão falhe, seguimos para a tela de login.
    }
    navigate("/auth?returnTo=%2Fpainel");
  };

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

  if (isGuest) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <ShieldCheck className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold">Painel administrativo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você está em uma <strong className="text-foreground">conta de visitante</strong> — ela
            não tem e-mail e por isso não pode fazer parte da equipe administrativa. Entre com o
            e-mail do administrador para acessar o painel.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button onClick={() => void enterWithEmail()} disabled={switching}>
              {switching ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 size-4" />
              )}
              Entrar com e-mail
            </Button>
            <Button variant="ghost" onClick={() => navigate("/")}>
              <Store className="mr-2 size-4" /> Ir para a loja
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
          <Button variant="outline" onClick={() => void enterWithEmail()} disabled={switching}>
            {switching && <Loader2 className="mr-2 size-4 animate-spin" />}
            Entrar com outro e-mail
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
