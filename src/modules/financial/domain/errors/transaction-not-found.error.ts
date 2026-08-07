import { DomainError } from '@/shared/domain.error';

export class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  constructor(readonly transactionId: string) {
    super(`Transaction '${transactionId}' not found`);
  }
}
