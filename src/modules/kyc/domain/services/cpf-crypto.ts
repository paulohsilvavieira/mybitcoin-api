/**
 * Porta de domínio para as operações criptográficas sobre o CPF.
 *
 * - `hash`: deterministico (SHA-256 com pepper) — usado no índice único e no
 *   lookup de duplicidade.
 * - `encrypt` / `decrypt`: AES-256-GCM — permite recuperar o CPF para compliance
 *   sem mantê-lo em claro no banco.
 *
 * A implementação vive na infraestrutura (`NodeCpfCrypto`). O domínio nunca
 * conhece as chaves.
 */
export abstract class CpfCrypto {
  /** Recebe apenas dígitos (11). Retorna hash hex. */
  abstract hash(cpfDigits: string): string;

  /** Recebe apenas dígitos (11). Retorna payload `base64(iv).base64(tag).base64(ct)`. */
  abstract encrypt(cpfDigits: string): string;

  /** Inverso de `encrypt`. Retorna os 11 dígitos. */
  abstract decrypt(payload: string): string;
}
