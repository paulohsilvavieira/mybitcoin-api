import { Module } from '@nestjs/common';
import { FinancialController } from '@/modules/financial/presentation/financial.controller';
import { ConfirmDepositUseCase } from '@/modules/financial/application/confirm-deposit.usecase';
import { ConfirmDepositWithUowUseCase } from '@/modules/financial/application/confirm-deposit-with-uow.usecase';
import { TransactionRepository } from '@/modules/financial/domain/transaction.repository';
import { LedgerEntryRepository } from '@/modules/financial/domain/ledger-entry.repository';
import { UnitOfWork } from '@/shared/unit-of-work';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry.repository';
import { DatabaseService } from '@/infrastructure/database/database.service';

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
