/**
 * Fotografia dos dados de uma submissão de KYC, já em forma persistível.
 *
 * `cpfHash` / `cpfEncrypted` são produzidos por `CpfCrypto` na camada de
 * aplicação — o domínio os trata como valores opacos.
 */
export interface KycSnapshot {
  fullName: string;
  cpfHash: string;
  cpfEncrypted: string;
  cpfLastDigits: string;
  /** Data ISO YYYY-MM-DD. */
  birthDate: string;
  /** Código ISO 3166-1 alpha-2. */
  nationality: string;
}
