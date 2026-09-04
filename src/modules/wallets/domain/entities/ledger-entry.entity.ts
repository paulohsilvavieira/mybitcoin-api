import { LedgerAccount } from '@/modules/wallets/domain/value-objects/ledger-account.vo';
import { InvalidAmountError } from '@/modules/wallets/domain/errors/invalid-amount.error';

export type EntryType = 'debit' | 'credit';

/**
 * Uma perna de uma `Transaction`. Imutável (INV-014): sem métodos de mutação,
 * e o repositório não expõe `update`/`delete`.
 * `balanceBeforeMinor`/`balanceAfterMinor` só são preenchidos para pernas de
 * conta de usuário; para contas operacionais são `null`.
 */
export class LedgerEntry {
  private constructor(
    readonly id: string,
    readonly transactionId: string,
    readonly account: string,
    readonly asset: string,
    readonly entryType: EntryType,
    readonly amountMinor: bigint,
    readonly balanceBeforeMinor: bigint | null,
    readonly balanceAfterMinor: bigint | null,
    readonly createdAt: Date,
  ) {}

  static create(params: {
    transactionId: string;
    account: LedgerAccount;
    asset: string;
    entryType: EntryType;
    amountMinor: bigint;
    balanceBeforeMinor: bigint | null;
    balanceAfterMinor: bigint | null;
  }): LedgerEntry {
    if (params.amountMinor <= 0n) {
      throw new InvalidAmountError(params.asset, params.amountMinor);
    }
    return new LedgerEntry(
      crypto.randomUUID(),
      params.transactionId,
      params.account.toString(),
      params.asset,
      params.entryType,
      params.amountMinor,
      params.balanceBeforeMinor,
      params.balanceAfterMinor,
      new Date(),
    );
  }

  static reconstitute(params: {
    id: string;
    transactionId: string;
    account: string;
    asset: string;
    entryType: EntryType;
    amountMinor: bigint;
    balanceBeforeMinor: bigint | null;
    balanceAfterMinor: bigint | null;
    createdAt: Date;
  }): LedgerEntry {
    return new LedgerEntry(
      params.id,
      params.transactionId,
      params.account,
      params.asset,
      params.entryType,
      params.amountMinor,
      params.balanceBeforeMinor,
      params.balanceAfterMinor,
      params.createdAt,
    );
  }
}
