import { InvalidAmountError } from '@/modules/wallets/domain/errors/invalid-amount.error';

/**
 * Valor monetário multi-ativo, representado sempre na MENOR UNIDADE do ativo
 * (`amountMinor: bigint`) — nunca `number`, nunca float, nunca BigNumber.
 * A escala (casas decimais) vem de `assets.scale`: BRL -> 2, BTC -> 8.
 * Aritmética só é permitida entre `Money` do mesmo ativo.
 */
export class Money {
  private constructor(
    readonly assetSymbol: string,
    readonly scale: number,
    readonly amountMinor: bigint,
  ) {}

  static of(assetSymbol: string, scale: number, amountMinor: bigint): Money {
    return new Money(assetSymbol, scale, amountMinor);
  }

  /** Cria um `Money` exigindo valor estritamente positivo. */
  static positive(
    assetSymbol: string,
    scale: number,
    amountMinor: bigint,
  ): Money {
    if (amountMinor <= 0n) {
      throw new InvalidAmountError(assetSymbol, amountMinor);
    }
    return new Money(assetSymbol, scale, amountMinor);
  }

  static zero(assetSymbol: string, scale: number): Money {
    return new Money(assetSymbol, scale, 0n);
  }

  add(other: Money): Money {
    this.assertSameAsset(other);
    return new Money(
      this.assetSymbol,
      this.scale,
      this.amountMinor + other.amountMinor,
    );
  }

  /** Subtrai; lança `InvalidAmountError` se o resultado for negativo. */
  subtract(other: Money): Money {
    this.assertSameAsset(other);
    const result = this.amountMinor - other.amountMinor;
    if (result < 0n) {
      throw new InvalidAmountError(this.assetSymbol, result);
    }
    return new Money(this.assetSymbol, this.scale, result);
  }

  isZeroOrNegative(): boolean {
    return this.amountMinor <= 0n;
  }

  isPositive(): boolean {
    return this.amountMinor > 0n;
  }

  isLessThan(other: Money): boolean {
    this.assertSameAsset(other);
    return this.amountMinor < other.amountMinor;
  }

  equals(other: Money): boolean {
    return (
      this.assetSymbol === other.assetSymbol &&
      this.amountMinor === other.amountMinor
    );
  }

  private assertSameAsset(other: Money): void {
    if (this.assetSymbol !== other.assetSymbol) {
      throw new InvalidAmountError(
        this.assetSymbol,
        other.amountMinor,
        `cannot operate on Money of different assets (${this.assetSymbol} vs ${other.assetSymbol})`,
      );
    }
  }
}
