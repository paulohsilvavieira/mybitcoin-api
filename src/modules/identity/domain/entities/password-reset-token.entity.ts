/**
 * Token opaco de recuperação de senha (REC-001 a REC-004).
 *
 * O token em claro só existe no e-mail enviado ao usuário — a entidade e o
 * banco guardam apenas o hash (`tokenHash`), mesmo padrão de `Session`.
 * Lifecycle próprio (não é filho de `User`): emitido, redimível por 30 min,
 * consumido uma única vez.
 */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export class PasswordResetToken {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly tokenHash: string,
    readonly requestedIp: string,
    readonly createdAt: Date,
    readonly expiresAt: Date,
    private _consumedAt: Date | null,
  ) {}

  get consumedAt(): Date | null {
    return this._consumedAt;
  }

  /** REC-003/REC-004: só é redimível se não consumido e dentro da janela. */
  isRedeemable(now: Date = new Date()): boolean {
    if (this._consumedAt !== null) return false;
    if (now > this.expiresAt) return false;
    return true;
  }

  /** Uso único (REC-004). Idempotente, igual a `Session.revoke`. */
  consume(now: Date = new Date()): void {
    if (this._consumedAt !== null) return;
    this._consumedAt = now;
  }

  static issue(params: {
    userId: string;
    tokenHash: string;
    requestedIp: string;
  }): PasswordResetToken {
    const now = new Date();
    return new PasswordResetToken(
      crypto.randomUUID(),
      params.userId,
      params.tokenHash,
      params.requestedIp,
      now,
      new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      null,
    );
  }

  static reconstitute(params: {
    id: string;
    userId: string;
    tokenHash: string;
    requestedIp: string;
    createdAt: Date;
    expiresAt: Date;
    consumedAt: Date | null;
  }): PasswordResetToken {
    return new PasswordResetToken(
      params.id,
      params.userId,
      params.tokenHash,
      params.requestedIp,
      params.createdAt,
      params.expiresAt,
      params.consumedAt,
    );
  }
}
