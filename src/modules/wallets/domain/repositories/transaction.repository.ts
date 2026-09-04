import {
  Transaction,
  TransactionOperation,
  ReferenceType,
} from '@/modules/wallets/domain/entities/transaction.entity';

export abstract class TransactionRepository {
  abstract findById(id: string): Promise<Transaction | null>;
  /** Idempotência: a tripla `(referenceType, referenceId, operation)` é única. */
  abstract findByReference(
    referenceType: ReferenceType,
    referenceId: string,
    operation: TransactionOperation,
  ): Promise<Transaction | null>;
  abstract save(transaction: Transaction): Promise<void>;
}
