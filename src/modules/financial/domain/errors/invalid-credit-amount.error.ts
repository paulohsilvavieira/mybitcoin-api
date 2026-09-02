import { DomainError } from '@/shared/domain.error';

export class InvalidCreditAmountError extends DomainError {
  readonly code = 'INVALID_CREDIT_AMOUNT';

  constructor(readonly amountSatoshi: bigint) {
    super(`Credit amount must be positive, got ${amountSatoshi}`);
  }
}
