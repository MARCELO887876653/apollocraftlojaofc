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
import {
  STORE_DASHBOARD_URL,
  configuredConvexUrl,
  convexUrlCandidates,
} from "@/lib/convex-url";
import {
  checkDeployment,
  type DeploymentFailure,
} from "@/lib/deployment-status";
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

/** Tempo entre as verificações automáticas do servidor. */
const RETRY_SECONDS = 60;

/**
 * Última linha de defesa contra o "carrega para sempre".
 *
 * Três coisas acontecem aqui:
 *
 * 1. Ao abrir o site, um POST público pergunta ao deployment se ele está
 *    executando as funções desta loja. Se a resposta for erro, a tela explica o
 *    motivo (o caso real: "desativado por limite de uso") em vez de mandar o
 *    dono conferir VITE_CONVEX_URL.
 * 2. Enquanto o site está aberto e saudável, essa mesma pergunta roda a cada
 *    minuto — é o "acordar" do servidor, que mantém a conexão/caches quentes.
 * 3. Se o servidor cair ou voltar, o app tenta de novo sozinho a cada minuto e
 *    recarrega a página no instante em que ele responde — sem o visitante
 *    precisar fazer nada.
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
  const [failure, setFailure] = useState<DeploymentFailure | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [checking, setChecking] = useState(false);
  const [retryIn, setRetryIn] = useState(RETRY_SECONDS);
  const failures = useRef(0);
  const recovered = useRef(false);
  const reloading = useRef(false);
  const fired = useRef(false);

  const runCheck = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setChecking(true);
      const result = await checkDeployment(url);
      setChecking(false);

      if (result.ok) {
        failures.current = 0;
        setFailure(null);
        setTimedOut(false);
        // O servidor voltou depois de uma queda: recarrega uma única vez para
        // reabrir as consultas que ficaram penduradas.
        if (recovered.current && !reloading.current) {
          reloading.current = true;
          window.location.reload();
        }
        return;
      }

      failures.current += 1;
      // Erro devolvido pelo próprio servidor é definitivo; falha de rede pode
      // ser um soluço do celular, então só avisamos na segunda tentativa.
      if (result.failure.kind !== "unreachable" || failures.current >= 2) {
        // Só marcamos "recuperação pendente" quando o aviso realmente apareceu:
        // assim um ping isolado que falha não provoca recarga da página.
        recovered.current = true;
        setFailure(result.failure);
      }
      if (canFailover) onFailover();
    },
    [url, canFailover, onFailover],
  );

  // Primeira verificação ao abrir o site.
  useEffect(() => {
    failures.current = 0;
    recovered.current = false;
    fired.current = false;
    void runCheck();
  }, [runCheck]);

  // Se os dados chegaram, o servidor está claramente respondendo: some o aviso.
  useEffect(() => {
    if (!reachable) return;
    setFailure(null);
    setTimedOut(false);
  }, [reachable]);

  // Nada chegou pelo cliente em 10s e o teste HTTP não acusou nada: mostra a
  // tela mesmo assim (backstop, para nunca ficar girando em silêncio).
  useEffect(() => {
    if (reachable || failure || fired.current) return;
    const timer = setTimeout(() => {
      fired.current = true;
      setTimedOut(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [reachable, failure]);

  // Mantém o servidor acordado: uma pergunta por minuto enquanto a aba está
  // aberta. Também é o que detecta uma queda depois que o site já carregou.
  useEffect(() => {
    if (!reachable) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void runCheck({ silent: true });
    }, RETRY_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [reachable, runCheck]);

  // Volta para a aba ou para a internet: verifica na hora.
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState === "visible") void runCheck({ silent: true });
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
    };
  }, [runCheck]);

  // Falhou: tenta de novo a cada minuto, mostrando a contagem.
  const showing = Boolean(failure) || timedOut;
  useEffect(() => {
    if (!showing) return;
    setRetryIn(RETRY_SECONDS);
    const tick = window.setInterval(() => {
      setRetryIn((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    const retry = window.setTimeout(() => void runCheck({ silent: true }), RETRY_SECONDS * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(retry);
    };
  }, [showing, failure, runCheck]);

  if (reachable && !failure) return null;
  if (!showing) return null;

  const usageLimit = failure?.kind === "usage-limit";
  const missingUrl = !configuredConvexUrl(url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-lg text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/25">
          <span className="text-2xl">{usageLimit ? "⏸" : "⚠"}</span>
        </span>
        <p className="mt-4 text-lg font-bold tracking-tight">
          {usageLimit
            ? "O servidor da loja foi desativado por limite de uso"
            : "Não foi possível conectar ao servidor de dados"}
        </p>

        {usageLimit ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            O Convex desativou este servidor porque o limite de uso configurado foi atingido.{" "}
            <strong className="text-foreground">Seus dados estão salvos</strong> — pedidos,
            produtos e configurações continuam intactos. Para a loja voltar, abra o painel do
            Convex e aumente ou desative esse limite em{" "}
            <em>Deployment settings → Usage limits</em>.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {missingUrl
              ? "Este build saiu sem a variável VITE_CONVEX_URL. Publique de novo com o endereço do deployment da loja."
              : isWebSocketConnected
                ? "A conexão com o servidor caiu."
                : "O servidor não respondeu."}{" "}
            A loja tenta de novo sozinha a cada minuto e recarrega quando ele voltar.
          </p>
        )}

        {failure?.detail ? (
          <pre className="mt-3 max-h-28 overflow-auto rounded-xl border border-border/70 bg-muted/40 p-3 text-left font-mono text-[11px] leading-4 text-muted-foreground">
            {failure.detail}
          </pre>
        ) : null}

        <p className="mt-3 text-[11px] break-words text-muted-foreground">
          Servidor: <code className="font-mono">{url || "(VITE_CONVEX_URL ausente)"}</code>
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {usageLimit && (
            <a
              href={STORE_DASHBOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Abrir painel do Convex
            </a>
          )}
          <button
            type="button"
            className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            onClick={() => void runCheck()}
            disabled={checking}
          >
            {checking ? "Verificando…" : "Tentar agora"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          {checking
            ? "Verificando o servidor…"
            : `Verificando de novo em ${retryIn}s — a loja abre sozinha quando o servidor voltar.`}
        </p>
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
