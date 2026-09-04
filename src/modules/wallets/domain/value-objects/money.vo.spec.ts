import { Money } from '@/modules/wallets/domain/value-objects/money.vo';
import { InvalidAmountError } from '@/modules/wallets/domain/errors/invalid-amount.error';

describe('Money (VO)', () => {
  const btc = (n: bigint) => Money.of('BTC', 8, n);

  it('soma valores do mesmo ativo', () => {
    expect(btc(100n).add(btc(50n)).amountMinor).toBe(150n);
  });

  it('subtrai valores do mesmo ativo', () => {
    expect(btc(100n).subtract(btc(40n)).amountMinor).toBe(60n);
  });

  it('lança InvalidAmountError quando a subtração passaria de zero', () => {
    expect(() => btc(10n).subtract(btc(11n))).toThrow(InvalidAmountError);
  });

  it('não opera entre ativos diferentes', () => {
    expect(() => btc(10n).add(Money.of('BRL', 2, 10n))).toThrow(
      InvalidAmountError,
    );
  });

  it('positive() rejeita zero e negativo', () => {
    expect(() => Money.positive('BTC', 8, 0n)).toThrow(InvalidAmountError);
    expect(() => Money.positive('BTC', 8, -1n)).toThrow(InvalidAmountError);
  });

  it('isZeroOrNegative reflete o valor', () => {
    expect(btc(0n).isZeroOrNegative()).toBe(true);
    expect(btc(1n).isZeroOrNegative()).toBe(false);
  });

  it('usa bigint puro — nunca float', () => {
    const big = Money.of('BTC', 8, 9_007_199_254_740_993n);
    expect(big.add(btc(1n)).amountMinor).toBe(9_007_199_254_740_994n);
  });
});
