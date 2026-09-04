import { Login } from '@/modules/identity/application/login.usecase';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserId } from '@/modules/identity/domain/value-objects/user-id.vo';
import {
  UserStatus,
  UserStatusType,
} from '@/modules/identity/domain/value-objects/user-status.vo';
import { InvalidCredentialsError } from '@/modules/identity/domain/errors/invalid-credentials.error';
import { AccountSuspendedError } from '@/modules/identity/domain/errors/account-suspended.error';
import { InvalidEmailError } from '@/modules/identity/domain/errors/invalid-email.error';
import { TooManyLoginAttemptsError } from '@/modules/identity/domain/errors/too-many-login-attempts.error';
import { EmailNotVerifiedError } from '@/modules/identity/domain/errors/email-not-verified.error';

describe('Login', () => {
  const mockUserRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    findByEmailVerificationTokenHash: jest.fn(),
    issueEmailVerificationTokenIfDue: jest.fn(),
  };
  const mockLoginAttemptRepo = {
    record: jest.fn(),
    countFailedSinceLastSuccess: jest.fn(),
  };
  const comparePassword = jest.fn();

  let sut: Login;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoginAttemptRepo.countFailedSinceLastSuccess.mockResolvedValue({
      count: 0,
      mostRecentFailureAt: null,
    });
    sut = new Login(mockUserRepo, mockLoginAttemptRepo, comparePassword);
  });

  function buildUser(status: UserStatusType = 'ACTIVE'): User {
    return User.reconstitute({
      id: UserId.create(),
      name: 'Ada Lovelace',
      email: Email.create('ada.lovelace@example.com'),
      passwordHash: 'hashed-password',
      status: UserStatus.from(status),
      emailVerified: status === 'ACTIVE',
      termsAccepted: true,
      registrationIp: '127.0.0.1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const IP = '203.0.113.10';

  it('autentica usuário ACTIVE com credenciais válidas', async () => {
    const user = buildUser('ACTIVE');
    mockUserRepo.findByEmail.mockResolvedValue(user);
    comparePassword.mockResolvedValue(true);

    const output = await sut.execute({
      email: 'ada.lovelace@example.com',
      password: 'Str0ng!Pass',
      ipAddress: IP,
    });

    expect(output).toEqual({
      userId: user.id.toString(),
      name: 'Ada Lovelace',
      email: 'ada.lovelace@example.com',
      status: 'ACTIVE',
    });
  });

  it('lança EmailNotVerifiedError para usuário PENDING_EMAIL_VERIFICATION (LOG-002 revertido, ADR 0006)', async () => {
    const user = buildUser('PENDING_EMAIL_VERIFICATION');
    mockUserRepo.findByEmail.mockResolvedValue(user);
    comparePassword.mockResolvedValue(true);

    const error = await sut
      .execute({
        email: 'ada.lovelace@example.com',
        password: 'Str0ng!Pass',
        ipAddress: IP,
      })
      .catch((thrown: EmailNotVerifiedError) => thrown);

    expect(error).toBeInstanceOf(EmailNotVerifiedError);
    expect(error.userId).toBe(user.id.toString());
  });

  it('não registra a tentativa (nem sucesso nem falha) para conta PENDING_EMAIL_VERIFICATION', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(
      buildUser('PENDING_EMAIL_VERIFICATION'),
    );
    comparePassword.mockResolvedValue(true);

    await sut
      .execute({
        email: 'ada.lovelace@example.com',
        password: 'Str0ng!Pass',
        ipAddress: IP,
      })
      .catch(() => undefined);

    expect(mockLoginAttemptRepo.record).not.toHaveBeenCalled();
  });

  it('compara a senha informada contra o hash persistido do usuário', async () => {
    const user = buildUser();
    mockUserRepo.findByEmail.mockResolvedValue(user);
    comparePassword.mockResolvedValue(true);

    await sut.execute({
      email: 'ada.lovelace@example.com',
      password: 'Str0ng!Pass',
      ipAddress: IP,
    });

    expect(comparePassword).toHaveBeenCalledWith(
      'Str0ng!Pass',
      'hashed-password',
    );
  });

  it('lança InvalidCredentialsError quando o email não está cadastrado', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      sut.execute({
        email: 'ghost@example.com',
        password: 'Str0ng!Pass',
        ipAddress: IP,
      }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('não chama comparePassword quando o email não existe', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      sut.execute({
        email: 'ghost@example.com',
        password: 'Str0ng!Pass',
        ipAddress: IP,
      }),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(comparePassword).not.toHaveBeenCalled();
  });

  it('lança InvalidCredentialsError quando a senha está incorreta', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser());
    comparePassword.mockResolvedValue(false);

    await expect(
      sut.execute({
        email: 'ada.lovelace@example.com',
        password: 'wrong-password',
        ipAddress: IP,
      }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('LOG-003: email inexistente e senha errada produzem code e mensagem idênticos', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    const unknownEmailError = await sut
      .execute({
        email: 'ghost@example.com',
        password: 'Str0ng!Pass',
        ipAddress: IP,
      })
      .catch((error: InvalidCredentialsError) => error);

    mockUserRepo.findByEmail.mockResolvedValue(buildUser());
    comparePassword.mockResolvedValue(false);
    const wrongPasswordError = await sut
      .execute({
        email: 'ada.lovelace@example.com',
        password: 'wrong',
        ipAddress: IP,
      })
      .catch((error: InvalidCredentialsError) => error);

    expect(unknownEmailError.code).toBe(wrongPasswordError.code);
    expect(unknownEmailError.message).toBe(wrongPasswordError.message);
    expect(unknownEmailError.message).toBe('Invalid email or password');
  });

  it('lança AccountSuspendedError quando a conta está suspensa', async () => {
    const user = buildUser('SUSPENDED');
    mockUserRepo.findByEmail.mockResolvedValue(user);
    comparePassword.mockResolvedValue(true);

    const error = await sut
      .execute({
        email: 'ada.lovelace@example.com',
        password: 'Str0ng!Pass',
        ipAddress: IP,
      })
      .catch((thrown: AccountSuspendedError) => thrown);

    expect(error).toBeInstanceOf(AccountSuspendedError);
    expect(error.userId).toBe(user.id.toString());
  });

  it('não revela suspensão quando a senha também está errada', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser('SUSPENDED'));
    comparePassword.mockResolvedValue(false);

    await expect(
      sut.execute({
        email: 'ada.lovelace@example.com',
        password: 'wrong',
        ipAddress: IP,
      }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('lança InvalidEmailError quando o formato do email é inválido', async () => {
    await expect(
      sut.execute({
        email: 'not-an-email',
        password: 'Str0ng!Pass',
        ipAddress: IP,
      }),
    ).rejects.toThrow(InvalidEmailError);
    expect(mockUserRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('busca o usuário no repositório de escrita com o email normalizado', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser());
    comparePassword.mockResolvedValue(true);

    await sut.execute({
      email: '  ADA.LOVELACE@example.com  ',
      password: 'Str0ng!Pass',
      ipAddress: IP,
    });

    const emailArg = mockUserRepo.findByEmail.mock.calls[0][0] as Email;
    expect(emailArg.toString()).toBe('ada.lovelace@example.com');
  });

  describe('LOG-006 — bloqueio por excesso de tentativas', () => {
    it('registra tentativa falha com o email normalizado e sem userId quando a conta não existe', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      await sut
        .execute({
          email: '  Ghost@Example.com  ',
          password: 'Str0ng!Pass',
          ipAddress: IP,
        })
        .catch(() => undefined);

      expect(mockLoginAttemptRepo.record).toHaveBeenCalledTimes(1);
      const recorded = mockLoginAttemptRepo.record.mock.calls[0][0];
      expect(recorded).toMatchObject({
        email: 'ghost@example.com',
        ipAddress: IP,
        successful: false,
        userId: null,
      });
    });

    it('registra tentativa falha com userId quando o email existe mas a senha está errada', async () => {
      const user = buildUser();
      mockUserRepo.findByEmail.mockResolvedValue(user);
      comparePassword.mockResolvedValue(false);

      await sut
        .execute({
          email: 'ada.lovelace@example.com',
          password: 'wrong',
          ipAddress: IP,
        })
        .catch(() => undefined);

      const recorded = mockLoginAttemptRepo.record.mock.calls[0][0];
      expect(recorded).toMatchObject({
        successful: false,
        userId: user.id.toString(),
      });
    });

    it('registra tentativa bem-sucedida', async () => {
      const user = buildUser();
      mockUserRepo.findByEmail.mockResolvedValue(user);
      comparePassword.mockResolvedValue(true);

      await sut.execute({
        email: 'ada.lovelace@example.com',
        password: 'Str0ng!Pass',
        ipAddress: IP,
      });

      const recorded = mockLoginAttemptRepo.record.mock.calls[0][0];
      expect(recorded).toMatchObject({
        successful: true,
        userId: user.id.toString(),
      });
    });

    it('lança TooManyLoginAttemptsError quando a política de bloqueio considera o email bloqueado', async () => {
      mockLoginAttemptRepo.countFailedSinceLastSuccess.mockResolvedValue({
        count: 5,
        mostRecentFailureAt: new Date(),
      });

      await expect(
        sut.execute({
          email: 'ada.lovelace@example.com',
          password: 'Str0ng!Pass',
          ipAddress: IP,
        }),
      ).rejects.toThrow(TooManyLoginAttemptsError);
      expect(mockUserRepo.findByEmail).not.toHaveBeenCalled();
      expect(comparePassword).not.toHaveBeenCalled();
    });

    it('bloqueia mesmo para email inexistente (não revela existência de conta via lockout)', async () => {
      mockLoginAttemptRepo.countFailedSinceLastSuccess.mockResolvedValue({
        count: 5,
        mostRecentFailureAt: new Date(),
      });

      await expect(
        sut.execute({
          email: 'ghost@example.com',
          password: 'anything',
          ipAddress: IP,
        }),
      ).rejects.toThrow(TooManyLoginAttemptsError);
    });

    it('não bloqueia quando a última falha que cruzou o limiar já passou de 15 minutos', async () => {
      const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);
      mockLoginAttemptRepo.countFailedSinceLastSuccess.mockResolvedValue({
        count: 5,
        mostRecentFailureAt: sixteenMinutesAgo,
      });
      mockUserRepo.findByEmail.mockResolvedValue(buildUser());
      comparePassword.mockResolvedValue(true);

      await expect(
        sut.execute({
          email: 'ada.lovelace@example.com',
          password: 'Str0ng!Pass',
          ipAddress: IP,
        }),
      ).resolves.toBeDefined();
    });
  });
});
