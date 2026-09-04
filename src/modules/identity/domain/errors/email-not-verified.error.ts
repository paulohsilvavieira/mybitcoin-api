import { DomainError } from '@/shared/domain.error';

/**
 * O `userId` existe apenas para log estruturado — a mensagem exposta
 * ao cliente é estática e NÃO contém o UUID interno do agregado.
 * Mesmo padrão de `AccountSuspendedError` (ADR 0005).
 */
export class EmailNotVerifiedError extends DomainError {
  readonly code = 'EMAIL_NOT_VERIFIED';

  constructor(readonly userId: string) {
    super('Please verify your email before logging in');
  }
}
