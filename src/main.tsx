import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { CartProvider } from "@/lib/cart";
import { ThemeProvider } from "@/lib/theme";

// Lazy load route components for better code splitting
const Home = lazy(() => import("./pages/Home.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Catalog = lazy(() => import("./pages/Catalog.tsx"));
const ProductPage = lazy(() => import("./pages/Product.tsx"));
const CartPage = lazy(() => import("./pages/Cart.tsx"));
const CheckoutPage = lazy(() => import("./pages/Checkout.tsx"));
const OrderStatusPage = lazy(() => import("./pages/OrderStatus.tsx"));
const StaticPage = lazy(() => import("./pages/StaticPage.tsx"));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard.tsx"));
const AdminOrders = lazy(() => import("./pages/admin/Orders.tsx"));
const AdminProducts = lazy(() => import("./pages/admin/Products.tsx"));
const AdminCategories = lazy(() => import("./pages/admin/Categories.tsx"));
const AdminCoupons = lazy(() => import("./pages/admin/Coupons.tsx"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers.tsx"));
const AdminDeliveries = lazy(() => import("./pages/admin/Deliveries.tsx"));
const AdminContent = lazy(() => import("./pages/admin/Content.tsx"));
const AdminAppearance = lazy(() => import("./pages/admin/Appearance.tsx"));
const AdminIntegrations = lazy(() => import("./pages/admin/Integrations.tsx"));
const AdminTeam = lazy(() => import("./pages/admin/Team.tsx"));
const AdminLogs = lazy(() => import("./pages/admin/Logs.tsx"));
const AdminSettings = lazy(() => import("./pages/admin/Settings.tsx"));

const NotFound = lazy(() => import("./pages/NotFound.tsx"));

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

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <ThemeProvider>
          <CartProvider>
            <BrowserRouter>
              <RouteSyncer />
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                  {/* Loja pública */}
                  <Route path="/" element={<Home />} />
                  <Route path="/loja" element={<Catalog />} />
                  <Route path="/produto/:slug" element={<ProductPage />} />
                  <Route path="/carrinho" element={<CartPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/pedido/:number" element={<OrderStatusPage />} />
                  <Route path="/blog" element={<StaticPage />} />
                  <Route path="/blog/:slug" element={<StaticPage />} />
                  <Route path="/p/:slug" element={<StaticPage />} />

                  {/* Auth */}
                  <Route
                    path="/auth"
                    element={<AuthPage redirectAfterAuth="/painel" />}
                  />

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
                    <Route path="pedidos" element={<AdminOrders />} />
                    <Route path="produtos" element={<AdminProducts />} />
                    <Route path="categorias" element={<AdminCategories />} />
                    <Route path="cupons" element={<AdminCoupons />} />
                    <Route path="clientes" element={<AdminCustomers />} />
                    <Route path="entregas" element={<AdminDeliveries />} />
                    <Route path="conteudo" element={<AdminContent />} />
                    <Route path="aparencia" element={<AdminAppearance />} />
                    <Route path="integracoes" element={<AdminIntegrations />} />
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
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
