import { User } from '@/modules/identity/domain/entities/user.entity';
import { UserRepository } from '@/modules/identity/domain/repositories';
import { LoginAttemptRepository } from '@/modules/identity/domain/repositories/login-attempt.repository';
import { LoginAttempt } from '@/modules/identity/domain/entities/login-attempt.entity';
import { LoginLockoutPolicy } from '@/modules/identity/domain/services/login-lockout-policy';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserStatusType } from '@/modules/identity/domain/value-objects/user-status.vo';
import { InvalidCredentialsError } from '@/modules/identity/domain/errors/invalid-credentials.error';
import { AccountSuspendedError } from '@/modules/identity/domain/errors/account-suspended.error';
import { TooManyLoginAttemptsError } from '@/modules/identity/domain/errors/too-many-login-attempts.error';

export interface LoginInput {
  email: string;
  password: string;
  ipAddress: string;
}

export interface LoginOutput {
  userId: string;
  name: string;
  email: string;
  status: UserStatusType;
}

/**
 * Valida credenciais (LOG-001/LOG-003) e aplica bloqueio por excesso de
 * tentativas (LOG-006). NÃO cria sessão — isso é orquestrado pelo controller
 * via `CreateSession` (ADR 0004).
 *
 * Usa `UserRepository` (escrita), nunca `UserReadRepository`: ler da réplica
 * arriscaria um falso `InvalidCredentialsError` por lag de replicação logo após
 * o cadastro (ADR 0003).
 */
export class Login {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly loginAttemptRepo: LoginAttemptRepository,
    private readonly comparePassword: (
      plain: string,
      hash: string,
    ) => Promise<boolean>,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const email = Email.create(input.email);
    const normalizedEmail = email.toString();

    const failedAttempts =
      await this.loginAttemptRepo.countFailedSinceLastSuccess(normalizedEmail);
    if (LoginLockoutPolicy.isLocked(failedAttempts)) {
      throw new TooManyLoginAttemptsError();
    }

    const user = await this.verifyCredentials(
      email,
      input.password,
      normalizedEmail,
      input.ipAddress,
    );

    if (user.status.isSuspended()) {
      // Conta suspensa não passa pelo contador de LOG-006 — já está bloqueada
      // por outro motivo, e a suspensão não é uma tentativa de força bruta.
      throw new AccountSuspendedError(user.id.toString());
    }

    await this.loginAttemptRepo.record(
      LoginAttempt.create({
        email: normalizedEmail,
        ipAddress: input.ipAddress,
        successful: true,
        userId: user.id.toString(),
      }),
    );

    // LOG-002 relaxado (ADR 0005): PENDING_EMAIL_VERIFICATION e ACTIVE são
    // ambos aceitos enquanto o fluxo de verificação de e-mail não existir.
    return {
      userId: user.id.toString(),
      name: user.name,
      email: user.email.toString(),
      status: user.status.toString(),
    };
  }

  /** Busca o usuário e valida a senha — mesmo erro genérico para os dois casos (LOG-003). */
  private async verifyCredentials(
    email: Email,
    plainPassword: string,
    normalizedEmail: string,
    ipAddress: string,
  ): Promise<User> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      await this.recordFailure(normalizedEmail, ipAddress);
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.comparePassword(
      plainPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      await this.recordFailure(normalizedEmail, ipAddress, user.id.toString());
      throw new InvalidCredentialsError();
    }

    return user;
  }

  private async recordFailure(
    email: string,
    ipAddress: string,
    userId?: string,
  ): Promise<void> {
    await this.loginAttemptRepo.record(
      LoginAttempt.create({ email, ipAddress, successful: false, userId }),
    );
  }
}
