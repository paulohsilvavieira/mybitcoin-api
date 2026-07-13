import { QueryExecutor } from '../../../../infrastructure/database/query-executor';
import { UserRepository } from '../../domain/repositories/user.repository';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { UserMapper, UserRow } from './user.mapper';
import {
  findUserByIdQuery,
  findUserByEmailQuery,
  saveUserQuery,
} from './user.sql';

export class PgUserRepository extends UserRepository {
  constructor(private readonly db: QueryExecutor) {
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

  async save(user: User): Promise<void> {
    const row = UserMapper.toRow(user);
    const { query, values } = saveUserQuery(row);
    await this.db.query(query, values);
  }
}
