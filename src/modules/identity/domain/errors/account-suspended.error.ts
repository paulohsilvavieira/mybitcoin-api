import { DomainError } from '@/shared/domain.error';

/**
 * O `userId` existe apenas para log estruturado (LOG-005) — a mensagem exposta
 * ao cliente é estática e NÃO contém o UUID interno do agregado.
 */
export class AccountSuspendedError extends DomainError {
  readonly code = 'ACCOUNT_SUSPENDED';

  constructor(readonly userId: string) {
    super('This account has been suspended');
  }
}
