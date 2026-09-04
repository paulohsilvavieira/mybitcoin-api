export type TransactionOperation = 'credit' | 'debit' | 'lock' | 'unlock';

export type ReferenceType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'ORDER'
  | 'TRADE'
  | 'ADJUSTMENT';

export interface TransactionReference {
  referenceType: ReferenceType;
  referenceId: string;
}

/**
 * Aggregate root do lado contábil. Agrupa as pernas (`LedgerEntry`) de uma
 * operação. SEM coluna `status` (ADR 0006, gap #7): uma transação só existe se
 * foi commitada; falha => rollback => nenhuma linha.
 */
export class Transaction {
  private constructor(
    readonly id: string,
    readonly operation: TransactionOperation,
    readonly referenceType: ReferenceType,
    readonly referenceId: string,
    readonly createdAt: Date,
  ) {}

  static create(params: {
    operation: TransactionOperation;
    reference: TransactionReference;
  }): Transaction {
    return new Transaction(
      crypto.randomUUID(),
      params.operation,
      params.reference.referenceType,
      params.reference.referenceId,
      new Date(),
    );
  }

  static reconstitute(params: {
    id: string;
    operation: TransactionOperation;
    referenceType: ReferenceType;
    referenceId: string;
    createdAt: Date;
  }): Transaction {
    return new Transaction(
      params.id,
      params.operation,
      params.referenceType,
      params.referenceId,
      params.createdAt,
    );
  }
}
