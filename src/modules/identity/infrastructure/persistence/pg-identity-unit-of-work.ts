import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/infrastructure/database/database.service';
import {
  IdentityUnitOfWork,
  IdentityRepositories,
} from '@/modules/identity/domain/identity-unit-of-work';
import { PgUserRepository } from '@/modules/identity/infrastructure/persistence/pg-user.repository';
import { PgSessionRepository } from '@/modules/identity/infrastructure/persistence/pg-session.repository';
import { PgPasswordResetTokenRepository } from '@/modules/identity/infrastructure/persistence/pg-password-reset-token.repository';
import { PgLoginAttemptRepository } from '@/modules/identity/infrastructure/persistence/pg-login-attempt.repository';

/**
 * Implementação Postgres do `IdentityUnitOfWork` (ADR 0006). Espelha o
 * `PostgresUnitOfWork` de financial: monta as 4 repos sobre o mesmo
 * `QueryExecutor` transacional de `DatabaseService.runInTransaction`, garantindo
 * rollback atômico do redeem de senha (users + password_reset_tokens +
 * sessions + login_attempts).
 */
@Injectable()
export class PgIdentityUnitOfWork extends IdentityUnitOfWork {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async run<T>(fn: (repos: IdentityRepositories) => Promise<T>): Promise<T> {
    return this.db.runInTransaction(async (tx) => {
      const repositories: IdentityRepositories = {
        userRepo: new PgUserRepository(tx),
        sessionRepo: new PgSessionRepository(tx),
        passwordResetTokenRepo: new PgPasswordResetTokenRepository(tx),
        loginAttemptRepo: new PgLoginAttemptRepository(tx),
      };
      return fn(repositories);
    });
  }
}
