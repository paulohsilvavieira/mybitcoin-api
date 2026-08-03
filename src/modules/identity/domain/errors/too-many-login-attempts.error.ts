import { DomainError } from '@/shared/domain.error';

/**
 * LOG-006. Mensagem estática e genérica — não confirma nem nega a existência
 * da conta (o bloqueio é rastreado por email normalizado, não por userId, e
 * se aplica igualmente a emails inexistentes — ver LoginAttemptRepository).
 */
export class TooManyLoginAttemptsError extends DomainError {
  readonly code = 'TOO_MANY_LOGIN_ATTEMPTS';

  constructor() {
    super('Too many failed login attempts. Try again later.');
  }
}
