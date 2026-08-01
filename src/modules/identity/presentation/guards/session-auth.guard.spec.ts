import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { SessionNotFoundError } from '@/modules/identity/domain/errors/session-not-found.error';
import { SessionExpiredError } from '@/modules/identity/domain/errors/session-expired.error';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '@/modules/identity/presentation/session-cookies';

describe('SessionAuthGuard', () => {
  const mockValidateSession = { execute: jest.fn() };
  let sut: SessionAuthGuard;

  const clearCookieMock = jest.fn();
  const response = { clearCookie: clearCookieMock };

  function makeContext(params: {
    cookies?: Record<string, string>;
    method?: string;
    headers?: Record<string, string>;
  }): ExecutionContext {
    const request: any = {
      cookies: params.cookies ?? {},
      method: params.method ?? 'GET',
      headers: params.headers ?? {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new SessionAuthGuard(mockValidateSession as any);
  });

  it('lança UnauthorizedException quando não há cookie de sessão', async () => {
    const context = makeContext({});
    await expect(sut.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lança UnauthorizedException e limpa cookies quando a sessão é inválida', async () => {
    mockValidateSession.execute.mockRejectedValue(
      new SessionNotFoundError('unknown'),
    );
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'bad-token' },
    });

    await expect(sut.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(clearCookieMock).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.any(Object),
    );
  });

  it('lança UnauthorizedException quando a sessão está expirada', async () => {
    mockValidateSession.execute.mockRejectedValue(
      new SessionExpiredError('session-1'),
    );
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'expired-token' },
    });

    await expect(sut.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('permite GET com sessão válida sem exigir CSRF', async () => {
    mockValidateSession.execute.mockResolvedValue({
      session: { userId: 'user-1' },
    });
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'good-token' },
      method: 'GET',
    });

    await expect(sut.canActivate(context)).resolves.toBe(true);
  });

  it('lança ForbiddenException em mutação sem header X-CSRF-Token', async () => {
    mockValidateSession.execute.mockResolvedValue({
      session: { userId: 'user-1' },
    });
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'good-token' },
      method: 'DELETE',
    });

    await expect(sut.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lança ForbiddenException quando o header X-CSRF-Token diverge do cookie', async () => {
    mockValidateSession.execute.mockResolvedValue({
      session: { userId: 'user-1' },
    });
    const context = makeContext({
      cookies: {
        [SESSION_COOKIE_NAME]: 'good-token',
        [CSRF_COOKIE_NAME]: 'csrf-value',
      },
      method: 'POST',
      headers: { 'x-csrf-token': 'different-value' },
    });

    await expect(sut.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite mutação quando o header X-CSRF-Token bate com o cookie', async () => {
    mockValidateSession.execute.mockResolvedValue({
      session: { userId: 'user-1' },
    });
    const context = makeContext({
      cookies: {
        [SESSION_COOKIE_NAME]: 'good-token',
        [CSRF_COOKIE_NAME]: 'csrf-value',
      },
      method: 'POST',
      headers: { 'x-csrf-token': 'csrf-value' },
    });

    await expect(sut.canActivate(context)).resolves.toBe(true);
  });

  it('popula request.user com o userId da sessão', async () => {
    mockValidateSession.execute.mockResolvedValue({
      session: { userId: 'user-42' },
    });
    const request: any = {
      cookies: { [SESSION_COOKIE_NAME]: 'good-token' },
      method: 'GET',
      headers: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    await sut.canActivate(context);

    expect(request.user).toEqual({ userId: 'user-42' });
  });
});
