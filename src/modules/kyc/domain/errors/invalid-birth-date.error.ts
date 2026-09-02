import { DomainError } from '@/shared/domain.error';

export class InvalidBirthDateError extends DomainError {
  readonly code = 'INVALID_BIRTH_DATE';

  constructor(reason: string) {
    super(`Invalid birth date: ${reason}`);
  }
}
