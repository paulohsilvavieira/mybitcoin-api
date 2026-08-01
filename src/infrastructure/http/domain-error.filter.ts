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
