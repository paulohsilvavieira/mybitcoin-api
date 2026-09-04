import {
  Transaction,
  TransactionOperation,
  ReferenceType,
} from '@/modules/wallets/domain/entities/transaction.entity';

export interface TransactionRow {
  id: string;
  operation: string;
  reference_type: string;
  reference_id: string;
  created_at: Date;
}

export class TransactionMapper {
  static toDomain(row: TransactionRow): Transaction {
    return Transaction.reconstitute({
      id: row.id,
      operation: row.operation as TransactionOperation,
      referenceType: row.reference_type as ReferenceType,
      referenceId: row.reference_id,
      createdAt: row.created_at,
    });
  }
}
