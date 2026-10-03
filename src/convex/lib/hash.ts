import { sha256 } from "@oslojs/crypto/sha2";
import { encodeHexLowerCase } from "@oslojs/encoding";

// ─────────────────────────────────────────────────────────────
// Hash e tokens da API v1.
// Usamos SHA-256 puro do @oslojs/crypto (roda no runtime V8 do Convex
// e no Node), então o hash é determinístico em qualquer ambiente.
// A API Key NUNCA é armazenada em texto puro: guardamos apenas o hash.
// ─────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/** SHA-256 em hexadecimal (minúsculo). */
export function sha256Hex(input: string): string {
  return encodeHexLowerCase(sha256(encoder.encode(input)));
}

const TOKEN_PREFIX = "sk_live_";
const TOKEN_BYTES = 32; // 64 caracteres hex

/** Gera um token criptograficamente seguro: sk_live_<64 hex>. */
export function generateApiToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${TOKEN_PREFIX}${hex}`;
}

/** Prefixo público (para exibir/identificar a chave sem revelá-la). */
export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 8); // ex.: sk_live_a1b2c3d4
}

/** Últimos 4 caracteres do token. */
export function tokenLastFour(token: string): string {
  return token.slice(-4);
}

/** ID público global de uma entrega (ex.: del_01J...). */
export function generateDeliveryId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `del_${Date.now().toString(36)}${rand}`;
}

/** Token de claim (reserva de entregas). */
export function generateClaimToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `clm_${rand}`;
}
