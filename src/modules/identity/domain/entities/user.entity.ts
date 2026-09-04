import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserId } from '@/modules/identity/domain/value-objects/user-id.vo';
import { UserStatus } from '@/modules/identity/domain/value-objects/user-status.vo';
import { TermsNotAcceptedError } from '@/modules/identity/domain/errors/terms-not-accepted.error';

export class User {
  private constructor(
    readonly id: UserId,
    readonly name: string,
    readonly email: Email,
    private _passwordHash: string,
    private _status: UserStatus,
    private _emailVerified: boolean,
    readonly termsAccepted: boolean,
    readonly registrationIp: string,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    private _emailVerificationTokenHash: string | null,
    private _emailVerificationExpiresAt: Date | null,
    private _emailVerificationLastSentAt: Date | null,
  ) {}

  get passwordHash(): string {
    return this._passwordHash;
  }

  get status(): UserStatus {
    return this._status;
  }

  get emailVerified(): boolean {
    return this._emailVerified;
  }

  get emailVerificationTokenHash(): string | null {
    return this._emailVerificationTokenHash;
  }

  get emailVerificationExpiresAt(): Date | null {
    return this._emailVerificationExpiresAt;
  }

  get emailVerificationLastSentAt(): Date | null {
    return this._emailVerificationLastSentAt;
  }

  issueEmailVerificationToken(
    tokenHash: string,
    expiresAt: Date,
    sentAt: Date,
  ): void {
    this._emailVerificationTokenHash = tokenHash;
    this._emailVerificationExpiresAt = expiresAt;
    this._emailVerificationLastSentAt = sentAt;
  }

  /**
   * Guard idempotente (ADR 0006, Emenda gap 1): só transiciona
   * PENDING_EMAIL_VERIFICATION → ACTIVE. Para qualquer outro status
   * (ACTIVE, SUSPENDED) é no-op silencioso — protege o invariante no
   * próprio aggregate, mesmo que um caller futuro esqueça de checar o
   * status antes de chamar este método. Não limpa os campos de token
   * (ver Rationale do ADR 0006 — idempotência de reclique no link).
   */
  verifyEmail(): void {
    if (!this._status.isPendingEmailVerification()) {
      return;
    }

    this._emailVerified = true;
    this._status = UserStatus.active();
  }

  static create(params: {
    name: string;
    email: Email;
    passwordHash: string;
    termsAccepted: boolean;
    registrationIp: string;
  }): User {
    if (!params.termsAccepted) {
      throw new TermsNotAcceptedError();
    }

    const now = new Date();
    return new User(
      UserId.create(),
      params.name,
      params.email,
      params.passwordHash,
      UserStatus.pendingEmailVerification(),
      false,
      params.termsAccepted,
      params.registrationIp,
      now,
      now,
      null,
      null,
      null,
    );
  }

  static reconstitute(params: {
    id: UserId;
    name: string;
    email: Email;
    passwordHash: string;
    status: UserStatus;
    emailVerified: boolean;
    termsAccepted: boolean;
    registrationIp: string;
    createdAt: Date;
    updatedAt: Date;
    emailVerificationTokenHash?: string | null;
    emailVerificationExpiresAt?: Date | null;
    emailVerificationLastSentAt?: Date | null;
  }): User {
    return new User(
      params.id,
      params.name,
      params.email,
      params.passwordHash,
      params.status,
      params.emailVerified,
      params.termsAccepted,
      params.registrationIp,
      params.createdAt,
      params.updatedAt,
      params.emailVerificationTokenHash ?? null,
      params.emailVerificationExpiresAt ?? null,
      params.emailVerificationLastSentAt ?? null,
    );
  }
}
