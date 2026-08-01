import { DomainError } from '@/shared/domain.error';

export class SessionNotFoundError extends DomainError {
  readonly code = 'SESSION_NOT_FOUND';

  constructor(sessionId: string) {
    super(`Session '${sessionId}' not found`);
  }
}
