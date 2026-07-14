import { LedgerEntryRepository } from '@/modules/financial/domain/ledger-entry.repository';
import { LedgerEntry } from '@/modules/financial/domain/ledger-entry.entity';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import {
  saveLedgerEntryQuery,
  findLedgerEntriesByTransactionIdQuery,
} from '@/modules/financial/infrastructure/persistence/ledger-entry.sql';

interface LedgerEntryRow {
  id: string;
  transaction_id: string;
  account: string;
  type: string;
  amount_satoshi: string;
  created_at: Date;
}

export class PgLedgerEntryRepository implements LedgerEntryRepository {
  constructor(private readonly db: QueryExecutor) {}

  async save(entry: LedgerEntry): Promise<void> {
    const { query, values } = saveLedgerEntryQuery({
      id: entry.id,
      transactionId: entry.transactionId,
      account: entry.account,
      type: entry.type,
      amountSatoshi: entry.amountSatoshi.toString(),
      createdAt: entry.createdAt,
    });
    await this.db.query(query, values);
  }

  async findByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    const { query, values } =
      findLedgerEntriesByTransactionIdQuery(transactionId);
    const result = await this.db.query<LedgerEntryRow>(query, values);

    return result.rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: LedgerEntryRow): LedgerEntry {
    return LedgerEntry.create({
      transactionId: row.transaction_id,
      account: row.account,
      type: row.type as 'debit' | 'credit',
      amountSatoshi: BigInt(row.amount_satoshi),
    });
  }
}
