import {
  TransactionRepository,
  LedgerEntryRepository,
} from '@/modules/financial/domain/repositories';
import {
  KycProfileRepository,
  KycSubmissionRepository,
} from '@/modules/kyc/domain/repositories';

export interface Repositories {
  transactionRepo: TransactionRepository;
  ledgerRepo: LedgerEntryRepository;
  kycProfileRepo: KycProfileRepository;
  kycSubmissionRepo: KycSubmissionRepository;
}

export abstract class UnitOfWork {
  abstract run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}
