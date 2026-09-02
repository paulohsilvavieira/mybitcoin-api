import { DomainError } from '@/shared/domain.error';

export class InvalidFullNameError extends DomainError {
  readonly code = 'INVALID_FULL_NAME';

  constructor(reason: string) {
    super(`Invalid full name: ${reason}`);
  }
}
