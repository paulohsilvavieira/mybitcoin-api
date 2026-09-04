import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { UserRepository } from '@/modules/identity/domain/repositories';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import {
  UserMapper,
  UserRow,
} from '@/modules/identity/infrastructure/persistence/user.mapper';
import {
  findUserByIdQuery,
  findUserByEmailQuery,
  findUserByEmailVerificationTokenHashQuery,
  issueEmailVerificationTokenIfDueQuery,
  saveUserQuery,
} from '@/modules/identity/infrastructure/persistence/user.sql';

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

  async findByEmailVerificationTokenHash(
    tokenHash: string,
  ): Promise<User | null> {
    const { query, values } =
      findUserByEmailVerificationTokenHashQuery(tokenHash);
    const result = await this.db.query<UserRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return UserMapper.toDomain(result.rows[0]);
  }

  async issueEmailVerificationTokenIfDue(params: {
    email: Email;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMs: number;
  }): Promise<User | null> {
    const cooldownThreshold = new Date(
      params.now.getTime() - params.cooldownMs,
    );
    const { query, values } = issueEmailVerificationTokenIfDueQuery({
      email: params.email.toString(),
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      now: params.now,
      cooldownThreshold,
    });
    const result = await this.db.query<UserRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return UserMapper.toDomain(result.rows[0]);
  }
}
