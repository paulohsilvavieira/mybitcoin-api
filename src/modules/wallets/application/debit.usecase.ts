import { UnitOfWork } from '@/shared/unit-of-work';
import { AssetRepository } from '@/modules/wallets/domain/repositories';
import { TransactionOperation } from '@/modules/wallets/domain/entities/transaction.entity';
import { BalanceMovementUseCase } from '@/modules/wallets/application/balance-movement.usecase';

/**
 * Primitiva `debit`: débito em USER_AVAILABLE:{u}:{asset}, crédito na contraparte
 * (default SETTLEMENT:{asset}). Exige `available >= amount`.
 */
export class DebitUseCase extends BalanceMovementUseCase {
  protected readonly operation: TransactionOperation = 'debit';

  constructor(uow: UnitOfWork, assetRepo: AssetRepository) {
    super(uow, assetRepo);
  }
}
