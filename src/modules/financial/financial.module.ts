import { Module } from '@nestjs/common';
import { FinancialController } from '@/modules/financial/presentation/financial.controller';
import { ConfirmDepositUseCase } from '@/modules/financial/application/confirm-deposit.usecase';
import { ConfirmDepositWithUowUseCase } from '@/modules/financial/application/confirm-deposit-with-uow.usecase';
import {
  TransactionRepository,
  LedgerEntryRepository,
  TransactionReadRepository,
  LedgerEntryReadRepository,
} from '@/modules/financial/domain/repositories';
import { UnitOfWork } from '@/shared/unit-of-work';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry.repository';
import { PgTransactionReadRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction-read.repository';
import { PgLedgerEntryReadRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry-read.repository';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';

@Module({
  controllers: [FinancialController],
  providers: [
    {
      provide: ConfirmDepositUseCase,
      useFactory: (
        txRepo: TransactionRepository,
        ledgerRepo: LedgerEntryRepository,
      ) => new ConfirmDepositUseCase(txRepo, ledgerRepo),
      inject: [TransactionRepository, LedgerEntryRepository],
    },
    {
      provide: ConfirmDepositWithUowUseCase,
      useFactory: (uow: UnitOfWork) => new ConfirmDepositWithUowUseCase(uow),
      inject: [UnitOfWork],
    },
    {
      provide: TransactionRepository,
      useFactory: (db: DatabaseService) => new PgTransactionRepository(db),
      inject: [DatabaseService],
    },
    {
      provide: LedgerEntryRepository,
      useFactory: (db: DatabaseService) => new PgLedgerEntryRepository(db),
      inject: [DatabaseService],
    },
    {
      provide: TransactionReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgTransactionReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
    {
      provide: LedgerEntryReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgLedgerEntryReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
  ],
})
export class FinancialModule {}
