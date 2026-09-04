import { UnitOfWork } from '@/shared/unit-of-work';
import { AssetRepository } from '@/modules/wallets/domain/repositories';
import { TransactionOperation } from '@/modules/wallets/domain/entities/transaction.entity';
import { BalanceMovementUseCase } from '@/modules/wallets/application/balance-movement.usecase';

/**
 * Primitiva `credit`: débito na contraparte (default EXCHANGE:TREASURY:{asset}),
 * crédito em USER_AVAILABLE:{u}:{asset}. `available += amount`.
 */
export class CreditUseCase extends BalanceMovementUseCase {
  protected readonly operation: TransactionOperation = 'credit';

  constructor(uow: UnitOfWork, assetRepo: AssetRepository) {
    super(uow, assetRepo);
  }
}
