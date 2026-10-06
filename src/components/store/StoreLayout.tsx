import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { api } from "@/convex/_generated/api";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { MaintenanceGate } from "@/components/store/MaintenanceGate";
import {
  ShoppingBag, ShoppingCart, Menu, X, MessageCircle, User, Check, Search, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Store = {
  name: string;
  description?: string;
  logoUrl?: string;
  discord?: string;
  whatsapp?: string;
  instagram?: string;
  maintenance?: { enabled: boolean; title: string; message: string; eta?: string };
};

type MenuItem = { label: string; url: string; newTab?: boolean };

export function StoreLayout({ children }: { children: React.ReactNode }) {
  const store = useQuery(api.settings.getStore) as Store | undefined;
  const menu = useQuery(api.settings.getMenu) as MenuItem[] | undefined;
  // A equipe (admin ativo) continua navegando durante a manutenção para poder
  // desligá-la pelo painel; clientes veem a tela de manutenção.
  // A consulta à equipe só é feita quando a loja está em manutenção: fora disso
  // a resposta seria descartada e cada página abriria uma assinatura a mais.
  const team = useQuery(
    api.team.me,
    store?.maintenance?.enabled ? {} : "skip",
  );
  const cart = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navItems = (menu ?? []).filter(Boolean);
  const storeName = store?.name ?? "Apollo Craft";

  const isMaintenance = Boolean(store?.maintenance?.enabled);
  const isStaff = Boolean(team?.admin?.active);
  if (isMaintenance && !isStaff) {
    // Enquanto a equipe ainda está sendo verificada, evita piscar a tela de
    // manutenção para quem pode desligá-la pelo painel.
    if (team === undefined) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </main>
      );
    }
    return <MaintenanceGate store={store} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header
        className={cn(
          "sticky top-0 z-40 border-b transition-all duration-300",
          scrolled
            ? "border-border/80 bg-background/85 shadow-[0_8px_30px_rgb(0,0,0,0.35)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70"
            : "border-transparent bg-background/60 backdrop-blur-md",
        )}
      >
        <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="group flex min-w-0 items-center gap-3">
            {store?.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={storeName}
                className="size-11 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/25 transition-transform group-hover:scale-105">
                <ShoppingBag className="size-5 text-sky-950" />
              </span>
            )}
            <span className="truncate text-xl font-extrabold tracking-tight">
              Loja - {storeName}
            </span>
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-500"
              title="Loja verificada"
            >
              <Check className="size-3.5 text-white" strokeWidth={3.5} />
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {(navItems.length ? navItems : [{ label: "Início", url: "/" }]).map((item, i) => (
              <a
                key={i}
                href={item.url}
                target={item.newTab ? "_blank" : undefined}
                rel={item.newTab ? "noreferrer" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  item.url.startsWith("/") && location.pathname === item.url && "text-foreground",
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              asChild
              aria-label="Minha conta"
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              <Link to="/conta">
                <User className="size-5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              asChild
              aria-label="Buscar produtos"
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              <Link to="/loja">
                <Search className="size-5" />
              </Link>
            </Button>
            <Button
              variant="white"
              size="icon-lg"
              asChild
              aria-label="Carrinho"
              className="relative rounded-2xl"
            >
              <Link to="/carrinho">
                <ShoppingCart className="size-5" />
                {cart.totalCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background ring-2 ring-background">
                    {cart.totalCount}
                  </span>
                )}
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="border-t bg-background/95 px-4 py-2 backdrop-blur-xl md:hidden">
            {(navItems.length ? navItems : [{ label: "Início", url: "/" }]).map((item, i) => (
              <a
                key={i}
                href={item.url}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t bg-muted/20">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 py-14 text-center">
          {store?.logoUrl ? (
            <img src={store.logoUrl} alt={storeName} className="size-16 rounded-2xl object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/25">
              <ShoppingBag className="size-7 text-sky-950" />
            </span>
          )}
          <p className="text-2xl font-extrabold tracking-tight sm:text-3xl">Loja - {storeName}</p>
          <p className="max-w-md text-sm text-muted-foreground sm:text-base">
            {store?.description ??
              "Evolua o mais rápido possível com nossos kits exclusivos da nossa loja!"}
          </p>
          <div className="flex flex-col items-center gap-2.5 pt-2">
            <p className="text-lg font-extrabold">Acesse:</p>
            <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground sm:text-base">
              Página Inicial
            </Link>
            <Link to="/loja" className="text-sm text-muted-foreground transition-colors hover:text-foreground sm:text-base">
              Nossa Loja
            </Link>
            <Link to="/p/termos" className="text-sm text-muted-foreground transition-colors hover:text-foreground sm:text-base">
              Termos de Serviço
            </Link>
            <Link to="/blog" className="text-sm text-muted-foreground transition-colors hover:text-foreground sm:text-base">
              Blog
            </Link>
            <Link to="/conta" className="text-sm text-muted-foreground transition-colors hover:text-foreground sm:text-base">
              Minha Conta
            </Link>
            <Link to="/painel" className="text-sm text-muted-foreground transition-colors hover:text-foreground sm:text-base">
              Painel Admin
            </Link>
          </div>
          <div className="flex items-center gap-4 pt-1">
            {store?.discord && (
              <a
                href={store.discord}
                target="_blank"
                rel="noreferrer"
                aria-label="Discord"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <MessageCircle className="size-5" />
              </a>
            )}
            {store?.whatsapp && (
              <a
                href={store.whatsapp}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <ShoppingBag className="size-5" />
              </a>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Copyright © {new Date().getFullYear()} Loja - {storeName}. Todos os direitos
            reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
