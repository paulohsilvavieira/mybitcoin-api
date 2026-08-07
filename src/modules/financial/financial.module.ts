import { Module } from '@nestjs/common';
import { FinancialController } from '@/modules/financial/presentation/financial.controller';
import { ConfirmDepositWithUowUseCase } from '@/modules/financial/application/confirm-deposit-with-uow.usecase';
import { GetBalancesUseCase } from '@/modules/financial/application/get-balances.usecase';
import {
  TransactionRepository,
  LedgerEntryRepository,
  TransactionReadRepository,
  LedgerEntryReadRepository,
  WalletRepository,
  WalletReadRepository,
} from '@/modules/financial/domain/repositories';
import { UnitOfWork } from '@/shared/unit-of-work';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry.repository';
import { PgTransactionReadRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction-read.repository';
import { PgLedgerEntryReadRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry-read.repository';
import { PgWalletRepository } from '@/modules/financial/infrastructure/persistence/pg-wallet.repository';
import { PgWalletReadRepository } from '@/modules/financial/infrastructure/persistence/pg-wallet-read.repository';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { IdentityModule } from '@/modules/identity/identity.module';
import { ApiKeyGuard } from '@/modules/financial/presentation/guards/api-key.guard';

@Module({
  imports: [IdentityModule],
  controllers: [FinancialController],
  providers: [
    ApiKeyGuard,
    {
      provide: ConfirmDepositWithUowUseCase,
      useFactory: (uow: UnitOfWork) => new ConfirmDepositWithUowUseCase(uow),
      inject: [UnitOfWork],
    },
    {
      provide: GetBalancesUseCase,
      useFactory: (walletReadRepo: WalletReadRepository) =>
        new GetBalancesUseCase(walletReadRepo),
      inject: [WalletReadRepository],
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
      provide: WalletRepository,
      useFactory: (db: DatabaseService) => new PgWalletRepository(db),
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
    {
      provide: WalletReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgWalletReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
  ],
})
export class FinancialModule {}
