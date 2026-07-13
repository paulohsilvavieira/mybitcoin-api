export class UserId {
  private constructor(private readonly value: string) {}

  static create(): UserId {
    return new UserId(crypto.randomUUID());
  }

  static from(id: string): UserId {
    return new UserId(id);
  }

  toString(): string {
    return this.value;
  }
}
