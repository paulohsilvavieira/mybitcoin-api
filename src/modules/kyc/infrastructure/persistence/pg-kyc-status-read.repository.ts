import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { KycStatusReadRepository } from '@/modules/kyc/domain/repositories/kyc-status-read.repository';

interface StatusRow {
  status: 'APPROVED' | 'REJECTED';
}

export class PgKycStatusReadRepository extends KycStatusReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findStatusByUserId(
    userId: string,
  ): Promise<'APPROVED' | 'REJECTED' | null> {
    const result = await this.db.query<StatusRow>(
      `SELECT status FROM kyc_profiles WHERE user_id = $1`,
      [userId],
    );
    return result.rows.length > 0 ? result.rows[0].status : null;
  }
}
