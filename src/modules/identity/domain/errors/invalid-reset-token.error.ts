import { DomainError } from '@/shared/domain.error';

/**
 * REC-004 — erro único e genérico para token de reset não encontrado, expirado
 * ou já consumido. A mensagem é ESTÁTICA: distinguir os casos criaria um
 * oráculo ("este token existiu") sem ganho de UX. `DomainErrorFilter` devolve
 * `error.message` verbatim ao cliente.
 */
export class InvalidResetTokenError extends DomainError {
  readonly code = 'INVALID_RESET_TOKEN';

  constructor() {
    super('Invalid or expired password reset token');
  }
}
