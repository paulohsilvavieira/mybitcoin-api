import {
  buildBalancedLegs,
  assertBalanced,
} from '@/modules/wallets/domain/services/transaction-legs.service';
import { LedgerAccount } from '@/modules/wallets/domain/value-objects/ledger-account.vo';
import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';
import { UnbalancedTransactionError } from '@/modules/wallets/domain/errors/unbalanced-transaction.error';

describe('transaction-legs domain service', () => {
  it('monta 2 pernas balanceadas (débito operacional NULL, crédito de usuário com before/after)', () => {
    const legs = buildBalancedLegs({
      transactionId: 'tx1',
      asset: 'BTC',
      amountMinor: 50_000_000n,
      debit: {
        account: LedgerAccount.treasury('BTC'),
        balanceBeforeMinor: null,
        balanceAfterMinor: null,
      },
      credit: {
        account: LedgerAccount.userAvailable('u1', 'BTC'),
        balanceBeforeMinor: 0n,
        balanceAfterMinor: 50_000_000n,
      },
    });

    expect(legs).toHaveLength(2);
    const [debit, credit] = legs;
    expect(debit.entryType).toBe('debit');
    expect(debit.balanceBeforeMinor).toBeNull();
    expect(debit.balanceAfterMinor).toBeNull();
    expect(credit.entryType).toBe('credit');
    expect(credit.balanceBeforeMinor).toBe(0n);
    expect(credit.balanceAfterMinor).toBe(50_000_000n);
  });

  it('assertBalanced detecta Σ débitos ≠ Σ créditos', () => {
    const mk = (type: 'debit' | 'credit', amt: bigint) =>
      LedgerEntry.create({
        transactionId: 'tx1',
        account: LedgerAccount.treasury('BTC'),
        asset: 'BTC',
        entryType: type,
        amountMinor: amt,
        balanceBeforeMinor: null,
        balanceAfterMinor: null,
      });

    expect(() => assertBalanced([mk('debit', 10n), mk('credit', 9n)])).toThrow(
      UnbalancedTransactionError,
    );
    expect(() =>
      assertBalanced([mk('debit', 10n), mk('credit', 10n)]),
    ).not.toThrow();
  });
});
