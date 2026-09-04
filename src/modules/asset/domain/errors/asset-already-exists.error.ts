import { DomainError } from '@/shared/domain.error';

export class AssetAlreadyExistsError extends DomainError {
  readonly code = 'ASSET_ALREADY_EXISTS';

  constructor(symbol: string) {
    super(`Asset '${symbol}' already exists`);
  }
}
