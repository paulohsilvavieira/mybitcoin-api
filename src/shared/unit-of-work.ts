import {
  TransactionRepository,
  LedgerEntryRepository,
  WalletRepository,
} from '@/modules/financial/domain/repositories';

export interface Repositories {
  transactionRepo: TransactionRepository;
  ledgerRepo: LedgerEntryRepository;
  walletRepo: WalletRepository;
}

export abstract class UnitOfWork {
  abstract run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}
