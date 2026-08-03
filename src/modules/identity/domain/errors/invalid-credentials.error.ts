import { DomainError } from '@/shared/domain.error';

/**
 * LOG-003 — a mensagem é ESTÁTICA e idêntica para "e-mail não encontrado" e
 * "senha incorreta". Nunca interpolar e-mail, senha ou qualquer dado do
 * request: `DomainErrorFilter` devolve `error.message` ao cliente verbatim, e
 * qualquer variação reabriria a enumeração de contas que esta regra fecha.
 */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Invalid email or password');
  }
}
