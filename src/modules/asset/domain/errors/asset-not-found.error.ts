import { DomainError } from '@/shared/domain.error';

export class AssetNotFoundError extends DomainError {
  readonly code = 'ASSET_NOT_FOUND';

  constructor(symbol: string) {
    super(`Asset '${symbol}' not found`);
  }
}
