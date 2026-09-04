import { DomainError } from '@/shared/domain.error';

export class AssetNotSupportedError extends DomainError {
  readonly code = 'ASSET_NOT_SUPPORTED';

  constructor(readonly symbol: string) {
    super(`Asset '${symbol}' is not supported or is inactive`);
  }
}
