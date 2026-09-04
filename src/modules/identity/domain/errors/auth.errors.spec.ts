import { InvalidCredentialsError } from '@/modules/identity/domain/errors/invalid-credentials.error';
import { AccountSuspendedError } from '@/modules/identity/domain/errors/account-suspended.error';
import { UserNotFoundError } from '@/modules/identity/domain/errors/user-not-found.error';
import { EmailVerificationTokenInvalidError } from '@/modules/identity/domain/errors/email-verification-token-invalid.error';
import { EmailVerificationTokenExpiredError } from '@/modules/identity/domain/errors/email-verification-token-expired.error';
import { EmailNotVerifiedError } from '@/modules/identity/domain/errors/email-not-verified.error';
import { DomainError } from '@/shared/domain.error';

const SENSITIVE_USER_ID = '3f7b8c2e-1a4d-4e9a-9c3f-5d6e7a8b9c0d';

describe('Erros de autenticação', () => {
  describe('InvalidCredentialsError', () => {
    it('é um DomainError com code INVALID_CREDENTIALS', () => {
      const error = new InvalidCredentialsError();

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('INVALID_CREDENTIALS');
    });

    it('LOG-003: mensagem é estática e não interpola nenhum dado do request', () => {
      expect(new InvalidCredentialsError().message).toBe(
        'Invalid email or password',
      );
    });

    it('LOG-003: instâncias distintas produzem exatamente a mesma mensagem', () => {
      expect(new InvalidCredentialsError().message).toBe(
        new InvalidCredentialsError().message,
      );
    });
  });

  describe('AccountSuspendedError', () => {
    it('é um DomainError com code ACCOUNT_SUSPENDED', () => {
      const error = new AccountSuspendedError(SENSITIVE_USER_ID);

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('não expõe o userId na mensagem devolvida ao cliente', () => {
      const error = new AccountSuspendedError(SENSITIVE_USER_ID);

      expect(error.message).toBe('This account has been suspended');
      expect(error.message).not.toContain(SENSITIVE_USER_ID);
    });

    it('mantém o userId acessível para log estruturado', () => {
      expect(new AccountSuspendedError(SENSITIVE_USER_ID).userId).toBe(
        SENSITIVE_USER_ID,
      );
    });
  });

  describe('UserNotFoundError', () => {
    it('é um DomainError com code USER_NOT_FOUND', () => {
      const error = new UserNotFoundError(SENSITIVE_USER_ID);

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('USER_NOT_FOUND');
    });

    it('não expõe o userId na mensagem devolvida ao cliente', () => {
      const error = new UserNotFoundError(SENSITIVE_USER_ID);

      expect(error.message).toBe('User not found');
      expect(error.message).not.toContain(SENSITIVE_USER_ID);
    });

    it('mantém o userId acessível para log estruturado', () => {
      expect(new UserNotFoundError(SENSITIVE_USER_ID).userId).toBe(
        SENSITIVE_USER_ID,
      );
    });
  });

  describe('EmailVerificationTokenInvalidError', () => {
    it('é um DomainError com code EMAIL_VERIFICATION_TOKEN_INVALID', () => {
      const error = new EmailVerificationTokenInvalidError();

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('EMAIL_VERIFICATION_TOKEN_INVALID');
    });

    it('mensagem é estática', () => {
      expect(new EmailVerificationTokenInvalidError().message).toBe(
        'Invalid or already used verification token',
      );
    });

    it('instâncias distintas produzem exatamente a mesma mensagem', () => {
      expect(new EmailVerificationTokenInvalidError().message).toBe(
        new EmailVerificationTokenInvalidError().message,
      );
    });
  });

  describe('EmailVerificationTokenExpiredError', () => {
    it('é um DomainError com code EMAIL_VERIFICATION_TOKEN_EXPIRED', () => {
      const error = new EmailVerificationTokenExpiredError();

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('EMAIL_VERIFICATION_TOKEN_EXPIRED');
    });

    it('mensagem é estática', () => {
      expect(new EmailVerificationTokenExpiredError().message).toBe(
        'Verification token has expired',
      );
    });
  });

  describe('EmailNotVerifiedError', () => {
    it('é um DomainError com code EMAIL_NOT_VERIFIED', () => {
      const error = new EmailNotVerifiedError(SENSITIVE_USER_ID);

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('não expõe o userId na mensagem devolvida ao cliente', () => {
      const error = new EmailNotVerifiedError(SENSITIVE_USER_ID);

      expect(error.message).toBe('Please verify your email before logging in');
      expect(error.message).not.toContain(SENSITIVE_USER_ID);
    });

    it('mantém o userId acessível para log estruturado', () => {
      expect(new EmailNotVerifiedError(SENSITIVE_USER_ID).userId).toBe(
        SENSITIVE_USER_ID,
      );
    });
  });
});
