import { DomainError } from '@/shared/domain.error';

/**
 * Erro genérico usado tanto para token nunca existente/já sobrescrito
 * (VER-001) quanto para token de conta SUSPENDED (ADR 0006, Emenda gap 1)
 * — não revela ao portador do token que a conta está suspensa.
 */
export class EmailVerificationTokenInvalidError extends DomainError {
  readonly code = 'EMAIL_VERIFICATION_TOKEN_INVALID';

  constructor() {
    super('Invalid or already used verification token');
  }
}
