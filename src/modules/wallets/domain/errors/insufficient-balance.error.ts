import { DomainError } from '@/shared/domain.error';

export class InsufficientBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE';

  constructor(
    readonly asset: string,
    readonly availableMinor: bigint,
    readonly requestedMinor: bigint,
  ) {
    super(
      `Insufficient available balance for ${asset}: have ${availableMinor}, need ${requestedMinor}`,
    );
  }
}
