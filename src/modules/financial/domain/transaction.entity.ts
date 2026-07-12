export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

export class Transaction {
  private constructor(
    readonly id: string,
    readonly accountId: string,
    readonly type: string,
    readonly amountSatoshi: bigint,
    private _status: TransactionStatus,
    readonly createdAt: Date,
  ) {}

  get status(): TransactionStatus {
    return this._status;
  }

  confirm(): void {
    if (this._status !== 'pending') {
      throw new Error(`Cannot confirm transaction in status '${this._status}'`);
    }
    this._status = 'confirmed';
  }

  static create(params: {
    accountId: string;
    type: string;
    amountSatoshi: bigint;
  }): Transaction {
    return new Transaction(
      crypto.randomUUID(),
      params.accountId,
      params.type,
      params.amountSatoshi,
      'pending',
      new Date(),
    );
  }
}
