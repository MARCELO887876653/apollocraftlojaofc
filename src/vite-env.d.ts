/// <reference types="vite/client" />

/**
 * Endereço do Convex resolvido em tempo de build por `vite.config.ts`.
 *
 * Nunca contém um deployment aposentado nem fica vazio: o config resolve
 * `VITE_CONVEX_URL` e, se ela estiver ausente ou morta, grava o deployment
 * desta loja. É por isso que o app não precisa mais tentar o endereço antigo
 * para descobrir que ele não responde.
 */
declare const __CONVEX_BUILD_URL__: string;
