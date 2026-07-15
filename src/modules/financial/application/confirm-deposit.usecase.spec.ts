import { ConfirmDepositUseCase } from '@/modules/financial/application/confirm-deposit.usecase';
import { Transaction } from '@/modules/financial/domain/transaction.entity';
import { LedgerEntry } from '@/modules/financial/domain/ledger-entry.entity';

describe('ConfirmDepositUseCase', () => {
  let useCase: ConfirmDepositUseCase;

  const mockTransactionRepo = {
    findById: jest.fn(),
    save: jest.fn(),
  };

  const mockLedgerRepo = {
    save: jest.fn(),
    findByTransactionId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ConfirmDepositUseCase(mockTransactionRepo, mockLedgerRepo);
  });

  it('confirms a pending transaction and creates ledger entries', async () => {
    const transaction = Transaction.create({
      accountId: 'user-123',
      type: 'deposit',
      amountSatoshi: 100_000n,
    });

    mockTransactionRepo.findById.mockResolvedValue(transaction);

    await useCase.execute({
      transactionId: transaction.id,
      confirmations: 3,
    });

    expect(transaction.status).toBe('confirmed');
    expect(mockTransactionRepo.save).toHaveBeenCalledWith(transaction);

    expect(mockLedgerRepo.save).toHaveBeenCalledTimes(2);

    const [debit, credit] = mockLedgerRepo.save.mock.calls.map(
      (call: unknown[]) => call[0] as LedgerEntry,
    );
    expect(debit.type).toBe('debit');
    expect(credit.type).toBe('credit');
    expect(debit.amountSatoshi).toBe(100_000n);
    expect(credit.amountSatoshi).toBe(100_000n);
  });

  it('throws if transaction not found', async () => {
    mockTransactionRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ transactionId: 'nonexistent', confirmations: 3 }),
    ).rejects.toThrow('not found');
  });

  it('does not create ledger entries if transaction not found', async () => {
    mockTransactionRepo.findById.mockResolvedValue(null);

    await useCase
      .execute({ transactionId: 'nonexistent', confirmations: 3 })
      .catch(() => {});

    expect(mockLedgerRepo.save).not.toHaveBeenCalled();
  });
});
