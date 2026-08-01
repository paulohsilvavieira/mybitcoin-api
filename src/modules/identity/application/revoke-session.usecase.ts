import { SessionRepository } from '@/modules/identity/domain/repositories/session.repository';
import { SessionNotFoundError } from '@/modules/identity/domain/errors/session-not-found.error';
import { SessionAlreadyRevokedError } from '@/modules/identity/domain/errors/session-already-revoked.error';
import { SessionRevoked } from '@/modules/identity/domain/events/session-revoked.event';

export interface RevokeSessionInput {
  sessionId: string;
  requestingUserId: string;
}

export interface RevokeSessionOutput {
  event: SessionRevoked;
}

export class RevokeSession {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async execute(input: RevokeSessionInput): Promise<RevokeSessionOutput> {
    const session = await this.sessionRepo.findById(input.sessionId);

    if (!session || session.userId !== input.requestingUserId) {
      throw new SessionNotFoundError(input.sessionId);
    }

    if (session.revokedAt !== null) {
      throw new SessionAlreadyRevokedError(input.sessionId);
    }

    await this.sessionRepo.revoke(input.sessionId);

    const event = new SessionRevoked(
      input.sessionId,
      session.userId,
      'user_requested',
    );

    return { event };
  }
}
