import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';

/**
 * Imutabilidade do ledger em código (INV-014, ADR 0006 gap #4): NÃO declara
 * `update` nem `delete` — não compila tentar mutar uma perna. O banco reforça
 * com trigger `BEFORE UPDATE/DELETE`.
 */
export abstract class LedgerEntryRepository {
  abstract save(entry: LedgerEntry): Promise<void>;
  abstract findByTransactionId(transactionId: string): Promise<LedgerEntry[]>;
  abstract sumByAccount(account: string): Promise<{
    debitMinor: bigint;
    creditMinor: bigint;
  }>;
}
