import { DomainError } from '@/shared/domain.error';

/**
 * INTERNO — nunca chega ao cliente. Lançado pelo repositório quando o INSERT de
 * emissão de token cai no índice parcial `UNIQUE (user_id) WHERE consumed_at IS
 * NULL` (corrida entre duas solicitações concorrentes do mesmo usuário).
 * `RequestPasswordReset` captura, não envia e-mail e responde 202 neutro.
 */
export class ActiveResetTokenExistsError extends DomainError {
  readonly code = 'ACTIVE_RESET_TOKEN_EXISTS';

  constructor() {
    super('An active password reset token already exists for this user');
  }
}
