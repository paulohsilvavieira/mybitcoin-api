import { TransactionRepository } from '../modules/financial/domain/transaction.repository';
import { LedgerEntryRepository } from '../modules/financial/domain/ledger-entry.repository';

export interface Repositories {
  transactionRepo: TransactionRepository;
  ledgerRepo: LedgerEntryRepository;
}

export abstract class UnitOfWork {
  abstract run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}
