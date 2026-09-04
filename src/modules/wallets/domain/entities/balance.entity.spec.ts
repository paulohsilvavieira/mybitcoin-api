import { Balance } from '@/modules/wallets/domain/entities/balance.entity';
import { Money } from '@/modules/wallets/domain/value-objects/money.vo';
import { InsufficientBalanceError } from '@/modules/wallets/domain/errors/insufficient-balance.error';
import { InsufficientLockedBalanceError } from '@/modules/wallets/domain/errors/insufficient-locked-balance.error';
import { InvalidAmountError } from '@/modules/wallets/domain/errors/invalid-amount.error';

const btc = (n: bigint) => Money.of('BTC', 8, n);

describe('Balance (entidade filha do aggregate Wallet)', () => {
  let balance: Balance;

  beforeEach(() => {
    balance = Balance.createZero('w1', 'BTC', 8);
  });

  it('credit incrementa o disponível', () => {
    balance.credit(btc(100n));
    expect(balance.availableMinor).toBe(100n);
    expect(balance.totalMinor).toBe(100n);
  });

  it('debit além do disponível lança InsufficientBalanceError e não muta', () => {
    balance.credit(btc(50n));
    expect(() => balance.debit(btc(60n))).toThrow(InsufficientBalanceError);
    expect(balance.availableMinor).toBe(50n);
  });

  it('lock move available -> locked preservando o total', () => {
    balance.credit(btc(100n));
    balance.lock(btc(30n));
    expect(balance.availableMinor).toBe(70n);
    expect(balance.lockedMinor).toBe(30n);
    expect(balance.totalMinor).toBe(100n);
  });

  it('unlock faz o inverso do lock', () => {
    balance.credit(btc(100n));
    balance.lock(btc(30n));
    balance.unlock(btc(30n));
    expect(balance.availableMinor).toBe(100n);
    expect(balance.lockedMinor).toBe(0n);
  });

  it('unlock além do locked lança InsufficientLockedBalanceError', () => {
    expect(() => balance.unlock(btc(1n))).toThrow(
      InsufficientLockedBalanceError,
    );
  });

  it('lock além do disponível lança InsufficientBalanceError', () => {
    balance.credit(btc(10n));
    expect(() => balance.lock(btc(11n))).toThrow(InsufficientBalanceError);
  });

  it('rejeita valor zero/negativo (INV-001..004)', () => {
    expect(() => balance.credit(btc(0n))).toThrow(InvalidAmountError);
  });

  it('rejeita Money de ativo diferente', () => {
    expect(() => balance.credit(Money.of('BRL', 2, 100n))).toThrow(
      InvalidAmountError,
    );
  });
});
