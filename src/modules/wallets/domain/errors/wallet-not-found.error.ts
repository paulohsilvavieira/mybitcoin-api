import { DomainError } from '@/shared/domain.error';

export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND';

  constructor(readonly userId: string) {
    super(`Wallet for user '${userId}' not found`);
  }
}
