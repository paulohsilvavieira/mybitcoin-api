import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { PasswordResetTokenRepository } from '@/modules/identity/domain/repositories/password-reset-token.repository';
import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';
import { ActiveResetTokenExistsError } from '@/modules/identity/domain/errors/active-reset-token-exists.error';
import { InvalidResetTokenError } from '@/modules/identity/domain/errors/invalid-reset-token.error';
import {
  PasswordResetTokenMapper,
  PasswordResetTokenRow,
} from '@/modules/identity/infrastructure/persistence/password-reset-token.mapper';
import {
  insertPasswordResetTokenQuery,
  consumePasswordResetTokenByIdQuery,
  findPasswordResetTokenByHashQuery,
  consumeActivePasswordResetTokensForUserQuery,
} from '@/modules/identity/infrastructure/persistence/password-reset-token.sql';

export class PgPasswordResetTokenRepository extends PasswordResetTokenRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async save(token: PasswordResetToken): Promise<void> {
    const row = PasswordResetTokenMapper.toRow(token);
    const { query, values } = insertPasswordResetTokenQuery(row);
    const result = await this.db.query(query, values);
    // GAP-4: ON CONFLICT ... DO NOTHING — rowCount 0 significa que já existe um
    // token ativo para o usuário (corrida). Convenção de erro tipado.
    if (result.rowCount === 0) {
      throw new ActiveResetTokenExistsError();
    }
  }

  async consume(token: PasswordResetToken): Promise<void> {
    const { query, values } = consumePasswordResetTokenByIdQuery(
      token.id,
      token.consumedAt ?? new Date(),
    );
    const result = await this.db.query(query, values);
    // A query tem `WHERE consumed_at IS NULL`: rowCount 0 significa que outra
    // transação concorrente já consumiu este mesmo token. Aborta o redeem (o
    // UnitOfWork faz ROLLBACK) em vez de trocar a senha duas vezes.
    if (result.rowCount === 0) {
      throw new InvalidResetTokenError();
    }
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const { query, values } = findPasswordResetTokenByHashQuery(tokenHash);
    const result = await this.db.query<PasswordResetTokenRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return PasswordResetTokenMapper.toDomain(result.rows[0]);
  }

  async consumeAllActiveForUser(userId: string): Promise<void> {
    const { query, values } =
      consumeActivePasswordResetTokensForUserQuery(userId);
    await this.db.query(query, values);
  }
}
