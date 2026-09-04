import { createHash } from 'node:crypto';
import { UserRepository } from '@/modules/identity/domain/repositories';
import { UserStatusType } from '@/modules/identity/domain/value-objects/user-status.vo';
import { EmailVerificationTokenInvalidError } from '@/modules/identity/domain/errors/email-verification-token-invalid.error';
import { EmailVerificationTokenExpiredError } from '@/modules/identity/domain/errors/email-verification-token-expired.error';

export interface VerifyEmailInput {
  token: string;
}

export interface VerifyEmailOutput {
  userId: string;
  email: string;
  status: UserStatusType;
}

/**
 * Confirma a posse do e-mail informado no cadastro (VER-001 a VER-004,
 * ADR 0006). Usa `UserRepository` (escrita), mesma razão de `Login`:
 * evitar lag de réplica logo após cadastro/reenvio (ADR 0003).
 */
export class VerifyEmail {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(input: VerifyEmailInput): Promise<VerifyEmailOutput> {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');

    const user =
      await this.userRepo.findByEmailVerificationTokenHash(tokenHash);

    if (!user) {
      throw new EmailVerificationTokenInvalidError();
    }

    if (user.status.isActive()) {
      // Reclique no mesmo link — sucesso idempotente, sem checar expiração
      // (ver Rationale do ADR 0006: o hash não é limpo após verificação).
      return {
        userId: user.id.toString(),
        email: user.email.toString(),
        status: user.status.toString(),
      };
    }

    if (user.status.isSuspended()) {
      // Mesmo erro genérico do token não encontrado — não revela ao
      // portador do token que a conta está suspensa (ADR 0006, Emenda gap 1).
      throw new EmailVerificationTokenInvalidError();
    }

    const now = new Date();
    if (
      !user.emailVerificationExpiresAt ||
      now > user.emailVerificationExpiresAt
    ) {
      throw new EmailVerificationTokenExpiredError();
    }

    user.verifyEmail();
    await this.userRepo.save(user);

    return {
      userId: user.id.toString(),
      email: user.email.toString(),
      status: user.status.toString(),
    };
  }
}
