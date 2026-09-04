import { randomBytes, createHash } from 'node:crypto';
import { UserRepository } from '@/modules/identity/domain/repositories';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import {
  EmailVerificationPolicy,
  RESEND_COOLDOWN_MS,
} from '@/modules/identity/domain/services/email-verification-policy';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { Logger } from '@nestjs/common';

export interface ResendVerificationEmailInput {
  email: string;
}

/**
 * Reenvia o e-mail de verificação (VER-004, ADR 0006). Nunca lança erro de
 * negócio — os ramos (inexistente / já ativo / suspenso / cooldown ativo /
 * sucesso) são indistinguíveis de fora (mesmo racional de LOG-003), exceto
 * `InvalidEmailError` para formato malformado, que é validação de input.
 */
export class ResendVerificationEmail {
  private readonly logger = new Logger(ResendVerificationEmail.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly emailService: EmailService,
  ) {}

  async execute(input: ResendVerificationEmailInput): Promise<void> {
    const email = Email.create(input.email);

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const expiresAt = EmailVerificationPolicy.computeExpiry(now);

    const updatedUser = await this.userRepo.issueEmailVerificationTokenIfDue({
      email,
      tokenHash,
      expiresAt,
      now,
      cooldownMs: RESEND_COOLDOWN_MS,
    });

    if (!updatedUser) {
      return;
    }

    this.emailService
      .sendVerification({
        to: updatedUser.email.toString(),
        name: updatedUser.name,
        token,
      })
      .catch((error) => {
        this.logger.error(
          'Failed to send verification email',
          error instanceof Error ? error : undefined,
          {
            operation: 'resend_verification_email',
            userId: updatedUser.id.toString(),
          },
        );
      });
  }
}
