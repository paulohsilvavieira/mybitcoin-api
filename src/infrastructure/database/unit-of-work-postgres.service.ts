import { Injectable } from '@nestjs/common';
import { UnitOfWork, Repositories } from '@/shared/unit-of-work';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { PgWalletRepository } from '@/modules/wallets/infrastructure/persistence/pg-wallet.repository';
import { PgBalanceRepository } from '@/modules/wallets/infrastructure/persistence/pg-balance.repository';
import { PgTransactionRepository } from '@/modules/wallets/infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from '@/modules/wallets/infrastructure/persistence/pg-ledger-entry.repository';

@Injectable()
export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private readonly databaseService: DatabaseService) {}

  async run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    return await this.databaseService.runInTransaction(async (tx) => {
      const repositories: Repositories = {
        walletRepo: new PgWalletRepository(tx),
        balanceRepo: new PgBalanceRepository(tx),
        transactionRepo: new PgTransactionRepository(tx),
        ledgerRepo: new PgLedgerEntryRepository(tx),
      };
      return fn(repositories);
    });
  }
}
