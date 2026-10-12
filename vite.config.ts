import { vlyPlugin } from "@vly-ai/integrations";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import {
  fetchShareMetaPayload,
  injectShareMetaBlock,
  renderShareMetaBlock,
} from "./src/lib/shareMetaHtml";
import { convexUrlCandidates } from "./src/lib/convex-url";

/**
 * Grava a bio do link (painel → Configurações → Bio do link) no `index.html`
 * PRODUZIDO pelo build.
 *
 * Antes isso era um script solto no `prebuild`. O problema: só funcionava se o
 * build fosse exatamente `npm run build`/`bun run build` — num build chamado de
 * outra forma (`vite build` direto, por exemplo) o `prebuild` era pulado e o HTML
 * publicado saía com o texto ANTIGO, mesmo depois de a loja ser publicada de
 * novo, mesmo salvando no painel. Injetando aqui, dentro do próprio build, o
 * card acompanha o painel em qualquer caminho de build.
 *
 * Se o Convex não responder (build offline, timeout), o HTML que já está no
 * arquivo é mantido e o build segue — nunca publicamos um `<head>` vazio.
 */
function seoShareMetaPlugin(): Plugin {
  return {
    name: "seo-share-meta",
    // Somente no build: no dev o HTML é servido a cada request e não faz sentido
    // bater no servidor por isso.
    apply: "build",
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        const candidates = convexUrlCandidates(process.env.VITE_CONVEX_URL);
        for (const url of candidates) {
          try {
            const payload = await fetchShareMetaPayload(url);
            const next = injectShareMetaBlock(
              html,
              renderShareMetaBlock(payload, url),
            );
            if (!next) {
              this.warn("index.html sem os marcadores seo:link-preview — bio não injetada.");
              return html;
            }
            this.info(
              `bio do link: "${payload.meta.title}"` +
                (payload.meta.image ? " (com capa)" : " (sem capa)"),
            );
            return next;
          } catch (error) {
            // Tenta o próximo endereço; o último erro fica no aviso abaixo.
            if (url === candidates[candidates.length - 1]) {
              this.warn(
                `não foi possível ler a bio do link (${error instanceof Error ? error.message : error}). ` +
                  "O HTML do repositório foi mantido — pode estar desatualizado.",
              );
            }
          }
        }
        return html;
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // NOTA: o vlyPlugin() (preview/captura de tela) foi removido do build de
  // produção por segurança (S1/S4 da auditoria). A toolbar de preview continua
  // disponível em desenvolvimento via `VlyToolbar` no src/main.tsx.
  plugins: [react(), tailwindcss(), seoShareMetaPlugin()],
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
