import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { SessionRepository } from '@/modules/identity/domain/repositories/session.repository';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import {
  SessionMapper,
  SessionRow,
} from '@/modules/identity/infrastructure/persistence/session.mapper';
import {
  insertSessionQuery,
  findSessionByIdQuery,
  findSessionByTokenHashQuery,
  findNonExpiredSessionsByUserIdQuery,
  revokeSessionQuery,
  revokeAllSessionsQuery,
  touchSessionQuery,
} from '@/modules/identity/infrastructure/persistence/session.sql';

export class PgSessionRepository extends SessionRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async create(session: Session): Promise<void> {
    const row = SessionMapper.toRow(session);
    const { query, values } = insertSessionQuery(row);
    await this.db.query(query, values);
  }

  async findById(sessionId: string): Promise<Session | null> {
    const { query, values } = findSessionByIdQuery(sessionId);
    const result = await this.db.query<SessionRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return SessionMapper.toDomain(result.rows[0]);
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const { query, values } = findSessionByTokenHashQuery(tokenHash);
    const result = await this.db.query<SessionRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return SessionMapper.toDomain(result.rows[0]);
  }

  async findActiveByUserId(userId: string): Promise<Session[]> {
    const { query, values } = findNonExpiredSessionsByUserIdQuery(userId);
    const result = await this.db.query<SessionRow>(query, values);
    return result.rows
      .map((row) => SessionMapper.toDomain(row))
      .filter((session) => session.isActive());
  }

  async revoke(sessionId: string): Promise<void> {
    const { query, values } = revokeSessionQuery(sessionId);
    await this.db.query(query, values);
  }

  async revokeAll(userId: string): Promise<void> {
    const { query, values } = revokeAllSessionsQuery(userId);
    await this.db.query(query, values);
  }

  async touch(sessionId: string, lastActivityAt: Date): Promise<void> {
    const { query, values } = touchSessionQuery(sessionId, lastActivityAt);
    await this.db.query(query, values);
  }
}
