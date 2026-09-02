import { DomainError } from '@/shared/domain.error';

/** KYC aprovado é terminal — nova submissão é rejeitada. */
export class KycAlreadyApprovedError extends DomainError {
  readonly code = 'KYC_ALREADY_APPROVED';

  constructor(userId: string) {
    super(`KYC for user '${userId}' is already approved`);
  }
}
