import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ValidateSession } from '@/modules/identity/application/validate-session.usecase';
import { SessionNotFoundError } from '@/modules/identity/domain/errors/session-not-found.error';
import { SessionExpiredError } from '@/modules/identity/domain/errors/session-expired.error';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  clearSessionCookies,
} from '@/modules/identity/presentation/session-cookies';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly validateSession: ValidateSession) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException();
    }

    let userId: string;
    try {
      const { session } = await this.validateSession.execute({ token });
      userId = session.userId;
    } catch (error) {
      if (
        error instanceof SessionNotFoundError ||
        error instanceof SessionExpiredError
      ) {
        clearSessionCookies(response);
        throw new UnauthorizedException();
      }
      throw error;
    }

    if (MUTATING_METHODS.has(request.method)) {
      const csrfCookie = request.cookies?.[CSRF_COOKIE_NAME];
      const csrfHeader = request.headers['x-csrf-token'];
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        throw new ForbiddenException();
      }
    }

    request.user = { userId };
    return true;
  }
}
