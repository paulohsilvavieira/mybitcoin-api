export class UserRegistered {
  readonly occurredAt: Date;

  constructor(
    readonly userId: string,
    readonly email: string,
    readonly name: string,
  ) {
    this.occurredAt = new Date();
  }
}
