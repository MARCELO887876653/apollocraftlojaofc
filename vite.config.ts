import { vlyPlugin } from "@vly-ai/integrations";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // NOTA: o vlyPlugin() (preview/captura de tela) foi removido do build de
  // produção por segurança (S1/S4 da auditoria). A toolbar de preview continua
  // disponível em desenvolvimento via `VlyToolbar` no src/main.tsx.
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force a single copy of React across all packages (including vlyPlugin).
    // Without this, @vly-ai/integrations can resolve its own React copy, which
    // triggers "Invalid hook call" errors at runtime.
    dedupe: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  },
  build: {
    // Enable source maps for better debugging (disable in production if needed)
    sourcemap: false,
    // NÃO declare `manualChunks` aqui.
    //
    // Havia uma lista fixa de chunks de vendor (radix-ui, framer-motion,
    // recharts…). O efeito colateral medido: como `recharts` ficava no chunk
    // "charts", TODAS as páginas da loja passaram a ter um `import` só de
    // efeito colateral para esse chunk (`import"./charts-*.js"`), ou seja, o
    // visitante baixava o recharts + lodash inteiros (105 kB gz) só para abrir a
    // home. Além disso o <head> gerado pré-carregava framer-motion e radix-ui em
    // toda rota.
    //
    // Com o chunking padrão do Rollup, cada rota lazy leva junto só o que ela
    // importa de verdade: o recharts fica num chunk compartilhado que só é
    // buscado quando uma tela que usa gráfico é aberta.
    rollupOptions: {
      output: {
        // Optimize chunk size
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit for better chunking
    chunkSizeWarningLimit: 1000,
    // Target modern browsers for better optimization
    target: 'esnext',
    // Minify options - using esbuild (faster than terser)
    minify: 'esbuild',
  },
  // Optimize dependencies
  optimizeDeps: {
    // Only scan the app entry HTML; avoids crawling unrelated *.html files
    // if a legacy snapshot accidentally contains leaked package folders.
    entries: ['index.html'],
    include: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'react-router',
      '@convex-dev/auth/react',
      'framer-motion',
    ],
  },
  // Performance hints
  server: {
    // Bind to all interfaces so WebContainer's server-ready event fires.
    host: true,
    port: 5173,
    // Keep HMR on, but disable full-screen error overlay
    hmr: {
      overlay: false,
    },
  },
});
