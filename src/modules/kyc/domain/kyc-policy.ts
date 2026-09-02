/**
 * Política de KYC — constantes de domínio (ADR 0007).
 *
 * KYC-005 diz "maior de idade (configurável)". Decisão do ADR: constante fixa
 * agora; promover a env var depois é trivial e não muda schema.
 */
export const MINIMUM_KYC_AGE = 18;

/** Idade máxima plausível — acima disso a data de nascimento é considerada inválida. */
export const MAXIMUM_PLAUSIBLE_AGE = 120;
