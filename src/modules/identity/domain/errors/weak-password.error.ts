import { DomainError } from '../../../../shared/domain.error';

export class WeakPasswordError extends DomainError {
  readonly code = 'WEAK_PASSWORD';

  constructor(reason: string) {
    super(`Weak password: ${reason}`);
  }
}
