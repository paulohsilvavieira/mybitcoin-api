import { Session } from '@/modules/identity/domain/entities/session.entity';

export abstract class SessionReadRepository {
  abstract findById(sessionId: string): Promise<Session | null>;
  abstract findByTokenHash(tokenHash: string): Promise<Session | null>;
  abstract findActiveByUserId(userId: string): Promise<Session[]>;
}
