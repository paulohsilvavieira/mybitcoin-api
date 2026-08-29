import { Logger } from '@nestjs/common';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { UserRepository } from '@/modules/identity/domain/repositories/user.repository';
import { PasswordResetRequestRepository } from '@/modules/identity/domain/repositories/password-reset-request.repository';
import { IdentityUnitOfWork } from '@/modules/identity/domain/identity-unit-of-work';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import { PasswordResetRequest } from '@/modules/identity/domain/entities/password-reset-request.entity';
import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';
import { ActiveResetTokenExistsError } from '@/modules/identity/domain/errors/active-reset-token-exists.error';

export interface RequestPasswordResetInput {
  email: string;
  ipAddress: string;
}

/** Janela do rate-limit por e-mail (REC-001 / anti-abuso): 3 solicitações / 15 min. */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

/**
 * REC-001/REC-002 — solicitação de recuperação de senha.
 *
 * SEMPRE responde de forma neutra: e-mail inexistente, conta suspensa,
 * rate-limit estourado e corrida de emissão de token retornam `void` sem
 * lançar. O único erro que propaga é `InvalidEmailError` (formato inválido),
 * pelo mesmo tratamento do login.
 */
export class RequestPasswordReset {
  private readonly logger = new Logger(RequestPasswordReset.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly requestRepo: PasswordResetRequestRepository,
    private readonly uow: IdentityUnitOfWork,
    private readonly emailService: EmailService,
    private readonly generateToken: () => string,
    private readonly hashToken: (token: string) => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    const email = Email.create(input.email);
    const normalizedEmail = email.toString();
    const user = await this.userRepo.findByEmail(email);

    await this.recordRequest(normalizedEmail, input.ipAddress, user !== null);

    if (await this.isThrottled(normalizedEmail, input.ipAddress)) {
      return;
    }

    const eligibleUser = this.eligibleUserOrNull(user, input.ipAddress);
    if (eligibleUser === null) {
      return;
    }

    const token = await this.issueToken(eligibleUser, input.ipAddress);
    if (token === null) {
      return;
    }

    this.sendResetEmail(eligibleUser, normalizedEmail, token);
    this.logger.log('Password reset request completed', {
      operation: 'password_reset.request.completed',
      userId: eligibleUser.id.toString(),
      email: normalizedEmail,
      ipAddress: input.ipAddress,
    });
  }

  private async recordRequest(
    email: string,
    ipAddress: string,
    userFound: boolean,
  ): Promise<void> {
    await this.requestRepo.record(
      PasswordResetRequest.record({ email, ipAddress, userFound }),
    );
  }

  private async isThrottled(
    email: string,
    ipAddress: string,
  ): Promise<boolean> {
    const since = new Date(this.clock().getTime() - RATE_LIMIT_WINDOW_MS);
    const recentCount = await this.requestRepo.countSince(email, since);
    if (recentCount <= RATE_LIMIT_MAX) {
      return false;
    }
    this.logger.warn('Password reset request throttled', {
      operation: 'password_reset.request.throttled',
      email,
      ipAddress,
      recentCount,
    });
    return true;
  }

  /** REC / LOG-003 — só ACTIVE e PENDING recuperam; SUSPENDED e inexistente saem neutros. */
  private eligibleUserOrNull(
    user: User | null,
    ipAddress: string,
  ): User | null {
    if (user === null) {
      this.logger.log('Password reset requested for unknown account', {
        operation: 'password_reset.request.no_account',
        ipAddress,
      });
      return null;
    }
    if (user.status.isSuspended()) {
      this.logger.warn('Password reset requested for suspended account', {
        operation: 'password_reset.request.suspended',
        userId: user.id.toString(),
        ipAddress,
      });
      return null;
    }
    return user;
  }

  /**
   * REC-002 — invalida tokens ativos e emite um novo, atomicamente. Retorna o
   * token em claro, ou `null` quando uma solicitação concorrente já emitiu um
   * (corrida no índice parcial UNIQUE) — nesse caso a resposta segue neutra.
   */
  private async issueToken(
    user: User,
    ipAddress: string,
  ): Promise<string | null> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    try {
      await this.uow.run(async ({ passwordResetTokenRepo }) => {
        await passwordResetTokenRepo.consumeAllActiveForUser(
          user.id.toString(),
        );
        await passwordResetTokenRepo.save(
          PasswordResetToken.issue({
            userId: user.id.toString(),
            tokenHash,
            requestedIp: ipAddress,
          }),
        );
      });
    } catch (error) {
      if (error instanceof ActiveResetTokenExistsError) {
        this.logger.warn('Password reset token already active (race)', {
          operation: 'password_reset.request.token_exists',
          userId: user.id.toString(),
          ipAddress,
        });
        return null;
      }
      throw error;
    }
    return token;
  }

  private sendResetEmail(user: User, email: string, token: string): void {
    this.emailService
      .sendPasswordReset({ to: email, name: user.name, token })
      .catch((error: unknown) => {
        this.logger.error(
          'Failed to send password reset email',
          error instanceof Error ? error : undefined,
          {
            operation: 'password_reset.request.email_failed',
            userId: user.id.toString(),
            email,
          },
        );
      });
  }
}
