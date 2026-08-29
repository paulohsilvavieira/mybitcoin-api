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

  verifyEmail(): void {
    this._emailVerified = true;
    this._status = UserStatus.active();
  }

  /**
   * REC-005 — troca o hash da senha. O `updated_at` é responsabilidade do
   * repositório (mesmo padrão de `Session.revoke`). A política de senha é
   * validada pelo VO `Password` antes de o hash chegar aqui.
   */
  changePassword(newPasswordHash: string): void {
    this._passwordHash = newPasswordHash;
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
    );
  }
}
