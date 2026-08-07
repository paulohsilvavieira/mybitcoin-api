import { ConfirmDepositWithUowUseCase } from '@/modules/financial/application/confirm-deposit-with-uow.usecase';
import { Transaction, Wallet } from '@/modules/financial/domain/entities';
import { TransactionNotFoundError } from '@/modules/financial/domain/errors/transaction-not-found.error';
import { Repositories } from '@/shared/unit-of-work';

describe('ConfirmDepositWithUowUseCase', () => {
  const mockTransactionRepo = {
    findById: jest.fn(),
    save: jest.fn(),
  };
  const mockLedgerRepo = {
    save: jest.fn(),
    findByTransactionId: jest.fn(),
  };
  const mockWalletRepo = {
    creditAvailable: jest.fn(),
    findByUserIdAndAsset: jest.fn(),
  };

  const mockUow = {
    run: jest.fn(
      async <T>(fn: (repos: Repositories) => Promise<T>): Promise<T> =>
        fn({
          transactionRepo: mockTransactionRepo,
          ledgerRepo: mockLedgerRepo,
          walletRepo: mockWalletRepo,
        }),
    ),
  };

  let useCase: ConfirmDepositWithUowUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUow.run.mockImplementation(
      async <T>(fn: (repos: Repositories) => Promise<T>) =>
        fn({
          transactionRepo: mockTransactionRepo,
          ledgerRepo: mockLedgerRepo,
          walletRepo: mockWalletRepo,
        }),
    );
    useCase = new ConfirmDepositWithUowUseCase(mockUow as any);
  });

  function makePendingTransaction(): Transaction {
    return Transaction.create({
      accountId: 'user-1',
      type: 'deposit',
      asset: 'BTC',
      amountSatoshi: 100_000n,
    });
  }

  it('runs the whole flow inside a single uow.run call', async () => {
    const transaction = makePendingTransaction();
    mockTransactionRepo.findById.mockResolvedValue(transaction);
    mockWalletRepo.creditAvailable.mockResolvedValue(
      Wallet.create({ userId: 'user-1', asset: 'BTC' }),
    );

    await useCase.execute({ transactionId: transaction.id, confirmations: 3 });

    expect(mockUow.run).toHaveBeenCalledTimes(1);
  });

  it('confirms the transaction and persists it via transactionRepo.save', async () => {
    const transaction = makePendingTransaction();
    mockTransactionRepo.findById.mockResolvedValue(transaction);
    mockWalletRepo.creditAvailable.mockResolvedValue(
      Wallet.create({ userId: 'user-1', asset: 'BTC' }),
    );

    await useCase.execute({ transactionId: transaction.id, confirmations: 3 });

    expect(transaction.status).toBe('confirmed');
    expect(mockTransactionRepo.save).toHaveBeenCalledWith(transaction);
  });

  it('saves exactly two ledger entries: a debit from treasury and a credit to the user', async () => {
    const transaction = makePendingTransaction();
    mockTransactionRepo.findById.mockResolvedValue(transaction);
    mockWalletRepo.creditAvailable.mockResolvedValue(
      Wallet.create({ userId: 'user-1', asset: 'BTC' }),
    );

    await useCase.execute({ transactionId: transaction.id, confirmations: 3 });

    expect(mockLedgerRepo.save).toHaveBeenCalledTimes(2);

    const [debitCall, creditCall] = mockLedgerRepo.save.mock.calls.map(
      ([entry]) => entry,
    );

    expect(debitCall.type).toBe('debit');
    expect(debitCall.account).toBe('EXCHANGE:TREASURY:BTC');
    expect(debitCall.amountSatoshi).toBe(100_000n);
    expect(debitCall.transactionId).toBe(transaction.id);

    expect(creditCall.type).toBe('credit');
    expect(creditCall.account).toBe('USER:user-1:BTC');
    expect(creditCall.amountSatoshi).toBe(100_000n);
    expect(creditCall.transactionId).toBe(transaction.id);
  });

  it('sums to zero net across the debit and credit ledger entries (dupla entrada)', async () => {
    const transaction = makePendingTransaction();
    mockTransactionRepo.findById.mockResolvedValue(transaction);
    mockWalletRepo.creditAvailable.mockResolvedValue(
      Wallet.create({ userId: 'user-1', asset: 'BTC' }),
    );

    await useCase.execute({ transactionId: transaction.id, confirmations: 3 });

    const entries = mockLedgerRepo.save.mock.calls.map(([entry]) => entry);
    const debitTotal = entries
      .filter((entry) => entry.type === 'debit')
      .reduce((sum, entry) => sum + entry.amountSatoshi, 0n);
    const creditTotal = entries
      .filter((entry) => entry.type === 'credit')
      .reduce((sum, entry) => sum + entry.amountSatoshi, 0n);

    expect(debitTotal).toBe(creditTotal);
  });

  it('credits the wallet with userId, asset and amountSatoshi from the transaction', async () => {
    const transaction = makePendingTransaction();
    mockTransactionRepo.findById.mockResolvedValue(transaction);
    mockWalletRepo.creditAvailable.mockResolvedValue(
      Wallet.create({ userId: 'user-1', asset: 'BTC' }),
    );

    await useCase.execute({ transactionId: transaction.id, confirmations: 3 });

    expect(mockWalletRepo.creditAvailable).toHaveBeenCalledWith({
      userId: 'user-1',
      asset: 'BTC',
      amountSatoshi: 100_000n,
    });
  });

  it('validates the credit amount via Wallet.assertValidCreditAmount before crediting the wallet', async () => {
    const transaction = makePendingTransaction();
    mockTransactionRepo.findById.mockResolvedValue(transaction);
    mockWalletRepo.creditAvailable.mockResolvedValue(
      Wallet.create({ userId: 'user-1', asset: 'BTC' }),
    );
    const assertSpy = jest.spyOn(Wallet, 'assertValidCreditAmount');

    await useCase.execute({ transactionId: transaction.id, confirmations: 3 });

    expect(assertSpy).toHaveBeenCalledWith(100_000n);

    const assertOrder = assertSpy.mock.invocationCallOrder[0];
    const creditOrder =
      mockWalletRepo.creditAvailable.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(creditOrder);

    assertSpy.mockRestore();
  });

  it('throws TransactionNotFoundError when the transaction does not exist', async () => {
    mockTransactionRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ transactionId: 'missing-id', confirmations: 3 }),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);

    expect(mockTransactionRepo.save).not.toHaveBeenCalled();
    expect(mockLedgerRepo.save).not.toHaveBeenCalled();
    expect(mockWalletRepo.creditAvailable).not.toHaveBeenCalled();
  });
});
