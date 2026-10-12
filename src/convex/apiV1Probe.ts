"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import {
  buildProbeResult,
  normalizeApiBaseUrl,
  storeApiBaseUrl,
  type EndpointProbeResult,
} from "./lib/apiEndpoint";

// ─────────────────────────────────────────────────────────────
// Sondagem do endereço da API v1 (somente admin).
//
// Roda no SERVIDOR de propósito: o addon (BDS/Node) não passa por CORS, então
// só uma chamada feita daqui mostra o status HTTP real que o addon recebe. É
// isto que distingue "endereço errado/deployment morto" (500 cru do Convex) de
// "chave inválida" (401 no padrão da API) — sem nunca enviar chave nenhuma.
//
// A resposta NUNCA contém segredo: a requisição vai sem cabeçalho de
// autenticação e só um trecho curto do corpo é devolvido ao painel.
// ─────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 8000;

/** Endereço de produção desta loja (HTTP actions do Convex). */
export const STORE_API_BASE_URL = storeApiBaseUrl(
  process.env.CONVEX_SITE_URL ?? "https://capable-akita-865.convex.site",
);

export const probeEndpoint = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<EndpointProbeResult> => {
    // Action não tem db: a autorização passa por uma query admin.
    await ctx.runQuery(api.apiKeysV1.assertAdmin, {});

    const baseUrl = normalizeApiBaseUrl(url);
    const expectedBaseUrl = STORE_API_BASE_URL;
    if (!baseUrl) {
      return {
        baseUrl: url.trim(),
        expectedBaseUrl,
        status: null,
        verdict: "unexpected",
        snippet: "",
        message: "Endereço inválido. Informe algo como https://SEU-DEPLOYMENT.convex.site/api/v1.",
      };
    }
    if (!baseUrl.startsWith("https://")) {
      return {
        baseUrl,
        expectedBaseUrl,
        status: null,
        verdict: "unexpected",
        snippet: "",
        message: "Use https:// — o addon e o Convex só aceitam HTTPS.",
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/app/me`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const bodyText = await res.text().catch(() => "");
      return buildProbeResult({
        baseUrl,
        expectedBaseUrl,
        response: {
          status: res.status,
          contentType: res.headers.get("content-type") ?? "",
          bodyText,
        },
      });
    } catch {
      // Sem resposta: DNS, TLS, timeout ou host que não existe.
      return buildProbeResult({ baseUrl, expectedBaseUrl, response: null });
    } finally {
      clearTimeout(timer);
    }
  },
});
