import { Injectable } from '@nestjs/common';
import { UnitOfWork, Repositories } from '../../shared/unit-of-work';
import { DatabaseService } from './database.service';
import { PgTransactionRepository } from '../../modules/financial/infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from '../../modules/financial/infrastructure/persistence/pg-ledger-entry.repository';

@Injectable()
export class PostgresUnitOfWork extends UnitOfWork {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.runInTransaction(async (tx) => {
      const repositories: Repositories = {
        transactionRepo: new PgTransactionRepository(tx),
        ledgerRepo: new PgLedgerEntryRepository(tx),
      };
      return fn(repositories);
    });
  }
}
