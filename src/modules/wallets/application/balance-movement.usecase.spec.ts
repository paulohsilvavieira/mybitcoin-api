import { UnitOfWork, Repositories } from '@/shared/unit-of-work';
import { Asset } from '@/modules/wallets/domain/entities/asset.entity';
import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';
import { Balance } from '@/modules/wallets/domain/entities/balance.entity';
import { Transaction } from '@/modules/wallets/domain/entities/transaction.entity';
import { CreditUseCase } from '@/modules/wallets/application/credit.usecase';
import { DebitUseCase } from '@/modules/wallets/application/debit.usecase';
import { LockUseCase } from '@/modules/wallets/application/lock.usecase';
import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';
import { InsufficientBalanceError } from '@/modules/wallets/domain/errors/insufficient-balance.error';
import { AssetNotSupportedError } from '@/modules/wallets/domain/errors/asset-not-supported.error';

const BTC = Asset.reconstitute({
  symbol: 'BTC',
  name: 'Bitcoin',
  scale: 8,
  status: 'ACTIVE',
});

function makeRepos(initial?: Balance) {
  const wallet = Wallet.createForUser('u1');
  const balance = initial ?? Balance.createZero(wallet.id, 'BTC', 8);
  const savedTransactions: Transaction[] = [];
  const savedEntries: unknown[] = [];
  let existingTx: Transaction | null = null;

  const balanceSave = jest.fn().mockResolvedValue(undefined);
  const transactionSave = jest.fn().mockImplementation((tx: Transaction) => {
    savedTransactions.push(tx);
    return Promise.resolve();
  });
  const ledgerSave = jest.fn().mockImplementation((e: unknown) => {
    savedEntries.push(e);
    return Promise.resolve();
  });

  const repos: Repositories = {
    walletRepo: {
      findByUserId: jest.fn().mockResolvedValue(wallet),
      insertIfNotExists: jest.fn().mockResolvedValue(undefined),
    },
    balanceRepo: {
      findForUpdate: jest.fn().mockResolvedValue(balance),
      insertZeroIfNotExists: jest.fn().mockResolvedValue(undefined),
      save: balanceSave,
    },
    transactionRepo: {
      findById: jest.fn().mockResolvedValue(null),
      findByReference: jest
        .fn()
        .mockImplementation(() => Promise.resolve(existingTx)),
      save: transactionSave,
    },
    ledgerRepo: {
      save: ledgerSave,
      findByTransactionId: jest.fn().mockResolvedValue([]),
      sumByAccount: jest
        .fn()
        .mockResolvedValue({ debitMinor: 0n, creditMinor: 0n }),
    },
  };

  const uow: UnitOfWork = {
    run: <T>(fn: (r: Repositories) => Promise<T>) => fn(repos),
  };

  return {
    uow,
    balance,
    balanceSave,
    savedTransactions,
    savedEntries,
    setExistingTx: (tx: Transaction) => {
      existingTx = tx;
    },
  };
}

const assetRepo = {
  findBySymbol: jest.fn().mockResolvedValue(BTC),
  listActive: jest.fn().mockResolvedValue([BTC]),
};

describe('BalanceMovementUseCase (primitivas, repos mockados)', () => {
  beforeEach(() => {
    assetRepo.findBySymbol.mockResolvedValue(BTC);
  });

  it('credit grava 1 transaction + 2 entries e atualiza o balance', async () => {
    const ctx = makeRepos();
    const sut = new CreditUseCase(ctx.uow, assetRepo);

    const result = await sut.execute({
      userId: 'u1',
      asset: 'BTC',
      amountMinor: 50_000_000n,
      reference: { referenceType: 'DEPOSIT', referenceId: 'dep-1' },
    });

    expect(ctx.savedTransactions).toHaveLength(1);
    expect(ctx.savedEntries).toHaveLength(2);
    expect(ctx.balanceSave).toHaveBeenCalledTimes(1);
    expect(result.balance.availableMinor).toBe(50_000_000n);
    expect(result.idempotent).toBe(false);

    // Σ débitos = Σ créditos no nível unit: 1 perna de cada, mesmo valor.
    const entries = ctx.savedEntries as LedgerEntry[];
    const debits = entries.filter((e) => e.entryType === 'debit');
    const credits = entries.filter((e) => e.entryType === 'credit');
    expect(debits).toHaveLength(1);
    expect(credits).toHaveLength(1);
    expect(debits[0].amountMinor).toBe(credits[0].amountMinor);
    expect(debits[0].amountMinor).toBe(50_000_000n);
    expect(debits[0].account).toBe('EXCHANGE:TREASURY:BTC');
    expect(credits[0].balanceBeforeMinor).toBe(0n);
    expect(credits[0].balanceAfterMinor).toBe(50_000_000n);
    expect(debits[0].balanceBeforeMinor).toBeNull();
  });

  it('ativo INACTIVE lança AssetNotSupportedError antes de qualquer escrita', async () => {
    assetRepo.findBySymbol.mockResolvedValueOnce(
      Asset.reconstitute({
        symbol: 'BTC',
        name: 'Bitcoin',
        scale: 8,
        status: 'INACTIVE',
      }),
    );
    const ctx = makeRepos();
    const sut = new CreditUseCase(ctx.uow, assetRepo);

    await expect(
      sut.execute({
        userId: 'u1',
        asset: 'BTC',
        amountMinor: 1n,
        reference: { referenceType: 'DEPOSIT', referenceId: 'x' },
      }),
    ).rejects.toBeInstanceOf(AssetNotSupportedError);
    expect(ctx.savedTransactions).toHaveLength(0);
    expect(ctx.savedEntries).toHaveLength(0);
  });

  it('segunda chamada com a mesma tripla é no-op idempotente (não grava de novo)', async () => {
    const ctx = makeRepos();
    ctx.setExistingTx(
      Transaction.create({
        operation: 'credit',
        reference: { referenceType: 'DEPOSIT', referenceId: 'dep-1' },
      }),
    );
    const sut = new CreditUseCase(ctx.uow, assetRepo);

    const result = await sut.execute({
      userId: 'u1',
      asset: 'BTC',
      amountMinor: 50_000_000n,
      reference: { referenceType: 'DEPOSIT', referenceId: 'dep-1' },
    });

    expect(result.idempotent).toBe(true);
    expect(ctx.savedTransactions).toHaveLength(0);
    expect(ctx.savedEntries).toHaveLength(0);
    expect(ctx.balanceSave).not.toHaveBeenCalled();
  });

  it('debit além do disponível lança InsufficientBalanceError e não grava', async () => {
    const ctx = makeRepos(Balance.createZero('w1', 'BTC', 8));
    const sut = new DebitUseCase(ctx.uow, assetRepo);

    await expect(
      sut.execute({
        userId: 'u1',
        asset: 'BTC',
        amountMinor: 1n,
        reference: { referenceType: 'WITHDRAWAL', referenceId: 'wd-1' },
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(ctx.savedTransactions).toHaveLength(0);
  });

  it('lock preserva o total (available -> locked)', async () => {
    const seeded = Balance.reconstitute({
      walletId: 'w1',
      asset: 'BTC',
      scale: 8,
      availableMinor: 100n,
      lockedMinor: 0n,
    });
    const ctx = makeRepos(seeded);
    const sut = new LockUseCase(ctx.uow, assetRepo);

    const result = await sut.execute({
      userId: 'u1',
      asset: 'BTC',
      amountMinor: 40n,
      reference: { referenceType: 'ORDER', referenceId: 'ord-1' },
    });

    expect(result.balance.availableMinor).toBe(60n);
    expect(result.balance.lockedMinor).toBe(40n);
    expect(result.balance.totalMinor).toBe(100n);
  });

  it('ativo fora do catálogo lança AssetNotSupportedError antes de qualquer escrita', async () => {
    assetRepo.findBySymbol.mockResolvedValueOnce(null);
    const ctx = makeRepos();
    const sut = new CreditUseCase(ctx.uow, assetRepo);

    await expect(
      sut.execute({
        userId: 'u1',
        asset: 'DOGE',
        amountMinor: 1n,
        reference: { referenceType: 'DEPOSIT', referenceId: 'x' },
      }),
    ).rejects.toBeInstanceOf(AssetNotSupportedError);
  });
});
