// ─────────────────────────────────────────────────────────────
// Gerador de BR Code (PIX copia e cola) — padrão EMV do Banco Central
// Usado pelo gateway Nubank: gera um PIX estático dinâmico com a chave
// PIX da conta Nubank do lojista + valor + referência do pedido.
// Funciona com qualquer chave PIX (a interoperabilidade do Pix garante
// que clientes de qualquer banco, incluindo Nubank, consigam pagar).
// ─────────────────────────────────────────────────────────────

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC16/CCITT-FALSE — obrigatório no final do BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(text: string, max: number): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

/**
 * Gera o código PIX copia e cola.
 * @param key chave PIX (CPF, e-mail, telefone +55..., EVP/UUID ou aleatória)
 * @param merchantName nome do recebedor
 * @param city cidade do recebedor
 * @param amountCents valor em centavos (0 = valor livre)
 * @param txid identificador do pedido (letras, números e hífen, máx 25)
 */
export function generatePixBrcode(opts: {
  key: string;
  merchantName: string;
  merchantCity: string;
  amountCents?: number;
  txid?: string;
}): string {
  const { key, merchantName, merchantCity, amountCents = 0, txid = "***" } = opts;

  // MAI (id 26): domínio gui.gov.br + chave
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", key);

  const payload =
    tlv("00", "01") + // payload format indicator
    tlv("01", "12") + // 12 = QR reutilizável... na verdade "12" indica uso único quando presente; usamos dinâmico
    tlv("26", mai) +
    tlv("52", "0000") + // merchant category code
    tlv("53", "986") + // BRL
    (amountCents > 0 ? tlv("54", (amountCents / 100).toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", sanitize(merchantName, 25) || "LOJA") +
    tlv("60", sanitize(merchantCity, 15) || "SAO PAULO") +
    tlv("62", tlv("05", sanitize(txid, 25).replace(/[^A-Za-z0-9-]/g, "") || "***")) +
    "6304";

  return payload + crc16(payload);
}
