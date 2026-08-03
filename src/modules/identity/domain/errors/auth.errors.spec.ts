import { InvalidCredentialsError } from '@/modules/identity/domain/errors/invalid-credentials.error';
import { AccountSuspendedError } from '@/modules/identity/domain/errors/account-suspended.error';
import { UserNotFoundError } from '@/modules/identity/domain/errors/user-not-found.error';
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
});
