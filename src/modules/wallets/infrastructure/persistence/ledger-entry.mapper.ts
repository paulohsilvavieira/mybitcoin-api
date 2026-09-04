import {
  LedgerEntry,
  EntryType,
} from '@/modules/wallets/domain/entities/ledger-entry.entity';

export interface LedgerEntryRow {
  id: string;
  transaction_id: string;
  account: string;
  asset: string;
  entry_type: string;
  amount_minor: string;
  balance_before_minor: string | null;
  balance_after_minor: string | null;
  created_at: Date;
}

export class LedgerEntryMapper {
  static toDomain(row: LedgerEntryRow): LedgerEntry {
    return LedgerEntry.reconstitute({
      id: row.id,
      transactionId: row.transaction_id,
      account: row.account,
      asset: row.asset,
      entryType: row.entry_type as EntryType,
      amountMinor: BigInt(row.amount_minor),
      balanceBeforeMinor:
        row.balance_before_minor === null
          ? null
          : BigInt(row.balance_before_minor),
      balanceAfterMinor:
        row.balance_after_minor === null
          ? null
          : BigInt(row.balance_after_minor),
      createdAt: row.created_at,
    });
  }
}
