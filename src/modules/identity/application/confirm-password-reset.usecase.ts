import { Logger } from '@nestjs/common';
import { Password } from '@/modules/identity/domain/value-objects/password.vo';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { UserRepository } from '@/modules/identity/domain/repositories/user.repository';
import { PasswordResetTokenRepository } from '@/modules/identity/domain/repositories/password-reset-token.repository';
import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';
import {
  IdentityRepositories,
  IdentityUnitOfWork,
} from '@/modules/identity/domain/identity-unit-of-work';
import { LoginAttempt } from '@/modules/identity/domain/entities/login-attempt.entity';
import { SessionRevoked } from '@/modules/identity/domain/events/session-revoked.event';
import { InvalidResetTokenError } from '@/modules/identity/domain/errors/invalid-reset-token.error';
import { AccountSuspendedError } from '@/modules/identity/domain/errors/account-suspended.error';

export interface ConfirmPasswordResetInput {
  token: string;
  newPassword: string;
  ipAddress: string;
}

export interface ConfirmPasswordResetOutput {
  revokedSessionCount: number;
  events: SessionRevoked[];
}

interface RedeemContext {
  user: User;
  token: PasswordResetToken;
  newHash: string;
  now: Date;
  ipAddress: string;
}

/**
 * REC-003..006 — redefine a senha a partir de um token válido.
 *
 * Atômico (`IdentityUnitOfWork`): troca do hash, consumo do token, revogação de
 * TODAS as sessões (REC-006) e limpeza do lockout de LOG-006 (GAP-1) acontecem
 * na mesma transação. A política de senha é validada ANTES de qualquer I/O.
 */
export class ConfirmPasswordReset {
  private readonly logger = new Logger(ConfirmPasswordReset.name);

  constructor(
    private readonly passwordResetTokenRepo: PasswordResetTokenRepository,
    private readonly userRepo: UserRepository,
    private readonly uow: IdentityUnitOfWork,
    private readonly hashToken: (token: string) => string,
    private readonly hashPassword: (plain: string) => Promise<string>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(
    input: ConfirmPasswordResetInput,
  ): Promise<ConfirmPasswordResetOutput> {
    // REC-005 — valida a política antes de qualquer I/O. Deixa WeakPasswordError propagar.
    Password.create(input.newPassword);

    const now = this.clock();
    const token = await this.loadRedeemableToken(input.token, now);
    const user = await this.loadEligibleUser(token.userId);
    const newHash = await this.hashPassword(input.newPassword);

    const result = await this.uow.run((repos) =>
      this.applyReset(repos, {
        user,
        token,
        newHash,
        now,
        ipAddress: input.ipAddress,
      }),
    );

    // Um único log: a limpeza do lockout de LOG-006 é efeito do LoginAttempt
    // successful=true gravado dentro de applyReset (GAP-1).
    this.logger.log('Password reset completed', {
      operation: 'password_reset.completed',
      userId: user.id.toString(),
      revokedSessionCount: result.revokedSessionCount,
      lockoutCleared: true,
    });

    return result;
  }

  /** REC-003/REC-004 — hash do token, busca e checagem de janela/consumo. */
  private async loadRedeemableToken(
    rawToken: string,
    now: Date,
  ): Promise<PasswordResetToken> {
    const token = await this.passwordResetTokenRepo.findByTokenHash(
      this.hashToken(rawToken),
    );
    if (token === null || !token.isRedeemable(now)) {
      throw new InvalidResetTokenError();
    }
    return token;
  }

  private async loadEligibleUser(userId: string): Promise<User> {
    const user = await this.userRepo.findById(userId);
    if (user === null) {
      this.logger.error('Password reset token points to a missing user', {
        operation: 'password_reset.redeem.user_missing',
        userId,
      });
      throw new InvalidResetTokenError();
    }
    if (user.status.isSuspended()) {
      throw new AccountSuspendedError(user.id.toString());
    }
    return user;
  }

  /**
   * Corpo transacional do redeem — roda sobre os repositórios do
   * `IdentityUnitOfWork` (users + password_reset_tokens + sessions +
   * login_attempts). Qualquer falha aqui faz ROLLBACK.
   */
  private async applyReset(
    {
      userRepo,
      sessionRepo,
      passwordResetTokenRepo,
      loginAttemptRepo,
    }: IdentityRepositories,
    { user, token, newHash, now, ipAddress }: RedeemContext,
  ): Promise<ConfirmPasswordResetOutput> {
    const userId = user.id.toString();

    user.changePassword(newHash);
    await userRepo.save(user);

    token.consume(now);
    await passwordResetTokenRepo.consume(token);

    const activeSessions = await sessionRepo.findActiveByUserId(userId);
    await sessionRepo.revokeAll(userId);

    // GAP-1 — zera o contador de LOG-006: a posse do e-mail é o sinal de
    // "o dono legítimo está de volta".
    await loginAttemptRepo.record(
      LoginAttempt.create({
        email: user.email.toString(),
        ipAddress,
        successful: true,
        userId,
      }),
    );

    const events = activeSessions.map(
      (session) =>
        new SessionRevoked(session.id.toString(), userId, 'password_reset'),
    );
    return { revokedSessionCount: activeSessions.length, events };
  }
}
