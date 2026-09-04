import { DomainError } from '@/shared/domain.error';

export class AdminAccessDeniedError extends DomainError {
  readonly code = 'ADMIN_ACCESS_DENIED';

  constructor() {
    super('Administrator access required');
  }
}
