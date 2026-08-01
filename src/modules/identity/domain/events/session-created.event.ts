export class SessionCreated {
  readonly occurredAt: Date;

  constructor(
    readonly sessionId: string,
    readonly userId: string,
    readonly deviceInfo: string,
    readonly ipAddress: string,
  ) {
    this.occurredAt = new Date();
  }
}
