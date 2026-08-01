import { DomainError } from '@/shared/domain.error';

export class SessionAlreadyRevokedError extends DomainError {
  readonly code = 'SESSION_ALREADY_REVOKED';

  constructor(sessionId: string) {
    super(`Session '${sessionId}' is already revoked`);
  }
}
