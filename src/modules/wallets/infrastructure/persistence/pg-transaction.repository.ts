import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { TransactionRepository } from '@/modules/wallets/domain/repositories';
import {
  Transaction,
  TransactionOperation,
  ReferenceType,
} from '@/modules/wallets/domain/entities/transaction.entity';
import {
  TransactionMapper,
  TransactionRow,
} from '@/modules/wallets/infrastructure/persistence/transaction.mapper';
import {
  FIND_TRANSACTION_BY_ID,
  FIND_TRANSACTION_BY_REFERENCE,
  INSERT_TRANSACTION,
} from '@/modules/wallets/infrastructure/persistence/transaction.sql';

export class PgTransactionRepository extends TransactionRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async findById(id: string): Promise<Transaction | null> {
    const result = await this.db.query<TransactionRow>(FIND_TRANSACTION_BY_ID, [
      id,
    ]);
    return result.rows.length
      ? TransactionMapper.toDomain(result.rows[0])
      : null;
  }

  async findByReference(
    referenceType: ReferenceType,
    referenceId: string,
    operation: TransactionOperation,
  ): Promise<Transaction | null> {
    const result = await this.db.query<TransactionRow>(
      FIND_TRANSACTION_BY_REFERENCE,
      [referenceType, referenceId, operation],
    );
    return result.rows.length
      ? TransactionMapper.toDomain(result.rows[0])
      : null;
  }

  async save(transaction: Transaction): Promise<void> {
    await this.db.query(INSERT_TRANSACTION, [
      transaction.id,
      transaction.operation,
      transaction.referenceType,
      transaction.referenceId,
      transaction.createdAt,
    ]);
  }
}
