import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexConnectionState } from "convex/react";
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
import {
  StoreShellProvider,
  useStoreShell,
  useStoreShellFailed,
} from "@/lib/storefront";
import { applyShareMeta } from "@/lib/seo";

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

/**
 * Pré-carregar 6 rotas custa 6 requisições. Em conexão medida (Save-Data ou
 * 2G) isso é caro e ninguém navega rápido o bastante para aproveitar — então
 * ali não pré-carregamos nada.
 */
function canPrefetch(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return connection.effectiveType !== "slow-2g" && connection.effectiveType !== "2g";
}

function prefetchStoreRoutes() {
  if (!canPrefetch()) return;
  for (const load of STORE_ROUTE_LOADERS) load().catch(() => {});
}

if (typeof window !== "undefined") {
  const requestIdle = (window as unknown as {
    requestIdleCallback?: (cb: () => void) => number;
  }).requestIdleCallback;
  if (requestIdle) requestIdle(prefetchStoreRoutes);
  else window.setTimeout(prefetchStoreRoutes, 1500);
}

/**
 * Enquanto o chunk de uma rota lazy baixa, mostramos um esqueleto com a cara
 * da loja (topo + título + grade de produtos) em vez de um "Loading..." solto:
 * a página não salta de layout quando o conteúdo entra.
 */
function RouteLoading() {
  const shell = useStoreShell();
  const storeName = shell?.store?.name ?? "Apollo Craft";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-16 items-center border-b border-border/60 px-4">
        <span className="text-sm font-extrabold tracking-tight uppercase">{storeName}</span>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 py-12" aria-busy="true" aria-live="polite">
        <span className="sr-only">Carregando a página…</span>
        <div className="h-10 w-2/3 max-w-md animate-pulse rounded-xl bg-muted/60" />
        <div className="mt-4 h-5 w-1/2 max-w-sm animate-pulse rounded bg-muted/40" />
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted/40" />
          ))}
        </div>
      </div>
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
const CONVEX_URLS = convexUrlCandidates(__CONVEX_BUILD_URL__);

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
      {/* Um único `useQuery` do shell da loja alimenta layout, tema, favicon e
          bio do link — antes eram 6 assinaturas (e 3 do mesmo `getStore`).
          O ConnectionGuard fica DENTRO do provider para usar a chegada dos
          dados como sinal de vida, sem uma assinatura só para isso. */}
      <StoreShellProvider>
        <ConnectionGuard
          url={url}
          canFailover={attempt < CONVEX_URLS.length - 1}
          onFailover={failover}
        />
        <StoreContent
          canFailover={attempt < CONVEX_URLS.length - 1}
          onFailover={failover}
        >
          {children}
        </StoreContent>
      </StoreShellProvider>
    </ConvexAuthProvider>
  );
}

/**
 * Se o servidor recusou o shell (endereço morto, limite de uso, fora do ar),
 * não montamos as páginas: cada uma abriria as próprias consultas e só
 * multiplicaria erros. Mostramos o esqueleto enquanto o guard explica o motivo
 * ou troca de endereço — a partir daí as páginas voltam sozinhas.
 */
function StoreContent({
  canFailover,
  onFailover,
  children,
}: {
  canFailover: boolean;
  onFailover: () => void;
  children: React.ReactNode;
}) {
  const failed = useStoreShellFailed();
  if (failed) return <RouteLoading />;
  // Qualquer outra consulta que falhe (ex.: uma página específica) também não
  // pode derrubar o site: o limite abaixo recupera ou troca de endereço.
  return (
    <QueryErrorRecovery canFailover={canFailover} onFailover={onFailover}>
      {children}
    </QueryErrorRecovery>
  );
}

/**
 * Rede de segurança para erro de QUALQUER consulta dentro das páginas.
 *
 * Sem isso, uma resposta com erro vira tela de erro em cima do site todo. Com
 * um endereço de reserva configurado, trocamos para ele na hora; sem reserva,
 * fica o esqueleto (e o guard mostra o motivo).
 */
class QueryErrorRecovery extends React.Component<
  { canFailover: boolean; onFailover: () => void; children: React.ReactNode },
  { caught: boolean }
> {
  state = { caught: false };

  static getDerivedStateFromError() {
    return { caught: true };
  }

  componentDidCatch(error: Error) {
    console.error("[store] consulta falhou:", error?.message ?? error);
    if (this.props.canFailover) this.props.onFailover();
  }

  render() {
    if (this.state.caught) return <RouteLoading />;
    return this.props.children;
  }
}

/**
 * Troca o ícone da aba pela imagem cadastrada pela loja (Configurações → Loja)
 * assim que ela existir, dando preferência ao favicon próprio e caindo no logo
 * quando ele não estiver definido. Sem nada cadastrado, mantém a marca Apollo
 * embutida no projeto.
 */
function StoreFavicon() {
  const shell = useStoreShell();
  const iconUrl = shell?.store?.faviconUrl || shell?.store?.logoUrl;

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
  const shareMeta = useStoreShell()?.shareMeta;

  useEffect(() => {
    if (!shareMeta) return;
    applyShareMeta(shareMeta.meta, shareMeta.tags);
  }, [shareMeta]);

  return null;
}

/** Tempo entre as verificações automáticas do servidor. */
const RETRY_SECONDS = 60;

/**
 * Quanto esperar antes de desconfiar do servidor.
 *
 * Não perguntamos nada enquanto os dados não atrasam: o "shell" da loja
 * (`storefront.getShell`, assinado pelo StoreShellProvider) é o sinal de vida.
 * Se ele chegou, o servidor está respondendo — e nenhuma chamada extra é feita.
 */
const SUSPECT_AFTER_MS = 5000;

/** Último recurso: nada chegou e nem o teste HTTP acusou nada. */
const GIVE_UP_AFTER_MS = 15000;

/**
 * Última linha de defesa contra o "carrega para sempre".
 *
 * Três coisas acontecem aqui:
 *
 * 1. Ao abrir o site, um POST público pergunta ao deployment se ele está
 *    executando as funções desta loja. Se a resposta for erro, a tela explica o
 *    motivo (o caso real: "desativado por limite de uso") em vez de mandar o
 *    dono conferir VITE_CONVEX_URL.
 * 2. A mesma pergunta é repetida a cada minuto ENQUANTO o site está sem dados
 *    (é o "acordar" da loja) — e para de rodar assim que os dados chegam, para
 *    não gastar chamadas de função do Convex sem necessidade.
 * 3. No instante em que o servidor volta a responder, a página recarrega
 *    sozinha — sem o visitante precisar fazer nada.
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
  // Os dados da loja chegaram? É o próprio shell respondendo — sem assinatura
  // extra só para conferir se o servidor está vivo.
  const reachable = useStoreShell() !== undefined;
  // O servidor RECUSOU o shell (endereço morto, limite de uso, fora do ar)?
  const shellFailed = useStoreShellFailed();
  const { isWebSocketConnected } = useConvexConnectionState();
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

  // Ao abrir o site não perguntamos nada: dá tempo de o shell chegar. Só depois
  // de SUSPECT_AFTER_MS sem dados é que vale gastar uma chamada para descobrir
  // o motivo (servidor fora, limite de uso, endereço errado…).
  useEffect(() => {
    if (reachable) return;
    failures.current = 0;
    recovered.current = false;
    fired.current = false;
    // Recusa do servidor: com endereço de reserva, troca IMEDIATAMENTE (foi
    // assim que o site publicado, apontando para um deployment morto, voltou ao
    // ar). Sem reserva, pergunta o motivo (1 chamada) e mostra a explicação.
    if (shellFailed) {
      if (canFailover) onFailover();
      else void runCheck();
      return;
    }
    const timer = window.setTimeout(() => void runCheck(), SUSPECT_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [reachable, shellFailed, canFailover, runCheck, onFailover]);

  // Se os dados chegaram, o servidor está claramente respondendo: some o aviso.
  useEffect(() => {
    if (!reachable) return;
    setFailure(null);
    setTimedOut(false);
  }, [reachable]);

  // Nada chegou pelo cliente e o teste HTTP não acusou nada: mostra a tela
  // mesmo assim (backstop, para nunca ficar girando em silêncio).
  useEffect(() => {
    if (reachable || failure || fired.current) return;
    const timer = setTimeout(() => {
      fired.current = true;
      setTimedOut(true);
    }, GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [reachable, failure]);

  // NÃO perguntamos nada enquanto o site está saudável: cada pergunta é uma
  // chamada de função e o limite do Convex é medido em chamadas. A conexão
  // aberta (WebSocket) já mantém o servidor aquecido sozinha.
  //
  // A verificação só liga quando a conexão cai (ou quando a aba volta com a
  // conexão perdida): é o "acordar" que faz a loja voltar sozinha, sem gastar
  // nada enquanto está tudo bem.
  useEffect(() => {
    if (isWebSocketConnected) return;
    let cancelled = false;
    const attempt = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      void runCheck({ silent: true });
    };
    // 10s: dá tempo de o próprio cliente reconectar antes de incomodar.
    const first = window.setTimeout(attempt, 10000);
    const repeat = window.setInterval(attempt, RETRY_SECONDS * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(repeat);
    };
  }, [isWebSocketConnected, runCheck]);

  // Volta para a aba ou para a internet com algo pendente: verifica na hora.
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      if (isWebSocketConnected && reachable && !failure) return;
      void runCheck({ silent: true });
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
    };
  }, [runCheck, isWebSocketConnected, reachable, failure]);

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

  // Com um endereço de reserva disponível nunca mostramos a tela de erro: o app
  // já está trocando de endereço (o esqueleto cobre esse instante).
  if (canFailover) return null;
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
