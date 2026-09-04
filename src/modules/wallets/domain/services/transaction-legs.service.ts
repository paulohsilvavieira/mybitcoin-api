import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';
import { LedgerAccount } from '@/modules/wallets/domain/value-objects/ledger-account.vo';
import { UnbalancedTransactionError } from '@/modules/wallets/domain/errors/unbalanced-transaction.error';

export interface LegInput {
  account: LedgerAccount;
  /** Saldo da conta antes/depois desta perna; `null` para contas operacionais. */
  balanceBeforeMinor: bigint | null;
  balanceAfterMinor: bigint | null;
}

/**
 * Domain service: dada uma operação (1 perna débito + 1 perna crédito), monta os
 * dois `LedgerEntry` com `balanceBefore/After` e valida `Σ débitos = Σ créditos`
 * (INV-007). Lança `UnbalancedTransactionError` se as pernas não baterem.
 */
export function buildBalancedLegs(params: {
  transactionId: string;
  asset: string;
  amountMinor: bigint;
  debit: LegInput;
  credit: LegInput;
}): LedgerEntry[] {
  const debitEntry = LedgerEntry.create({
    transactionId: params.transactionId,
    account: params.debit.account,
    asset: params.asset,
    entryType: 'debit',
    amountMinor: params.amountMinor,
    balanceBeforeMinor: params.debit.balanceBeforeMinor,
    balanceAfterMinor: params.debit.balanceAfterMinor,
  });

  const creditEntry = LedgerEntry.create({
    transactionId: params.transactionId,
    account: params.credit.account,
    asset: params.asset,
    entryType: 'credit',
    amountMinor: params.amountMinor,
    balanceBeforeMinor: params.credit.balanceBeforeMinor,
    balanceAfterMinor: params.credit.balanceAfterMinor,
  });

  const legs = [debitEntry, creditEntry];
  assertBalanced(legs);
  return legs;
}

export function assertBalanced(legs: LedgerEntry[]): void {
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const leg of legs) {
    if (leg.entryType === 'debit') totalDebit += leg.amountMinor;
    else totalCredit += leg.amountMinor;
  }
  if (totalDebit !== totalCredit) {
    throw new UnbalancedTransactionError(totalDebit, totalCredit);
  }
}
