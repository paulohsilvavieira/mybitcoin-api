import { DomainError } from '@/shared/domain.error';

export class InvalidAmountError extends DomainError {
  readonly code = 'INVALID_AMOUNT';

  constructor(
    readonly asset: string,
    readonly amountMinor: bigint,
    detail = 'amount must be a positive integer in the asset minor unit',
  ) {
    super(`Invalid amount for ${asset} (${amountMinor}): ${detail}`);
  }
}
