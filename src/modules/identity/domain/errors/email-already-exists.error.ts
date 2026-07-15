import { DomainError } from '@/shared/domain.error';

export class EmailAlreadyExistsError extends DomainError {
  readonly code = 'EMAIL_ALREADY_EXISTS';

  constructor(email: string) {
    super(`Email '${email}' is already registered`);
  }
}
