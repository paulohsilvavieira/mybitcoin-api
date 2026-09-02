import { TransactionReadRepository } from '@/modules/financial/domain/repositories';
import {
  Transaction,
  TransactionStatus,
} from '@/modules/financial/domain/entities';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { findTransactionByIdQuery } from '@/modules/financial/infrastructure/persistence/transaction.sql';

interface TransactionRow {
  id: string;
  account_id: string;
  type: string;
  asset: string;
  amount_satoshi: string;
  status: string;
  created_at: Date;
}

export class PgTransactionReadRepository extends TransactionReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findById(id: string): Promise<Transaction | null> {
    const { query, values } = findTransactionByIdQuery(id);
    const result = await this.db.query<TransactionRow>(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.toDomain(result.rows[0]);
  }

  private toDomain(row: TransactionRow): Transaction {
    return Transaction.restore({
      id: row.id,
      accountId: row.account_id,
      type: row.type,
      asset: row.asset,
      amountSatoshi: BigInt(row.amount_satoshi),
      status: row.status as TransactionStatus,
      createdAt: row.created_at,
    });
  }
}
