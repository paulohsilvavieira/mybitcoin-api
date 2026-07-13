import { DomainError } from '../../../../shared/domain.error';

export class InvalidEmailError extends DomainError {
  readonly code = 'INVALID_EMAIL';

  constructor(email: string) {
    super(`Invalid email format: '${email}'`);
  }
}
