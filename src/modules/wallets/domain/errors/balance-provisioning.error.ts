import { DomainError } from '@/shared/domain.error';

/**
 * Falha ao provisionar a linha de `balances` sob o lock: após `INSERT ... ON
 * CONFLICT DO NOTHING` seguido de `SELECT ... FOR UPDATE`, a linha ainda não foi
 * encontrada. É invariante quebrada — fail-loud, força rollback da UnitOfWork
 * (nunca deixar o `save()` UPDATE-only virar no-op silencioso e divergir do ledger).
 */
export class BalanceProvisioningError extends DomainError {
  readonly code = 'BALANCE_PROVISIONING_FAILED';

  constructor(
    readonly walletId: string,
    readonly asset: string,
  ) {
    super(
      `Failed to provision balance row for wallet '${walletId}' / asset '${asset}'`,
    );
  }
}
