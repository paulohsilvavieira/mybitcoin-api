import { LedgerEntry } from '@/modules/financial/domain/entities';

export abstract class LedgerEntryRepository {
  abstract save(entry: LedgerEntry): Promise<void>;
  abstract findByTransactionId(transactionId: string): Promise<LedgerEntry[]>;
}
