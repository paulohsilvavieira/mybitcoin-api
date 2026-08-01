import { Session } from '@/modules/identity/domain/entities/session.entity';

export abstract class SessionRepository {
  abstract create(session: Session): Promise<void>;
  abstract findById(sessionId: string): Promise<Session | null>;
  abstract findByTokenHash(tokenHash: string): Promise<Session | null>;
  abstract findActiveByUserId(userId: string): Promise<Session[]>;
  abstract revoke(sessionId: string): Promise<void>;
  abstract revokeAll(userId: string): Promise<void>;
  abstract touch(sessionId: string, lastActivityAt: Date): Promise<void>;
}
