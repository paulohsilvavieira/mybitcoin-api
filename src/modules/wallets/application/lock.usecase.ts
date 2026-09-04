import { UnitOfWork } from '@/shared/unit-of-work';
import { AssetRepository } from '@/modules/wallets/domain/repositories';
import { TransactionOperation } from '@/modules/wallets/domain/entities/transaction.entity';
import { BalanceMovementUseCase } from '@/modules/wallets/application/balance-movement.usecase';

/**
 * Primitiva `lock`: transferência USER_AVAILABLE -> USER_LOCKED do mesmo dono.
 * `available -= amount; locked += amount` (total inalterado). Exige `available >= amount`.
 */
export class LockUseCase extends BalanceMovementUseCase {
  protected readonly operation: TransactionOperation = 'lock';

  constructor(uow: UnitOfWork, assetRepo: AssetRepository) {
    super(uow, assetRepo);
  }
}
