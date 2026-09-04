import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { LedgerEntryRepository } from '@/modules/wallets/domain/repositories';
import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';
import {
  LedgerEntryMapper,
  LedgerEntryRow,
} from '@/modules/wallets/infrastructure/persistence/ledger-entry.mapper';
import {
  INSERT_LEDGER_ENTRY,
  FIND_LEDGER_ENTRIES_BY_TRANSACTION_ID,
  SUM_LEDGER_ENTRIES_BY_ACCOUNT,
} from '@/modules/wallets/infrastructure/persistence/ledger-entry.sql';

interface SumRow {
  debit_minor: string;
  credit_minor: string;
}

export class PgLedgerEntryRepository extends LedgerEntryRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async save(entry: LedgerEntry): Promise<void> {
    await this.db.query(INSERT_LEDGER_ENTRY, [
      entry.id,
      entry.transactionId,
      entry.account,
      entry.asset,
      entry.entryType,
      entry.amountMinor.toString(),
      entry.balanceBeforeMinor === null
        ? null
        : entry.balanceBeforeMinor.toString(),
      entry.balanceAfterMinor === null
        ? null
        : entry.balanceAfterMinor.toString(),
      entry.createdAt,
    ]);
  }

  async findByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    const result = await this.db.query<LedgerEntryRow>(
      FIND_LEDGER_ENTRIES_BY_TRANSACTION_ID,
      [transactionId],
    );
    return result.rows.map((row) => LedgerEntryMapper.toDomain(row));
  }

  async sumByAccount(
    account: string,
  ): Promise<{ debitMinor: bigint; creditMinor: bigint }> {
    const result = await this.db.query<SumRow>(SUM_LEDGER_ENTRIES_BY_ACCOUNT, [
      account,
    ]);
    const row = result.rows[0];
    return {
      debitMinor: BigInt(row.debit_minor),
      creditMinor: BigInt(row.credit_minor),
    };
  }
}
