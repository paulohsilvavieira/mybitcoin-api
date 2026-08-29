import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';

export abstract class PasswordResetTokenRepository {
  /**
   * Insere um token recém-emitido. INSERT idempotente sob o índice parcial
   * `UNIQUE (user_id) WHERE consumed_at IS NULL`: se já existir um token ativo
   * para o usuário (corrida), lança `ActiveResetTokenExistsError` — nunca
   * retorna boolean.
   */
  abstract save(token: PasswordResetToken): Promise<void>;

  /** Persiste `consumed_at` de um token específico (redeem). */
  abstract consume(token: PasswordResetToken): Promise<void>;

  abstract findByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetToken | null>;

  /** REC-002 — invalida todos os tokens ativos do usuário antes de emitir um novo. */
  abstract consumeAllActiveForUser(userId: string): Promise<void>;
}
