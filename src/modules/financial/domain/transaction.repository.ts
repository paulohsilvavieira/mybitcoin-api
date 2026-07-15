import { Transaction } from '@/modules/financial/domain/transaction.entity';

export abstract class TransactionRepository {
  abstract findById(id: string): Promise<Transaction | null>;
  abstract save(transaction: Transaction): Promise<void>;
}
