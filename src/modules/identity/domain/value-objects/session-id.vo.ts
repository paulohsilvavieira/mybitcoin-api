export class SessionId {
  private constructor(private readonly value: string) {}

  static create(): SessionId {
    return new SessionId(crypto.randomUUID());
  }

  static from(id: string): SessionId {
    return new SessionId(id);
  }

  toString(): string {
    return this.value;
  }
}
