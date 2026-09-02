import { DomainError } from '@/shared/domain.error';

export class InvalidNationalityError extends DomainError {
  readonly code = 'INVALID_NATIONALITY';

  constructor(value: string) {
    super(`Invalid nationality: '${value}' is not an ISO 3166-1 alpha-2 code`);
  }
}
