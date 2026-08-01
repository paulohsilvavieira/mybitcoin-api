import { Transaction } from '@/modules/financial/domain/entities';

export abstract class TransactionReadRepository {
  abstract findById(id: string): Promise<Transaction | null>;
}
