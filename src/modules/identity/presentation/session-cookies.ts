import { randomBytes } from 'node:crypto';
import { CookieOptions, Response } from 'express';

export const SESSION_COOKIE_NAME = '__Host-session';
export const CSRF_COOKIE_NAME = '__Host-csrf';

const BASE_COOKIE_OPTIONS: CookieOptions = {
  secure: true,
  sameSite: 'strict',
  path: '/',
};

export function setSessionCookies(
  response: Response,
  params: { token: string; expiresAt: Date },
): void {
  const maxAge = params.expiresAt.getTime() - Date.now();
  const csrfToken = randomBytes(32).toString('hex');

  response.cookie(SESSION_COOKIE_NAME, params.token, {
    ...BASE_COOKIE_OPTIONS,
    httpOnly: true,
    maxAge,
  });
  response.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...BASE_COOKIE_OPTIONS,
    httpOnly: false,
    maxAge,
  });
}

export function clearSessionCookies(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, BASE_COOKIE_OPTIONS);
  response.clearCookie(CSRF_COOKIE_NAME, BASE_COOKIE_OPTIONS);
}
