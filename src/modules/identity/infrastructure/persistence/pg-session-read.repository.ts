import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { SessionReadRepository } from '@/modules/identity/domain/repositories';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import {
  SessionMapper,
  SessionRow,
} from '@/modules/identity/infrastructure/persistence/session.mapper';
import {
  findSessionByIdQuery,
  findSessionByTokenHashQuery,
  findNonExpiredSessionsByUserIdQuery,
} from '@/modules/identity/infrastructure/persistence/session.sql';

export class PgSessionReadRepository extends SessionReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
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
}
