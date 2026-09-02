import { PostgresUnitOfWork } from '@/infrastructure/database/unit-of-work-postgres.service';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { Repositories } from '@/shared/unit-of-work';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry.repository';
import { PgKycProfileRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-profile.repository';
import { PgKycSubmissionRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-submission.repository';

describe('PostgresUnitOfWork', () => {
  const mockTxExecutor = { query: jest.fn() };
  const runInTransaction = jest.fn((fn: (tx: unknown) => unknown) =>
    fn(mockTxExecutor),
  );
  const databaseService = {
    runInTransaction,
  } as unknown as DatabaseService;

  let uow: PostgresUnitOfWork;

  beforeEach(() => {
    jest.clearAllMocks();
    uow = new PostgresUnitOfWork(databaseService);
  });

  it('builds the four repositories and passes them to the callback', async () => {
    let received: Repositories | undefined;

    await uow.run((repos) => {
      received = repos;
      return Promise.resolve(undefined);
    });

    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(received?.transactionRepo).toBeInstanceOf(PgTransactionRepository);
    expect(received?.ledgerRepo).toBeInstanceOf(PgLedgerEntryRepository);
    expect(received?.kycProfileRepo).toBeInstanceOf(PgKycProfileRepository);
    expect(received?.kycSubmissionRepo).toBeInstanceOf(
      PgKycSubmissionRepository,
    );
  });

  it('propagates the callback return value', async () => {
    const result = await uow.run(() => Promise.resolve('done'));

    expect(result).toBe('done');
  });
});
