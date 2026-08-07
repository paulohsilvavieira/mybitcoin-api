import { TransactionRepository } from '@/modules/financial/domain/repositories';
import {
  Transaction,
  TransactionStatus,
} from '@/modules/financial/domain/entities';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import {
  findTransactionByIdQuery,
  saveTransactionQuery,
} from '@/modules/financial/infrastructure/persistence/transaction.sql';

interface TransactionRow {
  id: string;
  account_id: string;
  type: string;
  asset: string;
  amount_satoshi: string;
  status: string;
  created_at: Date;
}

export class PgTransactionRepository extends TransactionRepository {
  constructor(private readonly db: QueryExecutor) {
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

  async save(transaction: Transaction): Promise<void> {
    const { query, values } = saveTransactionQuery({
      id: transaction.id,
      accountId: transaction.accountId,
      type: transaction.type,
      asset: transaction.asset,
      amountSatoshi: transaction.amountSatoshi.toString(),
      status: transaction.status,
      createdAt: transaction.createdAt,
    });
    await this.db.query(query, values);
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
