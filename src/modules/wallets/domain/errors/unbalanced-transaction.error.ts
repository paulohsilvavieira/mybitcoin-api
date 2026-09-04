import { DomainError } from '@/shared/domain.error';

/**
 * Σ débitos ≠ Σ créditos numa transação. É bug de programação (viola INV-007 /
 * global 20) — deve falhar alto e forçar rollback da UnitOfWork. Mapeado para HTTP 500.
 */
export class UnbalancedTransactionError extends DomainError {
  readonly code = 'UNBALANCED_TRANSACTION';

  constructor(
    readonly totalDebitMinor: bigint,
    readonly totalCreditMinor: bigint,
  ) {
    super(
      `Unbalanced transaction: Σ debits (${totalDebitMinor}) ≠ Σ credits (${totalCreditMinor})`,
    );
  }
}
