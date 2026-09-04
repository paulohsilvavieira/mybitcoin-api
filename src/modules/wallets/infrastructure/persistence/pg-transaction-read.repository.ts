import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { TransactionReadRepository } from '@/modules/wallets/domain/repositories';
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
} from '@/modules/wallets/infrastructure/persistence/transaction.sql';

export class PgTransactionReadRepository extends TransactionReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
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
}
