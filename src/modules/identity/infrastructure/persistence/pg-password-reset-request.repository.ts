import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { PasswordResetRequestRepository } from '@/modules/identity/domain/repositories/password-reset-request.repository';
import { PasswordResetRequest } from '@/modules/identity/domain/entities/password-reset-request.entity';
import {
  insertPasswordResetRequestQuery,
  countPasswordResetRequestsSinceQuery,
} from '@/modules/identity/infrastructure/persistence/password-reset-request.sql';

interface CountRow {
  count: number;
}

export class PgPasswordResetRequestRepository extends PasswordResetRequestRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async record(request: PasswordResetRequest): Promise<void> {
    const { query, values } = insertPasswordResetRequestQuery({
      email: request.email,
      ipAddress: request.ipAddress,
      userFound: request.userFound,
      createdAt: request.createdAt,
    });
    await this.db.query(query, values);
  }

  async countSince(email: string, since: Date): Promise<number> {
    const { query, values } = countPasswordResetRequestsSinceQuery(
      email,
      since,
    );
    const result = await this.db.query<CountRow>(query, values);
    return result.rows[0].count;
  }
}
