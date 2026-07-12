import { LedgerEntry } from './ledger-entry.entity';

export abstract class LedgerEntryRepository {
  abstract save(entry: LedgerEntry): Promise<void>;
  abstract findByTransactionId(transactionId: string): Promise<LedgerEntry[]>;
}
