import { DomainError } from '@/shared/domain.error';

export class InvalidAssetError extends DomainError {
  readonly code = 'INVALID_ASSET';

  constructor(reason: string) {
    super(`Invalid asset: ${reason}`);
  }
}
