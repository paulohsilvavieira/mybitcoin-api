import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { AdministratorReadRepository } from '@/modules/identity/domain/repositories';
import { Administrator } from '@/modules/identity/domain/entities/administrator.entity';
import {
  AdministratorMapper,
  AdministratorRow,
} from '@/modules/identity/infrastructure/persistence/administrator.mapper';
import { findAdministratorByUserIdQuery } from '@/modules/identity/infrastructure/persistence/administrator.sql';

export class PgAdministratorReadRepository extends AdministratorReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findByUserId(userId: string): Promise<Administrator | null> {
    const { query, values } = findAdministratorByUserIdQuery(userId);
    const result = await this.db.query<AdministratorRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return AdministratorMapper.toDomain(result.rows[0]);
  }
}
