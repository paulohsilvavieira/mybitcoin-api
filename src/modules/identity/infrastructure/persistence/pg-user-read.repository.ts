import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { UserReadRepository } from '@/modules/identity/domain/repositories';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import {
  UserMapper,
  UserRow,
} from '@/modules/identity/infrastructure/persistence/user.mapper';
import {
  findUserByIdQuery,
  findUserByEmailQuery,
} from '@/modules/identity/infrastructure/persistence/user.sql';

export class PgUserReadRepository extends UserReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    const { query, values } = findUserByIdQuery(id);
    const result = await this.db.query<UserRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return UserMapper.toDomain(result.rows[0]);
  }

  async findByEmail(email: Email): Promise<User | null> {
    const { query, values } = findUserByEmailQuery(email.toString());
    const result = await this.db.query<UserRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return UserMapper.toDomain(result.rows[0]);
  }
}
