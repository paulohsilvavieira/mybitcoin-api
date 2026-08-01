import { SessionRepository } from '@/modules/identity/domain/repositories/session.repository';
import {
  SessionRevoked,
  SessionRevokedReason,
} from '@/modules/identity/domain/events/session-revoked.event';

export interface RevokeAllSessionsInput {
  userId: string;
  reason: SessionRevokedReason;
}

export interface RevokeAllSessionsOutput {
  events: SessionRevoked[];
}

export class RevokeAllSessions {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async execute(
    input: RevokeAllSessionsInput,
  ): Promise<RevokeAllSessionsOutput> {
    const activeSessions = await this.sessionRepo.findActiveByUserId(
      input.userId,
    );

    await this.sessionRepo.revokeAll(input.userId);

    const events = activeSessions.map(
      (session) =>
        new SessionRevoked(session.id.toString(), input.userId, input.reason),
    );

    return { events };
  }
}
