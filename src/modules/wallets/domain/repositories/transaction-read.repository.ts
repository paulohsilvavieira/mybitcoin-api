import {
  Transaction,
  TransactionOperation,
  ReferenceType,
} from '@/modules/wallets/domain/entities/transaction.entity';

export abstract class TransactionReadRepository {
  abstract findById(id: string): Promise<Transaction | null>;
  abstract findByReference(
    referenceType: ReferenceType,
    referenceId: string,
    operation: TransactionOperation,
  ): Promise<Transaction | null>;
}
