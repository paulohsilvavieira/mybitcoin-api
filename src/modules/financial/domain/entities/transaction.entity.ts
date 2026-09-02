import { InvalidCreditAmountError } from '../errors/invalid-credit-amount.error';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

export class Transaction {
  private constructor(
    readonly id: string,
    readonly accountId: string,
    readonly type: string,
    readonly asset: string,
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

  private static assertValidSatoshiAmount(amountSatoshi: bigint): void {
    if (amountSatoshi <= 0n) {
      throw new InvalidCreditAmountError(amountSatoshi);
    }
  }

  static create(params: {
    accountId: string;
    type: string;
    asset: string;
    amountSatoshi: bigint;
  }): Transaction {
    return new Transaction(
      crypto.randomUUID(),
      params.accountId,
      params.type,
      params.asset,
      params.amountSatoshi,
      'pending',
      new Date(),
    );
  }

  static restore(params: {
    id: string;
    accountId: string;
    type: string;
    asset: string;
    amountSatoshi: bigint;
    status: TransactionStatus;
    createdAt: Date;
  }): Transaction {
    return new Transaction(
      params.id,
      params.accountId,
      params.type,
      params.asset,
      params.amountSatoshi,
      params.status,
      params.createdAt,
    );
  }
}
