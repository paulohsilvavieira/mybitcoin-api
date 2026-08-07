import { Wallet } from '@/modules/financial/domain/entities/wallet.entity';
import { InvalidCreditAmountError } from '@/modules/financial/domain/errors/invalid-credit-amount.error';
import { NegativeWalletBalanceError } from '@/modules/financial/domain/errors/negative-wallet-balance.error';

describe('Wallet', () => {
  describe('create', () => {
    it('creates a wallet with zero available and locked balances', () => {
      const wallet = Wallet.create({ userId: 'user-1', asset: 'BTC' });

      expect(wallet.userId).toBe('user-1');
      expect(wallet.asset).toBe('BTC');
      expect(wallet.availableSatoshi).toBe(0n);
      expect(wallet.lockedSatoshi).toBe(0n);
      expect(wallet.id).toEqual(expect.any(String));
      expect(wallet.createdAt).toBeInstanceOf(Date);
      expect(wallet.updatedAt).toBeInstanceOf(Date);
    });

    it('generates a distinct id for every new wallet', () => {
      const walletA = Wallet.create({ userId: 'user-1', asset: 'BTC' });
      const walletB = Wallet.create({ userId: 'user-1', asset: 'ETH' });

      expect(walletA.id).not.toBe(walletB.id);
    });
  });

  describe('restore', () => {
    it('rehydrates a wallet from persisted primitives', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const wallet = Wallet.restore({
        id: 'wallet-1',
        userId: 'user-1',
        asset: 'BTC',
        availableSatoshi: 100_000n,
        lockedSatoshi: 5_000n,
        createdAt,
        updatedAt,
      });

      expect(wallet.id).toBe('wallet-1');
      expect(wallet.userId).toBe('user-1');
      expect(wallet.asset).toBe('BTC');
      expect(wallet.availableSatoshi).toBe(100_000n);
      expect(wallet.lockedSatoshi).toBe(5_000n);
      expect(wallet.createdAt).toBe(createdAt);
      expect(wallet.updatedAt).toBe(updatedAt);
    });

    it('rejects a negative available balance', () => {
      expect(() =>
        Wallet.restore({
          id: 'wallet-1',
          userId: 'user-1',
          asset: 'BTC',
          availableSatoshi: -1n,
          lockedSatoshi: 0n,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(NegativeWalletBalanceError);
    });

    it('rejects a negative locked balance', () => {
      expect(() =>
        Wallet.restore({
          id: 'wallet-1',
          userId: 'user-1',
          asset: 'BTC',
          availableSatoshi: 0n,
          lockedSatoshi: -1n,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(NegativeWalletBalanceError);
    });
  });

  describe('totalSatoshi', () => {
    it('sums available and locked balances (INV-004)', () => {
      const wallet = Wallet.restore({
        id: 'wallet-1',
        userId: 'user-1',
        asset: 'BTC',
        availableSatoshi: 100_000n,
        lockedSatoshi: 5_000n,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(wallet.totalSatoshi).toBe(105_000n);
    });

    it('is zero for a freshly created wallet', () => {
      const wallet = Wallet.create({ userId: 'user-1', asset: 'BTC' });

      expect(wallet.totalSatoshi).toBe(0n);
    });
  });

  describe('assertValidCreditAmount', () => {
    it('does not throw for a positive amount', () => {
      expect(() => Wallet.assertValidCreditAmount(1n)).not.toThrow();
    });

    it('throws InvalidCreditAmountError for a zero or negative amount', () => {
      expect(() => Wallet.assertValidCreditAmount(0n)).toThrow(
        InvalidCreditAmountError,
      );
      expect(() => Wallet.assertValidCreditAmount(-100n)).toThrow(
        InvalidCreditAmountError,
      );
    });
  });
});
