import { DomainError } from '@/shared/domain.error';

export class AssetInactiveError extends DomainError {
  readonly code = 'ASSET_INACTIVE';

  constructor(symbol: string) {
    super(`Asset '${symbol}' is inactive`);
  }
}
