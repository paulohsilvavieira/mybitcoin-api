import { DomainError } from '@/shared/domain.error';

export class InvalidSatoshiAmountError extends DomainError {
  readonly code = 'INVALID_SATOSHI_AMOUNT';

  constructor(readonly amountSatoshi: bigint) {
    super(`Satoshi amount must be positive, got ${amountSatoshi}`);
  }
}
