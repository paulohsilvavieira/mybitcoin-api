import {
  TransactionRepository,
  LedgerEntryRepository,
} from '@/modules/financial/domain/repositories';

export interface Repositories {
  transactionRepo: TransactionRepository;
  ledgerRepo: LedgerEntryRepository;
}

export abstract class UnitOfWork {
  abstract run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}
