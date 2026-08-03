import { DomainError } from '@/shared/domain.error';

/**
 * Violação de invariante: uma sessão válida não pode existir sem o usuário
 * correspondente. Mapeado a 401 (não 404) em `DomainErrorFilter` — força
 * re-autenticação em vez de expor estado inconsistente como 404 de negócio.
 *
 * O `userId` existe apenas para log estruturado; a mensagem é estática.
 */
export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';

  constructor(readonly userId: string) {
    super('User not found');
  }
}
