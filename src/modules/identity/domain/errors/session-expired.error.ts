import { DomainError } from '@/shared/domain.error';

export class SessionExpiredError extends DomainError {
  readonly code = 'SESSION_EXPIRED';

  constructor(sessionId: string) {
    super(`Session '${sessionId}' is expired or revoked`);
  }
}
