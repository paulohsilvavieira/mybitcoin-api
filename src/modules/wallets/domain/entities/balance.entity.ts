import { Money } from '@/modules/wallets/domain/value-objects/money.vo';
import { InsufficientBalanceError } from '@/modules/wallets/domain/errors/insufficient-balance.error';
import { InsufficientLockedBalanceError } from '@/modules/wallets/domain/errors/insufficient-locked-balance.error';
import { InvalidAmountError } from '@/modules/wallets/domain/errors/invalid-amount.error';

/**
 * Projeção materializada de saldo — entidade filha do aggregate `Wallet`, nunca
 * acessada fora dele. NÃO é fonte da verdade (o ledger é), mas protege os
 * invariantes INV-001..004: `available`, `locked` e `total` nunca negativos.
 */
export class Balance {
  private constructor(
    readonly walletId: string,
    readonly asset: string,
    readonly scale: number,
    private _availableMinor: bigint,
    private _lockedMinor: bigint,
  ) {}

  get availableMinor(): bigint {
    return this._availableMinor;
  }

  get lockedMinor(): bigint {
    return this._lockedMinor;
  }

  get totalMinor(): bigint {
    return this._availableMinor + this._lockedMinor;
  }

  credit(amount: Money): void {
    this.assertPositive(amount);
    this._availableMinor += amount.amountMinor;
  }

  debit(amount: Money): void {
    this.assertPositive(amount);
    if (this._availableMinor < amount.amountMinor) {
      throw new InsufficientBalanceError(
        this.asset,
        this._availableMinor,
        amount.amountMinor,
      );
    }
    this._availableMinor -= amount.amountMinor;
  }

  lock(amount: Money): void {
    this.assertPositive(amount);
    if (this._availableMinor < amount.amountMinor) {
      throw new InsufficientBalanceError(
        this.asset,
        this._availableMinor,
        amount.amountMinor,
      );
    }
    this._availableMinor -= amount.amountMinor;
    this._lockedMinor += amount.amountMinor;
  }

  unlock(amount: Money): void {
    this.assertPositive(amount);
    if (this._lockedMinor < amount.amountMinor) {
      throw new InsufficientLockedBalanceError(
        this.asset,
        this._lockedMinor,
        amount.amountMinor,
      );
    }
    this._lockedMinor -= amount.amountMinor;
    this._availableMinor += amount.amountMinor;
  }

  private assertPositive(amount: Money): void {
    if (amount.assetSymbol !== this.asset) {
      throw new InvalidAmountError(
        this.asset,
        amount.amountMinor,
        `amount asset ${amount.assetSymbol} does not match balance asset ${this.asset}`,
      );
    }
    if (amount.isZeroOrNegative()) {
      throw new InvalidAmountError(this.asset, amount.amountMinor);
    }
  }

  static createZero(walletId: string, asset: string, scale: number): Balance {
    return new Balance(walletId, asset, scale, 0n, 0n);
  }

  static reconstitute(params: {
    walletId: string;
    asset: string;
    scale: number;
    availableMinor: bigint;
    lockedMinor: bigint;
  }): Balance {
    return new Balance(
      params.walletId,
      params.asset,
      params.scale,
      params.availableMinor,
      params.lockedMinor,
    );
  }
}
