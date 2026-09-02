import { Injectable } from '@nestjs/common';
import { UnitOfWork, Repositories } from '@/shared/unit-of-work';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry.repository';
import { PgKycProfileRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-profile.repository';
import { PgKycSubmissionRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-submission.repository';

@Injectable()
export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private readonly databaseService: DatabaseService) {}

  async run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    return await this.databaseService.runInTransaction(
      async (transactionDatabase) => {
        const repositories: Repositories = {
          transactionRepo: new PgTransactionRepository(transactionDatabase),
          ledgerRepo: new PgLedgerEntryRepository(transactionDatabase),
          kycProfileRepo: new PgKycProfileRepository(transactionDatabase),
          kycSubmissionRepo: new PgKycSubmissionRepository(transactionDatabase),
        };
        return fn(repositories);
      },
    );
  }
}
