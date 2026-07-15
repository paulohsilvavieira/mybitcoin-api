import { DomainError } from '@/shared/domain.error';

export class TermsNotAcceptedError extends DomainError {
  readonly code = 'TERMS_NOT_ACCEPTED';

  constructor() {
    super('User must accept Terms of Use and Privacy Policy');
  }
}
