import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';

/** Perna do ledger acrescida da escala do ativo (para formatação na apresentação). */
export interface LedgerEntryHistoryItem {
  entry: LedgerEntry;
  scale: number;
}

export interface LedgerHistoryPage {
  items: LedgerEntryHistoryItem[];
  total: number;
}

export abstract class LedgerEntryReadRepository {
  abstract findByTransactionId(transactionId: string): Promise<LedgerEntry[]>;
  /**
   * Histórico paginado das pernas das contas do usuário (USER_AVAILABLE +
   * USER_LOCKED), ordenado por `created_at DESC, id DESC`.
   */
  abstract findUserHistory(
    userId: string,
    params: { limit: number; offset: number },
  ): Promise<LedgerHistoryPage>;
}
