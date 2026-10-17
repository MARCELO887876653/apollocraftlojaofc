import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
  ConvexReactClient,
  useConvex,
  useConvexConnectionState,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import React, {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { CartProvider } from "@/lib/cart";
// A home é importada de forma ESTÁTICA (as outras rotas continuam lazy).
// Motivo: ela é a rota inicial, então `lazy()` obrigava o navegador a uma
// segunda onda de downloads — só depois de baixar e executar o bundle de
// entrada ele descobria o chunk da home (e os ~27 arquivos dela). Com o import
// estático, o Vite lista essa árvore no <head> e tudo desce em paralelo com o
// bundle principal. É o maior ganho de tempo de primeira pintura em celular.
import Home from "./pages/Home.tsx";
import { ThemeProvider } from "@/lib/theme";
import { convexUrlCandidates, deploymentServesStore } from "@/lib/convex-url";
import { applyShareMeta } from "@/lib/seo";
import type { ShareMeta, ShareMetaTag } from "@/convex/lib/seo";

// Preview/captura de tela do ambiente Freebuff: carregado SOMENTE em
// desenvolvimento. Em produção este import dinâmico é eliminado pelo Vite
// (import.meta.env.DEV === false), mantendo o bundle público livre do
// listener de captura (S1/S4 da auditoria).
if (import.meta.env.DEV) {
  void import('@vly-ai/integrations');
}

// Lazy load route components for better code splitting
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
// Volta do OAuth do Discord (/auth/discord): troca o código pelo login.
const DiscordCallbackPage = lazy(() => import("./pages/DiscordCallback.tsx"));
const CategoriesPage = lazy(() => import("./pages/Categories.tsx"));
const CategoryPage = lazy(() => import("./pages/CategoryPage.tsx"));
const ProductPage = lazy(() => import("./pages/Product.tsx"));
const CartPage = lazy(() => import("./pages/Cart.tsx"));
const CheckoutPage = lazy(() => import("./pages/Checkout.tsx"));
const OrderStatusPage = lazy(() => import("./pages/OrderStatus.tsx"));
const AccountPage = lazy(() => import("./pages/Account.tsx"));
const StaticPage = lazy(() => import("./pages/StaticPage.tsx"));
const ApiDocs = lazy(() => import("./pages/ApiDocs.tsx"));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard.tsx"));
const AdminStats = lazy(() => import("./pages/admin/Stats.tsx"));
const AdminMore = lazy(() => import("./pages/admin/More.tsx"));
const AdminOrders = lazy(() => import("./pages/admin/Orders.tsx"));
const AdminProducts = lazy(() => import("./pages/admin/Products.tsx"));
const AdminCategories = lazy(() => import("./pages/admin/Categories.tsx"));
const AdminCoupons = lazy(() => import("./pages/admin/Coupons.tsx"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers.tsx"));
const AdminDeliveries = lazy(() => import("./pages/admin/Deliveries.tsx"));
const AdminDeliveriesAuto = lazy(() => import("./pages/admin/DeliveriesAuto.tsx"));
const AdminApiLogs = lazy(() => import("./pages/admin/ApiLogs.tsx"));
const AdminContent = lazy(() => import("./pages/admin/Content.tsx"));
const AdminAppearance = lazy(() => import("./pages/admin/Appearance.tsx"));
const AdminIntegrations = lazy(() => import("./pages/admin/Integrations.tsx"));
const AdminDiscord = lazy(() => import("./pages/admin/Discord.tsx"));
const AdminTeam = lazy(() => import("./pages/admin/Team.tsx"));
const AdminLogs = lazy(() => import("./pages/admin/Logs.tsx"));
const AdminSettings = lazy(() => import("./pages/admin/Settings.tsx"));
const AdminPromotions = lazy(() => import("./pages/admin/Promotions.tsx"));

const NotFound = lazy(() => import("./pages/NotFound.tsx"));

/**
 * Pré-carrega, quando o navegador fica ocioso, os chunks da navegação mais
 * comum da loja. Assim a troca de página não suspende o <Suspense> inteiro
 * (o que remonta o header e pisca "Loading...") — a troca fica instantânea.
 * São exatamente os mesmos caminhos usados no lazy() acima, então o Vite
 * reaproveita o mesmo chunk.
 *
 * A home fica de fora: ela já vem no bundle de entrada (import estático no topo
 * deste arquivo), então não há chunk para pré-carregar.
 */
const STORE_ROUTE_LOADERS = [
  () => import("./pages/Categories.tsx"),
  () => import("./pages/CategoryPage.tsx"),
  () => import("./pages/Product.tsx"),
  () => import("./pages/Cart.tsx"),
  () => import("./pages/Checkout.tsx"),
  () => import("./pages/Auth.tsx"),
];

function prefetchStoreRoutes() {
  for (const load of STORE_ROUTE_LOADERS) load().catch(() => {});
}

if (typeof window !== "undefined") {
  const requestIdle = (window as unknown as {
    requestIdleCallback?: (cb: () => void) => number;
  }).requestIdleCallback;
  if (requestIdle) requestIdle(prefetchStoreRoutes);
  else window.setTimeout(prefetchStoreRoutes, 1500);
}

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Endereços a tentar, em ordem: o configurado no build (VITE_CONVEX_URL) e, se
 * ele nunca conectar, o deployment desta loja. Um build publicado com a
 * variável apontando para um deployment antigo deixava todas as telas
 * carregando para sempre.
 */
const CONVEX_URLS = convexUrlCandidates(import.meta.env.VITE_CONVEX_URL as string | undefined);

/**
 * Dono da conexão Convex: tenta o endereço do build e, se ele não conectar,
 * remonta o provedor com o deployment desta loja.
 */
function ConvexApp({ children }: { children: React.ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const url = CONVEX_URLS[Math.min(attempt, CONVEX_URLS.length - 1)];
  const client = useMemo(() => new ConvexReactClient(url), [url]);
  // Estável para não reiniciar o timer do ConnectionGuard a cada render.
  const failover = useCallback(() => setAttempt((a) => a + 1), []);

  return (
    <ConvexAuthProvider key={url} client={client}>
      <ConnectionGuard
        url={url}
        canFailover={attempt < CONVEX_URLS.length - 1}
        onFailover={failover}
      />
      {children}
    </ConvexAuthProvider>
  );
}

/**
 * Troca o ícone da aba pela imagem cadastrada pela loja (Configurações → Loja)
 * assim que ela existir, dando preferência ao favicon próprio e caindo no logo
 * quando ele não estiver definido. Sem nada cadastrado, mantém a marca Apollo
 * embutida no projeto.
 */
function StoreFavicon() {
  const store = useQuery(api.settings.getStore) as
    | { logoUrl?: string; faviconUrl?: string }
    | undefined;
  const iconUrl = store?.faviconUrl || store?.logoUrl;

  useEffect(() => {
    if (!iconUrl) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    const previousHref = link.getAttribute("href");
    const previousType = link.getAttribute("type");
    // As URLs do Convex Storage não têm extensão: nesse caso deixamos o
    // navegador identificar o formato pelo Content-Type da resposta.
    const extension = iconUrl.split("?")[0].split(".").pop()?.toLowerCase();
    const mimeType =
      extension === "svg"
        ? "image/svg+xml"
        : extension === "ico"
          ? "image/x-icon"
          : extension === "webp"
            ? "image/webp"
            : extension === "jpg" || extension === "jpeg"
              ? "image/jpeg"
              : extension === "png"
                ? "image/png"
                : null;

    link.setAttribute("href", iconUrl);
    if (mimeType) link.setAttribute("type", mimeType);
    else link.removeAttribute("type");

    return () => {
      if (previousHref) link.setAttribute("href", previousHref);
      if (previousType) link.setAttribute("type", previousType);
    };
  }, [iconUrl]);

  return null;
}



/**
 * Aplica a "bio do link" (título, descrição, imagem/GIF) no <head> da página.
 *
 * O que o Discord/WhatsApp mostram vem do HTML publicado — os robôs deles não
 * rodam JavaScript (ver o plugin `seoShareMetaPlugin` no vite.config.ts, que
 * grava as MESMAS tags no build). Aqui a loja passa a refletir a bio editada no
 * painel na hora, no
 * navegador, sem esperar a próxima publicação.
 */
function StoreShareMeta() {
  const data = useQuery(api.settings.getShareMeta) as
    | { meta: ShareMeta; tags: ShareMetaTag[] }
    | undefined;

  useEffect(() => {
    if (!data) return;
    applyShareMeta(data.meta, data.tags);
  }, [data]);

  return null;
}

/**
 * Diz se o deployment conectado realmente serve esta loja, observando uma query
 * pública conhecida: `settings.getStore` sempre devolve um objeto no backend
 * certo, e `localQueryResult()` lança quando o servidor responde erro. É o que
 * distingue "ainda carregando" de "este endereço não é a loja" — inclusive
 * quando o WebSocket conecta mas as funções não existem do outro lado.
 */
function useStoreReachable(client: ConvexReactClient): boolean {
  const [reachable, setReachable] = useState(false);

  useEffect(() => {
    const watch = client.watchQuery(api.settings.getStore, {});
    const check = () => {
      try {
        if (watch.localQueryResult() !== undefined) setReachable(true);
      } catch {
        // Erro do servidor nesta query: segue indisponível e deixa o
        // ConnectionGuard cuidar (troca de endereço ou aviso).
      }
    };
    check();
    const unsubscribe = watch.onUpdate(check);
    return () => unsubscribe();
  }, [client]);

  return reachable;
}

/**
 * Última linha de defesa contra o "carrega para sempre".
 *
 * Se o endereço configurado no build não responde esta loja, o app tenta o
 * deployment dela (ver `@/lib/convex-url`) depois de alguns segundos. Se nem
 * esse responder, mostramos o endereço usado e a ação de recarregar — em vez do
 * spinner infinito em todas as telas.
 */
function ConnectionGuard({
  url,
  canFailover,
  onFailover,
}: {
  url: string;
  canFailover: boolean;
  onFailover: () => void;
}) {
  const client = useConvex();
  const { isWebSocketConnected } = useConvexConnectionState();
  const reachable = useStoreReachable(client);
  // O cliente pode ficar pendurado sem nunca responder (foi o caso do endereço
  // errado). Um POST público no mesmo endereço responde em milissegundos se ele
  // não é o deployment desta loja, então dá para trocar sem esperar conexão.
  const [probeFailed, setProbeFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (!canFailover) return;
    let alive = true;
    void deploymentServesStore(url).then((serves) => {
      if (alive && !serves) setProbeFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [url, canFailover]);

  useEffect(() => {
    if (reachable || fired.current) return;
    // 0ms: o teste respondeu que este endereço não é a loja.
    // 6s: o teste não acusou problema, mas nada chegou pelo cliente.
    // 10s: não há para onde trocar — só avisamos depois de um tempo generoso.
    const delay = probeFailed ? 0 : canFailover ? 6000 : 10000;
    const timer = setTimeout(() => {
      fired.current = true;
      if (canFailover) onFailover();
      else setTimedOut(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [reachable, probeFailed, canFailover, onFailover]);

  if (reachable || !timedOut) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold">Não foi possível conectar ao servidor de dados</p>
        <p className="mt-2 text-xs break-words text-muted-foreground">
          O endereço configurado no build é{" "}
          <code className="font-mono text-[11px]">{url || "(VITE_CONVEX_URL ausente)"}</code>
          {isWebSocketConnected ? " e a conexão caiu." : " e a conexão não foi estabelecida."}{" "}
          Confira a variável <code className="font-mono text-[11px]">VITE_CONVEX_URL</code> e
          publique de novo.
        </p>
        <button
          type="button"
          className="mt-5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          onClick={() => window.location.reload()}
        >
          Recarregar página
        </button>
      </div>
    </div>
  );
}

/** Sincroniza a rota com o host de preview (Freebuff) via postMessage.
 *  Roda apenas em desenvolvimento e só aceita mensagens vindas da janela pai
 *  (`event.source`) — em produção não expõe listener nem envia mensagens. */
function RouteSyncer() {
  const location = useLocation();
  const isPreview = import.meta.env.DEV;

  useEffect(() => {
    if (!isPreview) return;
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname, isPreview]);

  useEffect(() => {
    if (!isPreview) return;
    function handleMessage(event: MessageEvent) {
      // Ignora mensagens que não vieram da janela pai (não confia em "*" para
      // comandos de navegação).
      if (event.source !== window.parent) return;
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isPreview]);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      {import.meta.env.DEV && (
        <ToolbarErrorBoundary>
          <VlyToolbar />
        </ToolbarErrorBoundary>
      )}
      <ConvexApp>
        <ThemeProvider>
          <CartProvider>
            <BrowserRouter>
              <RouteSyncer />
              <StoreFavicon />
              <StoreShareMeta />
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                  {/* Loja pública */}
                  <Route path="/" element={<Home />} />
                  {/* O catálogo plano foi removido: a loja agora é navegada por categorias. */}
                  <Route path="/loja" element={<Navigate to="/categorias" replace />} />
                  <Route path="/categorias" element={<CategoriesPage />} />
                  <Route path="/categoria/:slug" element={<CategoryPage />} />
                  <Route path="/produto/:slug" element={<ProductPage />} />
                  <Route path="/carrinho" element={<CartPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/pedido/:number" element={<OrderStatusPage />} />
                  <Route path="/conta" element={<AccountPage />} />
                  <Route path="/blog" element={<StaticPage />} />
                  <Route path="/blog/:slug" element={<StaticPage />} />
                  <Route path="/p/:slug" element={<StaticPage />} />
                  <Route path="/docs/api" element={<ApiDocs />} />

                  {/* Auth */}
                  <Route
                    path="/auth"
                    element={<AuthPage redirectAfterAuth="/painel" />}
                  />
                  {/* Endereço de retorno registrado no Discord Developer Portal.
                      Precisa ser exatamente este caminho (ver /painel/discord). */}
                  <Route path="/auth/discord" element={<DiscordCallbackPage />} />

                  {/* Painel admin */}
                  <Route
                    path="/painel"
                    element={
                      <RequireAuth>
                        <AdminLayout />
                      </RequireAuth>
                    }
                  >
                    <Route index element={<AdminDashboard />} />
                    <Route path="stats" element={<AdminStats />} />
                    <Route path="mais" element={<AdminMore />} />
                    <Route path="pedidos" element={<AdminOrders />} />
                    <Route path="produtos" element={<AdminProducts />} />
                    <Route path="categorias" element={<AdminCategories />} />
                    <Route path="cupons" element={<AdminCoupons />} />
                    <Route path="promocoes" element={<AdminPromotions />} />
                    <Route path="clientes" element={<AdminCustomers />} />
                    <Route path="entregas" element={<AdminDeliveries />} />
                    <Route path="entregas-auto" element={<AdminDeliveriesAuto />} />
                    <Route path="api-logs" element={<AdminApiLogs />} />
                    <Route path="conteudo" element={<AdminContent />} />
                    <Route path="aparencia" element={<AdminAppearance />} />
                    <Route path="integracoes" element={<AdminIntegrations />} />
                    <Route path="discord" element={<AdminDiscord />} />
                    <Route path="equipe" element={<AdminTeam />} />
                    <Route path="logs" element={<AdminLogs />} />
                    <Route path="configuracoes" element={<AdminSettings />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster />
          </CartProvider>
        </ThemeProvider>
      </ConvexApp>
    </RootErrorBoundary>
  </StrictMode>,
);
