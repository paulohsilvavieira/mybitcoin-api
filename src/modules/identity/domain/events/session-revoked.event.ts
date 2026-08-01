export type SessionRevokedReason =
  | 'user_requested'
  | 'password_reset'
  | 'logout_all';

export class SessionRevoked {
  readonly occurredAt: Date;

  constructor(
    readonly sessionId: string,
    readonly userId: string,
    readonly reason: SessionRevokedReason,
  ) {
    this.occurredAt = new Date();
  }
}
