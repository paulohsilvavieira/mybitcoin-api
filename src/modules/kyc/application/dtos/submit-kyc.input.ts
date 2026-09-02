export interface SubmitKycInput {
  userId: string;
  fullName: string;
  /** CPF como recebido (com ou sem máscara). */
  cpf: string;
  /** Data ISO YYYY-MM-DD. */
  birthDate: string;
  /** Código de país (ISO 3166-1 alpha-2, case-insensitive na entrada). */
  nationality: string;
  /** IP de origem da submissão — auditoria (KYC-006). */
  ip: string;
}
