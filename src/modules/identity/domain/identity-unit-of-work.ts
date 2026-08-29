import { UserRepository } from '@/modules/identity/domain/repositories/user.repository';
import { SessionRepository } from '@/modules/identity/domain/repositories/session.repository';
import { LoginAttemptRepository } from '@/modules/identity/domain/repositories/login-attempt.repository';
import { PasswordResetTokenRepository } from '@/modules/identity/domain/repositories/password-reset-token.repository';

/**
 * UnitOfWork do bounded context `identity`.
 *
 * Evolução do ADR 0001: mantém a filosofia de interface fixa e não-genérica,
 * mas **por módulo** — `src/shared/unit-of-work.ts` continua acoplado a
 * `financial` e não é tocado. Necessário porque o redeem de senha (ADR 0006)
 * escreve atomicamente em `users`, `password_reset_tokens`, `sessions` e
 * `login_attempts`.
 */
export interface IdentityRepositories {
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  passwordResetTokenRepo: PasswordResetTokenRepository;
  loginAttemptRepo: LoginAttemptRepository;
}

export abstract class IdentityUnitOfWork {
  abstract run<T>(fn: (repos: IdentityRepositories) => Promise<T>): Promise<T>;
}
