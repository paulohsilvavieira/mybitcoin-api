import { createHash } from 'node:crypto';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import { SessionRepository } from '@/modules/identity/domain/repositories/session.repository';
import { SessionNotFoundError } from '@/modules/identity/domain/errors/session-not-found.error';
import { SessionExpiredError } from '@/modules/identity/domain/errors/session-expired.error';

export interface ValidateSessionInput {
  token: string;
}

export interface ValidateSessionOutput {
  session: Session;
}

export class ValidateSession {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async execute(input: ValidateSessionInput): Promise<ValidateSessionOutput> {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');

    const session = await this.sessionRepo.findByTokenHash(tokenHash);
    if (!session) {
      throw new SessionNotFoundError('unknown');
    }

    if (!session.isActive()) {
      throw new SessionExpiredError(session.id.toString());
    }

    session.touch();
    await this.sessionRepo.touch(session.id.toString(), session.lastActivityAt);

    return { session };
  }
}
