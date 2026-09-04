/** Aggregate root do lado da carteira. 1 : 1 com `User`. */
export class Wallet {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static createForUser(userId: string): Wallet {
    const now = new Date();
    return new Wallet(crypto.randomUUID(), userId, now, now);
  }

  static reconstitute(params: {
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  }): Wallet {
    return new Wallet(
      params.id,
      params.userId,
      params.createdAt,
      params.updatedAt,
    );
  }
}
