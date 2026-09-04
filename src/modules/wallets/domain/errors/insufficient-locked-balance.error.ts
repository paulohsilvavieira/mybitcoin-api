import { DomainError } from '@/shared/domain.error';

export class InsufficientLockedBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_LOCKED_BALANCE';

  constructor(
    readonly asset: string,
    readonly lockedMinor: bigint,
    readonly requestedMinor: bigint,
  ) {
    super(
      `Insufficient locked balance for ${asset}: have ${lockedMinor}, need ${requestedMinor}`,
    );
  }
}
