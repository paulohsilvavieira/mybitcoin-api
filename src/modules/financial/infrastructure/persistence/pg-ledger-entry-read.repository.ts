import { LedgerEntryReadRepository } from '@/modules/financial/domain/repositories';
import { LedgerEntry } from '@/modules/financial/domain/entities';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { findLedgerEntriesByTransactionIdQuery } from '@/modules/financial/infrastructure/persistence/ledger-entry.sql';

interface LedgerEntryRow {
  id: string;
  transaction_id: string;
  account: string;
  type: string;
  amount_satoshi: string;
  created_at: Date;
}

export class PgLedgerEntryReadRepository extends LedgerEntryReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    const { query, values } =
      findLedgerEntriesByTransactionIdQuery(transactionId);
    const result = await this.db.query<LedgerEntryRow>(query, values);

    return result.rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: LedgerEntryRow): LedgerEntry {
    return LedgerEntry.restore({
      id: row.id,
      transactionId: row.transaction_id,
      account: row.account,
      type: row.type as 'debit' | 'credit',
      amountSatoshi: BigInt(row.amount_satoshi),
      createdAt: row.created_at,
    });
  }
}
