import { Repositories } from '@/shared/unit-of-work';
import { provisionWallet } from '@/modules/wallets/application/provision-wallet';
import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';
import { Balance } from '@/modules/wallets/domain/entities/balance.entity';
import { WalletNotFoundError } from '@/modules/wallets/domain/errors/wallet-not-found.error';
import { BalanceProvisioningError } from '@/modules/wallets/domain/errors/balance-provisioning.error';

function repos(overrides: {
  wallets?: (Wallet | null)[];
  balances?: (Balance | null)[];
}): { repos: Repositories; insertWallet: jest.Mock; insertBalance: jest.Mock } {
  const walletQueue = [...(overrides.wallets ?? [])];
  const balanceQueue = [...(overrides.balances ?? [])];
  const insertWallet = jest.fn().mockResolvedValue(undefined);
  const insertBalance = jest.fn().mockResolvedValue(undefined);

  return {
    insertWallet,
    insertBalance,
    repos: {
      walletRepo: {
        findByUserId: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(walletQueue.length ? walletQueue.shift() : null),
          ),
        insertIfNotExists: insertWallet,
      },
      balanceRepo: {
        findForUpdate: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(balanceQueue.length ? balanceQueue.shift() : null),
          ),
        insertZeroIfNotExists: insertBalance,
        save: jest.fn(),
      },
      transactionRepo: {} as Repositories['transactionRepo'],
      ledgerRepo: {} as Repositories['ledgerRepo'],
    },
  };
}

describe('provisionWallet', () => {
  it('caminho feliz: wallet e balance já existem', async () => {
    const wallet = Wallet.createForUser('u1');
    const balance = Balance.createZero(wallet.id, 'BTC', 8);
    const ctx = repos({ wallets: [wallet], balances: [balance] });

    const out = await provisionWallet(ctx.repos, 'u1', 'BTC');

    expect(out.wallet).toBe(wallet);
    expect(out.balance).toBe(balance);
    expect(ctx.insertWallet).not.toHaveBeenCalled();
    expect(ctx.insertBalance).not.toHaveBeenCalled();
  });

  it('cria wallet e balance lazy quando ausentes', async () => {
    const wallet = Wallet.createForUser('u1');
    const balance = Balance.createZero(wallet.id, 'BTC', 8);
    const ctx = repos({
      wallets: [null, wallet],
      balances: [null, balance],
    });

    const out = await provisionWallet(ctx.repos, 'u1', 'BTC');

    expect(ctx.insertWallet).toHaveBeenCalledTimes(1);
    expect(ctx.insertBalance).toHaveBeenCalledTimes(1);
    expect(out.balance).toBe(balance);
  });

  it('fail-loud: wallet ainda null após insert -> WalletNotFoundError', async () => {
    const ctx = repos({ wallets: [null, null] });
    await expect(
      provisionWallet(ctx.repos, 'u1', 'BTC'),
    ).rejects.toBeInstanceOf(WalletNotFoundError);
  });

  it('fail-loud: balance ainda null após insert -> BalanceProvisioningError (não faz fallback silencioso)', async () => {
    const wallet = Wallet.createForUser('u1');
    const ctx = repos({ wallets: [wallet], balances: [null, null] });
    await expect(
      provisionWallet(ctx.repos, 'u1', 'BTC'),
    ).rejects.toBeInstanceOf(BalanceProvisioningError);
  });
});
