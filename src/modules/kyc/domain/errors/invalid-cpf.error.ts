import { DomainError } from '@/shared/domain.error';

export class InvalidCpfError extends DomainError {
  readonly code = 'INVALID_CPF';

  constructor(reason: string) {
    super(`Invalid CPF: ${reason}`);
  }
}
