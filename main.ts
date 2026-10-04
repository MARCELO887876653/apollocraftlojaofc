import { Hono } from "hono";
import { serveStatic } from "hono/deno";

const app = new Hono();

// ─────────────────────────────────────────────────────────────
// Cabeçalhos de segurança (aplicados a TODAS as respostas).
// Corrige S2 (proteção contra iframe) e S3 (CSP) da auditoria.
// ─────────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  await next();
  // Impede incorporação em iframe (clickjacking / framing para captura).
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// ─────────────────────────────────────────────────────────────
// Proxy da API para o backend Convex (HTTP Actions).
// As rotas /api/v1/*, /api/external/* e /webhooks/* vivem no domínio
// `*.convex.site` do deployment. Encaminhamos /api/* ANTES do fallback da
// SPA, para que a API responda JSON (e não o HTML da loja). Corrige C1.
// ─────────────────────────────────────────────────────────────
const CONVEX_SITE_URL =
  Deno.env.get("CONVEX_SITE_URL") ??
  Deno.env.get("VITE_CONVEX_SITE_URL") ??
  "https://capable-akita-865.convex.site";

app.all("/api/*", async (c) => {
  const url = new URL(c.req.url);
  const target = `${CONVEX_SITE_URL.replace(/\/+$/, "")}${url.pathname}${url.search}`;
  const method = c.req.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  try {
    const upstream = await fetch(target, {
      method,
      headers: c.req.raw.headers,
      body: hasBody ? await c.req.arrayBuffer() : undefined,
      redirect: "manual",
    });
    const headers = new Headers(upstream.headers);
    // O fetch já descomprime o corpo: remove cabeçalhos incoerentes.
    headers.delete("content-encoding");
    headers.delete("content-length");
    headers.delete("transfer-encoding");
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error("[api proxy] falha ao encaminhar:", target, error);
    return c.json(
      { errors: [{ code: "BAD_GATEWAY", message: "Falha ao contatar o backend." }] },
      502,
    );
  }
});

// 1) Serve anything in /assets/**
app.use("/assets/*", serveStatic({ root: "./dist/assets" }));

// 2) Catch *all* other files in dist (CSS, JS, images, etc.)
app.use("*", serveStatic({ root: "./dist" }));

// 3) Fallback to index.html for the SPA
app.get("*", serveStatic({ path: "./dist/index.html" }));

Deno.serve(app.fetch);
