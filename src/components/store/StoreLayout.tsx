import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { api } from "@/convex/_generated/api";
import { useCart } from "@/lib/cart";
import { ShoppingBag, ShoppingCart, Menu, X, Zap, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Store = {
  name: string;
  description?: string;
  logoUrl?: string;
  discord?: string;
  whatsapp?: string;
  instagram?: string;
};

type MenuItem = { label: string; url: string; newTab?: boolean };

export function StoreLayout({ children }: { children: React.ReactNode }) {
  const store = useQuery(api.settings.getStore) as Store | undefined;
  const menu = useQuery(api.settings.getMenu) as MenuItem[] | undefined;
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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header
        className={cn(
          "sticky top-0 z-40 border-b transition-all duration-300",
          scrolled
            ? "border-border/80 bg-background/85 shadow-[0_8px_30px_rgb(0,0,0,0.25)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70"
            : "border-transparent bg-background/60 backdrop-blur-md",
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="group flex items-center gap-2.5">
            {store?.logoUrl ? (
              <img src={store.logoUrl} alt={store.name} className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-500 shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
                <ShoppingBag className="size-4.5 text-primary-foreground" />
              </span>
            )}
            <span className="text-lg font-extrabold tracking-tight">
              {store?.name ?? "ApolloCraft"}
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
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
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link to="/painel">Painel</Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              asChild
              aria-label="Carrinho"
              className="relative border-border/80"
            >
              <Link to="/carrinho">
                <ShoppingCart className="size-4" />
                {cart.totalCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md shadow-primary/40">
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

      <footer className="relative mt-auto border-t bg-muted/20">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-14 text-center">
          {store?.logoUrl ? (
            <img src={store.logoUrl} alt={store.name} className="size-14 rounded-xl object-cover" />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-500 shadow-lg shadow-primary/25">
              <ShoppingBag className="size-6 text-primary-foreground" />
            </span>
          )}
          <p className="text-2xl font-extrabold tracking-tight">{store?.name ?? "ApolloCraft"}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {store?.description ?? "Evolua o mais rápido possível com nossos kits exclusivos da nossa loja!"}
          </p>
          <div className="flex flex-col items-center gap-2.5">
            <p className="font-bold">Acesse:</p>
            <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Página Inicial</Link>
            <Link to="/loja" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Nossa Loja</Link>
            <Link to="/p/termos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Termos de Serviço</Link>
            <Link to="/blog" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Blog</Link>
            <Link to="/painel" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Painel Admin</Link>
          </div>
          <div className="flex items-center gap-4 pt-1">
            {store?.discord && (
              <a href={store.discord} target="_blank" rel="noreferrer" aria-label="Discord" className="text-muted-foreground transition-colors hover:text-foreground">
                <MessageCircle className="size-5" />
              </a>
            )}
            {store?.whatsapp && (
              <a href={store.whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="text-muted-foreground transition-colors hover:text-foreground">
                <Zap className="size-5" />
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {store?.name ?? "ApolloCraft"} · Todos os direitos reservados
          </p>
        </div>
      </footer>
    </div>
  );
}
