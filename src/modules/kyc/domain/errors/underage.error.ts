import { DomainError } from '@/shared/domain.error';

export class UnderageError extends DomainError {
  readonly code = 'UNDERAGE';

  constructor(minimumAge: number) {
    super(`User must be at least ${minimumAge} years old`);
  }
}
