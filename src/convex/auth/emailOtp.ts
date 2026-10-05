import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/** Marca da loja usada nos e-mails de acesso. */
const APP_NAME = "Apollo Craft";
const SUPPORT_EMAIL = "suporte@apollocraft.online";
const EXPIRES_MINUTES = 15;

type OtpEmailArgs = {
  appName: string;
  code: string;
  expiresMinutes: number;
};

/**
 * Template HTML do e-mail de acesso — pt-BR, tema navy + azul sky da Apollo
 * Craft. Escrito com estilos inline e tabelas para funcionar nos principais
 * clientes de e-mail (Gmail, Outlook, iOS Mail).
 */
function renderOtpEmail({ appName, code, expiresMinutes }: OtpEmailArgs) {
  const digits = code
    .split("")
    .map(
      (d) =>
        `<td style="padding:0 4px;"><span style="display:inline-block;min-width:38px;padding:12px 10px;border:1px solid rgba(56,189,248,0.35);border-radius:12px;background:#0f172a;color:#e6f6ff;font-family:'Courier New',monospace;font-size:26px;font-weight:700;letter-spacing:2px;text-align:center;">${d}</span></td>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Seu código de acesso</title>
</head>
<body style="margin:0;padding:0;background:#070d16;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070d16;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0c1420;border:1px solid rgba(56,189,248,0.18);border-radius:20px;overflow:hidden;">
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#0ea5e9,#38bdf8,#0ea5e9);"></td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px 32px;text-align:center;">
              <div style="display:inline-block;padding:10px 14px;border-radius:14px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);color:#38bdf8;font-size:22px;">&#9993;</div>
              <h1 style="margin:22px 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#eaf2fb;font-weight:800;">
                Seu código de acesso
              </h1>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#94a9c4;">
                Use o código abaixo para entrar na <strong style="color:#eaf2fb;">${appName}</strong>.
                Digite-o na tela de verificação que está aberta no seu navegador.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:26px 20px 6px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>${digits}</tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 4px 32px;text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#f0b429;">
                &#9200; Este código expira em ${expiresMinutes} minutos.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 32px 32px;text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6f839f;">
                Se você não solicitou este código, pode ignorar este e-mail com segurança —
                ninguém conseguirá entrar na sua conta sem ele.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#080f1a;border-top:1px solid rgba(56,189,248,0.12);text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6f839f;">
                ${appName} &middot; <a href="mailto:${SUPPORT_EMAIL}" style="color:#38bdf8;text-decoration:none;">${SUPPORT_EMAIL}</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#4a5b74;">
          Enviado automaticamente. Não responda diretamente a este e-mail para dúvidas de acesso.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Envia o código pela API da Resend (REST simples, sem SDK). */
async function sendWithResend(to: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from =
    process.env.RESEND_FROM || `${APP_NAME} <onboarding@resend.dev>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${code} é o seu código de acesso à ${APP_NAME}`,
      html: renderOtpEmail({
        appName: APP_NAME,
        code,
        expiresMinutes: EXPIRES_MINUTES,
      }),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend falhou (${response.status}): ${body}`);
  }

  return true;
}

/** Serviço de e-mail do Freebuff — usado apenas como fallback. */
async function sendWithFreebuff(to: string, code: string) {
  await axios.post(
    "https://auth.freebuff.app/send_otp",
    { to, otp: code, appName: APP_NAME },
    { headers: { "x-api-key": "fb_email_2crN1hqIArZP2bEfvjp5Qik4" } },
  );
}

export const emailOtp = Email({
  id: "email-otp",
  maxAge: EXPIRES_MINUTES * 60, // 15 minutos
  // Este código aleatório é o OTP de 6 dígitos.
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    // E-mail próprio, em português e com a marca da loja, quando a Resend
    // estiver configurada (RESEND_API_KEY nas variáveis de ambiente).
    try {
      if (await sendWithResend(email, token)) return;
    } catch (error) {
      // Nunca bloqueia o login por causa de um envio próprio: registra e cai
      // no serviço de fallback abaixo.
      console.error("Falha ao enviar OTP pela Resend:", error);
    }

    try {
      await sendWithFreebuff(email, token);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : JSON.stringify(error),
      );
    }
  },
});
