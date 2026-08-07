export class LedgerEntry {
  private constructor(
    readonly id: string,
    readonly transactionId: string,
    readonly account: string,
    readonly type: 'debit' | 'credit',
    readonly amountSatoshi: bigint,
    readonly createdAt: Date,
  ) {}

  static create(params: {
    transactionId: string;
    account: string;
    type: 'debit' | 'credit';
    amountSatoshi: bigint;
  }): LedgerEntry {
    if (params.amountSatoshi <= 0n) {
      throw new Error('Ledger entry amount must be positive');
    }

    return new LedgerEntry(
      crypto.randomUUID(),
      params.transactionId,
      params.account,
      params.type,
      params.amountSatoshi,
      new Date(),
    );
  }

  static restore(params: {
    id: string;
    transactionId: string;
    account: string;
    type: 'debit' | 'credit';
    amountSatoshi: bigint;
    createdAt: Date;
  }): LedgerEntry {
    return new LedgerEntry(
      params.id,
      params.transactionId,
      params.account,
      params.type,
      params.amountSatoshi,
      params.createdAt,
    );
  }
}
