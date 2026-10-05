"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────
// Aviso de retorno da loja (modo manutenção)
//
// Disparado quando o admin desliga a manutenção: envia um e-mail em pt-BR
// para todos que deixaram o endereço na tela de manutenção.
// ─────────────────────────────────────────────────────────────

/** Limite por execução — o restante fica na fila para a próxima rodada. */
const MAX_PER_RUN = 150;
const SUPPORT_EMAIL = "suporte@apollocraft.online";

function resendFromCandidates(storeName: string): string[] {
  const candidates = [
    process.env.RESEND_FROM,
    `${storeName} <${SUPPORT_EMAIL}>`,
    `${storeName} <onboarding@resend.dev>`,
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
}

/** E-mail pt-BR avisando que a loja voltou, com a identidade navy/azul. */
function renderBackOnlineEmail({ storeName, storeUrl }: { storeName: string; storeUrl: string }) {
  const button = `${storeUrl.replace(/\/$/, "")}/loja`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A loja voltou ao ar</title>
</head>
<body style="margin:0;padding:0;background:#070d16;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070d16;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0c1420;border:1px solid rgba(56,189,248,0.18);border-radius:20px;overflow:hidden;">
          <tr><td style="height:4px;background:linear-gradient(90deg,#0ea5e9,#38bdf8,#0ea5e9);"></td></tr>
          <tr>
            <td style="padding:26px 32px 0 32px;text-align:center;">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;letter-spacing:3px;color:#7dd3fc;text-transform:uppercase;">${storeName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px 32px;text-align:center;">
              <div style="display:inline-block;padding:10px 14px;border-radius:14px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);color:#38bdf8;font-size:22px;">&#9989;</div>
              <h1 style="margin:22px 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#eaf2fb;font-weight:800;">
                A loja voltou ao ar!
              </h1>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#94a9c4;">
                A manutenção da <strong style="color:#eaf2fb;">${storeName}</strong> terminou.
                Você pediu para ser avisado e aqui está: já pode comprar, acompanhar seus pedidos
                e aproveitar as novidades.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 8px 32px;text-align:center;">
              <a href="${button}" style="display:inline-block;padding:14px 26px;border-radius:14px;background:#38bdf8;color:#06121a;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;text-decoration:none;">
                Voltar para a loja
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 28px 32px;text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">
                Você recebeu este e-mail porque cadastrou seu endereço na página de manutenção.
                Dúvidas? Fale com a gente em
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#7dd3fc;text-decoration:none;">${SUPPORT_EMAIL}</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderBackOnlineText(storeName: string, storeUrl: string) {
  const url = `${storeUrl.replace(/\/$/, "")}/loja`;
  return [
    `${storeName} — a loja voltou ao ar!`,
    "",
    "A manutenção terminou e já pode comprar, acompanhar seus pedidos e aproveitar as novidades.",
    "",
    `Acesse: ${url}`,
    "",
    `Você recebeu este e-mail porque cadastrou seu endereço na página de manutenção. Dúvidas: ${SUPPORT_EMAIL}.`,
  ].join("\n");
}

/** Envia um e-mail pela Resend tentando todos os remetentes disponíveis. */
async function sendEmail(to: string, subject: string, html: string, text: string, storeName: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada");

  const failures: string[] = [];
  for (const from of resendFromCandidates(storeName)) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (response.ok) return true;
    failures.push(`"${from}" -> ${response.status} ${await response.text()}`);
  }
  throw new Error(`Resend falhou em todos os remetentes: ${failures.join(" | ")}`);
}

/** Avisa por e-mail todos os cadastrados que ainda não foram avisados. */
export const notifyAll = internalAction({
  args: {
    storeName: v.optional(v.string()),
    storeUrl: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { storeName, storeUrl }: { storeName?: string; storeUrl?: string },
  ): Promise<{ sent: number; failed: number; remaining: number }> => {
    const name = storeName?.trim() || "Apollo Craft";
    const url = storeUrl?.trim() || "https://apollocraft.online";

    const pending: Array<{ id: string; email: string }> = await ctx.runQuery(
      internal.maintenance.pending,
      {},
    );
    if (pending.length === 0) return { sent: 0, failed: 0, remaining: 0 };

    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY não configurada: aviso de retorno não enviado.");
      return { sent: 0, failed: 0, remaining: pending.length };
    }

    const subject = `${name} voltou ao ar ✅`;
    const html = renderBackOnlineEmail({ storeName: name, storeUrl: url });
    const text = renderBackOnlineText(name, url);

    const batch = pending.slice(0, MAX_PER_RUN);
    const sentIds: string[] = [];
    let failed = 0;

    for (const subscriber of batch) {
      try {
        await sendEmail(subscriber.email, subject, html, text, name);
        sentIds.push(subscriber.id);
      } catch (error) {
        failed++;
        console.error(`Falha ao avisar ${subscriber.email}:`, error);
      }
    }

    if (sentIds.length > 0) {
      await ctx.runMutation(internal.maintenance.markNotified, { ids: sentIds as any });
    }

    return { sent: sentIds.length, failed, remaining: pending.length - sentIds.length };
  },
});
