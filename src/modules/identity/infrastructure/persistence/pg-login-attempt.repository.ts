import { randomUUID } from 'node:crypto';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import {
  LoginAttemptRepository,
  FailedLoginAttemptsSummary,
} from '@/modules/identity/domain/repositories/login-attempt.repository';
import { LoginAttempt } from '@/modules/identity/domain/entities/login-attempt.entity';
import {
  insertLoginAttemptQuery,
  countFailedLoginAttemptsSinceLastSuccessQuery,
} from '@/modules/identity/infrastructure/persistence/login-attempt.sql';

interface CountRow {
  count: number;
  most_recent_failure_at: Date | null;
}

export class PgLoginAttemptRepository extends LoginAttemptRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async record(attempt: LoginAttempt): Promise<void> {
    const { query, values } = insertLoginAttemptQuery({
      id: randomUUID(),
      userId: attempt.userId,
      email: attempt.email,
      ipAddress: attempt.ipAddress,
      successful: attempt.successful,
      createdAt: attempt.createdAt,
    });
    await this.db.query(query, values);
  }

  async countFailedSinceLastSuccess(
    email: string,
  ): Promise<FailedLoginAttemptsSummary> {
    const { query, values } =
      countFailedLoginAttemptsSinceLastSuccessQuery(email);
    const result = await this.db.query<CountRow>(query, values);
    const row = result.rows[0];
    return {
      count: row?.count ?? 0,
      mostRecentFailureAt: row?.most_recent_failure_at ?? null,
    };
  }
}
