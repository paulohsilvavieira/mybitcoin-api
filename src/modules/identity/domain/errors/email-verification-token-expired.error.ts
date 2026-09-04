import { DomainError } from '@/shared/domain.error';

export class EmailVerificationTokenExpiredError extends DomainError {
  readonly code = 'EMAIL_VERIFICATION_TOKEN_EXPIRED';

  constructor() {
    super('Verification token has expired');
  }
}
