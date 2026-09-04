import {
  WalletRepository,
  BalanceRepository,
  TransactionRepository,
  LedgerEntryRepository,
} from '@/modules/wallets/domain/repositories';

export interface Repositories {
  walletRepo: WalletRepository;
  balanceRepo: BalanceRepository;
  transactionRepo: TransactionRepository;
  ledgerRepo: LedgerEntryRepository;
}

export abstract class UnitOfWork {
  abstract run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}
