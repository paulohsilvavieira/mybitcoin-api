import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '@/shared/domain.error';

const STATUS_BY_CODE: Record<string, number> = {
  SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  SESSION_EXPIRED: HttpStatus.UNAUTHORIZED,
  SESSION_ALREADY_REVOKED: HttpStatus.CONFLICT,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  // Invariante quebrada (sessão sem usuário) — 401 força re-autenticação,
  // mesmo tratamento de sessão inválida (ADR 0005).
  USER_NOT_FOUND: HttpStatus.UNAUTHORIZED,
  // LOG-006 — bloqueio por excesso de tentativas de login.
  TOO_MANY_LOGIN_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,
  // ADR 0006 — recuperação de senha: INVALID_RESET_TOKEN, WEAK_PASSWORD e
  // ACTIVE_RESET_TOKEN_EXISTS caem no DEFAULT_STATUS (422), que já é o
  // tratamento correto — nenhuma entrada explícita é necessária.
  // ACCOUNT_SUSPENDED (redeem com conta suspensa) já está mapeado para 403 acima.
};

const DEFAULT_STATUS = HttpStatus.UNPROCESSABLE_ENTITY;

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[error.code] ?? DEFAULT_STATUS;
    response.status(status).json({ code: error.code, message: error.message });
  }
}
