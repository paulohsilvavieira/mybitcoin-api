import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import {
  LedgerEntryReadRepository,
  LedgerHistoryPage,
} from '@/modules/wallets/domain/repositories';
import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';
import {
  LedgerEntryMapper,
  LedgerEntryRow,
} from '@/modules/wallets/infrastructure/persistence/ledger-entry.mapper';
import {
  FIND_LEDGER_ENTRIES_BY_TRANSACTION_ID,
  FIND_USER_LEDGER_HISTORY,
  COUNT_USER_LEDGER_HISTORY,
} from '@/modules/wallets/infrastructure/persistence/ledger-entry.sql';

type HistoryRow = LedgerEntryRow & { scale: number };

export class PgLedgerEntryReadRepository extends LedgerEntryReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    const result = await this.db.query<LedgerEntryRow>(
      FIND_LEDGER_ENTRIES_BY_TRANSACTION_ID,
      [transactionId],
    );
    return result.rows.map((row) => LedgerEntryMapper.toDomain(row));
  }

  async findUserHistory(
    userId: string,
    params: { limit: number; offset: number },
  ): Promise<LedgerHistoryPage> {
    const [rows, countResult] = await Promise.all([
      this.db.query<HistoryRow>(FIND_USER_LEDGER_HISTORY, [
        userId,
        params.limit,
        params.offset,
      ]),
      this.db.query<{ total: string }>(COUNT_USER_LEDGER_HISTORY, [userId]),
    ]);

    return {
      items: rows.rows.map((row) => ({
        entry: LedgerEntryMapper.toDomain(row),
        scale: Number(row.scale),
      })),
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  }
}
