import { InvalidCreditAmountError } from '@/modules/financial/domain/errors/invalid-credit-amount.error';
import { NegativeWalletBalanceError } from '@/modules/financial/domain/errors/negative-wallet-balance.error';

export class Wallet {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly asset: string,
    private _availableSatoshi: bigint,
    private _lockedSatoshi: bigint,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  get availableSatoshi(): bigint {
    return this._availableSatoshi;
  }

  get lockedSatoshi(): bigint {
    return this._lockedSatoshi;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // INV-004
  get totalSatoshi(): bigint {
    return this._availableSatoshi + this._lockedSatoshi;
  }

  private static assertValidBalance(amount: bigint): void {
    if (amount < 0n) {
      throw new NegativeWalletBalanceError(amount);
    }
  }

  static assertValidCreditAmount(amountSatoshi: bigint): void {
    if (amountSatoshi <= 0n) {
      throw new InvalidCreditAmountError(amountSatoshi);
    }
  }

  static create(params: { userId: string; asset: string }): Wallet {
    const now = new Date();
    return new Wallet(
      crypto.randomUUID(),
      params.userId,
      params.asset,
      0n,
      0n,
      now,
      now,
    );
  }

  static restore(params: {
    id: string;
    userId: string;
    asset: string;
    availableSatoshi: bigint;
    lockedSatoshi: bigint;
    createdAt: Date;
    updatedAt: Date;
  }): Wallet {
    Wallet.assertValidBalance(params.availableSatoshi);
    Wallet.assertValidBalance(params.lockedSatoshi);

    return new Wallet(
      params.id,
      params.userId,
      params.asset,
      params.availableSatoshi,
      params.lockedSatoshi,
      params.createdAt,
      params.updatedAt,
    );
  }
}
