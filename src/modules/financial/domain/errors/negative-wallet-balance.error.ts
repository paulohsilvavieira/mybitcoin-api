import { DomainError } from '@/shared/domain.error';

export class NegativeWalletBalanceError extends DomainError {
  readonly code = 'NEGATIVE_WALLET_BALANCE';

  constructor(readonly amountSatoshi: bigint) {
    super(`Wallet balance cannot be negative, got ${amountSatoshi}`);
  }
}
