import { LedgerEntry } from '@/modules/financial/domain/entities';

export abstract class LedgerEntryReadRepository {
  abstract findByTransactionId(transactionId: string): Promise<LedgerEntry[]>;
}
