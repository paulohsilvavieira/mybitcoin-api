import { Module } from '@nestjs/common';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { UnitOfWork } from '@/shared/unit-of-work';
import { IdentityModule } from '@/modules/identity/identity.module';

import {
  AssetRepository,
  AssetReadRepository,
  WalletRepository,
  WalletReadRepository,
  BalanceRepository,
  TransactionRepository,
  TransactionReadRepository,
  LedgerEntryRepository,
  LedgerEntryReadRepository,
} from '@/modules/wallets/domain/repositories';

import { PgAssetRepository } from '@/modules/wallets/infrastructure/persistence/pg-asset.repository';
import { PgAssetReadRepository } from '@/modules/wallets/infrastructure/persistence/pg-asset-read.repository';
import { PgWalletRepository } from '@/modules/wallets/infrastructure/persistence/pg-wallet.repository';
import { PgWalletReadRepository } from '@/modules/wallets/infrastructure/persistence/pg-wallet-read.repository';
import { PgBalanceRepository } from '@/modules/wallets/infrastructure/persistence/pg-balance.repository';
import { PgTransactionRepository } from '@/modules/wallets/infrastructure/persistence/pg-transaction.repository';
import { PgTransactionReadRepository } from '@/modules/wallets/infrastructure/persistence/pg-transaction-read.repository';
import { PgLedgerEntryRepository } from '@/modules/wallets/infrastructure/persistence/pg-ledger-entry.repository';
import { PgLedgerEntryReadRepository } from '@/modules/wallets/infrastructure/persistence/pg-ledger-entry-read.repository';

import { CreditUseCase } from '@/modules/wallets/application/credit.usecase';
import { DebitUseCase } from '@/modules/wallets/application/debit.usecase';
import { LockUseCase } from '@/modules/wallets/application/lock.usecase';
import { UnlockUseCase } from '@/modules/wallets/application/unlock.usecase';
import { ConfirmDepositUseCase } from '@/modules/wallets/application/confirm-deposit.usecase';
import { GetWalletBalancesUseCase } from '@/modules/wallets/application/get-wallet-balances.usecase';
import { GetLedgerHistoryUseCase } from '@/modules/wallets/application/get-ledger-history.usecase';

import { WalletController } from '@/modules/wallets/presentation/wallet.controller';

/**
 * Obs #1 do ADR 0006 (RE-VALIDAÇÃO): o guard de sessão é reusado importando o
 * `IdentityModule`, que passa a exportar `SessionAuthGuard` + `ValidateSession`.
 * Não há import de domínio cross-módulo — só o guard, na camada de presentation.
 */
@Module({
  imports: [IdentityModule],
  controllers: [WalletController],
  providers: [
    {
      provide: AssetRepository,
      useFactory: (db: QueryExecutor) => new PgAssetRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: AssetReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgAssetReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
    {
      provide: WalletRepository,
      useFactory: (db: QueryExecutor) => new PgWalletRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: WalletReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgWalletReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
    {
      provide: BalanceRepository,
      useFactory: (db: QueryExecutor) => new PgBalanceRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: TransactionRepository,
      useFactory: (db: QueryExecutor) => new PgTransactionRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: TransactionReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgTransactionReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
    {
      provide: LedgerEntryRepository,
      useFactory: (db: QueryExecutor) => new PgLedgerEntryRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: LedgerEntryReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgLedgerEntryReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },

    {
      provide: CreditUseCase,
      useFactory: (uow: UnitOfWork, assetRepo: AssetRepository) =>
        new CreditUseCase(uow, assetRepo),
      inject: [UnitOfWork, AssetRepository],
    },
    {
      provide: DebitUseCase,
      useFactory: (uow: UnitOfWork, assetRepo: AssetRepository) =>
        new DebitUseCase(uow, assetRepo),
      inject: [UnitOfWork, AssetRepository],
    },
    {
      provide: LockUseCase,
      useFactory: (uow: UnitOfWork, assetRepo: AssetRepository) =>
        new LockUseCase(uow, assetRepo),
      inject: [UnitOfWork, AssetRepository],
    },
    {
      provide: UnlockUseCase,
      useFactory: (uow: UnitOfWork, assetRepo: AssetRepository) =>
        new UnlockUseCase(uow, assetRepo),
      inject: [UnitOfWork, AssetRepository],
    },
    {
      provide: ConfirmDepositUseCase,
      useFactory: (credit: CreditUseCase) => new ConfirmDepositUseCase(credit),
      inject: [CreditUseCase],
    },
    {
      provide: GetWalletBalancesUseCase,
      useFactory: (walletReadRepo: WalletReadRepository) =>
        new GetWalletBalancesUseCase(walletReadRepo),
      inject: [WalletReadRepository],
    },
    {
      provide: GetLedgerHistoryUseCase,
      useFactory: (ledgerReadRepo: LedgerEntryReadRepository) =>
        new GetLedgerHistoryUseCase(ledgerReadRepo),
      inject: [LedgerEntryReadRepository],
    },
  ],
  exports: [
    CreditUseCase,
    DebitUseCase,
    LockUseCase,
    UnlockUseCase,
    ConfirmDepositUseCase,
  ],
})
export class WalletsModule {}
