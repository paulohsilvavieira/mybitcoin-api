import { UnitOfWork } from '@/shared/unit-of-work';
import { AssetRepository } from '@/modules/wallets/domain/repositories';
import { TransactionOperation } from '@/modules/wallets/domain/entities/transaction.entity';
import { BalanceMovementUseCase } from '@/modules/wallets/application/balance-movement.usecase';

/**
 * Primitiva `unlock`: transferência USER_LOCKED -> USER_AVAILABLE do mesmo dono.
 * `locked -= amount; available += amount` (total inalterado). Exige `locked >= amount`.
 */
export class UnlockUseCase extends BalanceMovementUseCase {
  protected readonly operation: TransactionOperation = 'unlock';

  constructor(uow: UnitOfWork, assetRepo: AssetRepository) {
    super(uow, assetRepo);
  }
}
