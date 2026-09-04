import { LedgerEntryReadRepository } from '@/modules/wallets/domain/repositories';
import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';

/** Tamanho máximo de página do histórico do ledger. Fonte única — o DTO valida com este mesmo valor. */
export const LEDGER_MAX_PAGE_SIZE = 100;
/** Tamanho de página padrão quando o cliente não informa `pageSize`. */
export const LEDGER_DEFAULT_PAGE_SIZE = 20;

export interface LedgerHistoryItemView {
  entry: LedgerEntry;
  scale: number;
}

export interface LedgerHistoryView {
  items: LedgerHistoryItemView[];
  page: number;
  pageSize: number;
  total: number;
}

/** Leitura paginada do histórico do ledger do usuário na réplica (ADR 0003). */
export class GetLedgerHistoryUseCase {
  constructor(private readonly ledgerReadRepo: LedgerEntryReadRepository) {}

  async execute(input: {
    userId: string;
    page: number;
    pageSize: number;
  }): Promise<LedgerHistoryView> {
    // O DTO (class-validator) já garante page >= 1 e 1 <= pageSize <= LEDGER_MAX_PAGE_SIZE.
    // O clamp aqui é defesa em profundidade — o use case pode ser chamado por
    // outro contexto sem passar pelo ValidationPipe.
    const page = Math.max(1, Math.trunc(input.page));
    const pageSize = Math.min(
      LEDGER_MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(input.pageSize)),
    );
    const offset = (page - 1) * pageSize;

    const { items, total } = await this.ledgerReadRepo.findUserHistory(
      input.userId,
      { limit: pageSize, offset },
    );

    return { items, page, pageSize, total };
  }
}
