import { Module } from '@nestjs/common';
import { FinancialController } from './presentation/financial.controller';
import { ConfirmDepositUseCase } from './application/confirm-deposit.usecase';
import { ConfirmDepositWithUowUseCase } from './application/confirm-deposit-with-uow.usecase';
import { TransactionRepository } from './domain/transaction.repository';
import { LedgerEntryRepository } from './domain/ledger-entry.repository';
import { UnitOfWork } from '../../shared/unit-of-work';
import { PgTransactionRepository } from './infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from './infrastructure/persistence/pg-ledger-entry.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';

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
  ],
})
export class FinancialModule {}
