import { createHash } from 'node:crypto';
import { SessionRepository } from '@/modules/identity/domain/repositories/session.repository';
import { SessionRevoked } from '@/modules/identity/domain/events/session-revoked.event';

export interface LogoutInput {
  token: string | undefined;
}

export interface LogoutOutput {
  event: SessionRevoked | null;
}

/**
 * OUT-001/OUT-003 — totalmente idempotente: token ausente, desconhecido ou de
 * sessão já revogada não lança erro, apenas retorna `event: null`.
 */
export class Logout {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async execute(input: LogoutInput): Promise<LogoutOutput> {
    if (!input.token) {
      return { event: null };
    }

    const tokenHash = createHash('sha256').update(input.token).digest('hex');

    const session = await this.sessionRepo.findByTokenHash(tokenHash);
    if (!session || session.revokedAt !== null) {
      return { event: null };
    }

    await this.sessionRepo.revoke(session.id.toString());

    return {
      event: new SessionRevoked(
        session.id.toString(),
        session.userId,
        'user_requested',
      ),
    };
  }
}
