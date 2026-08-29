import { ConfirmPasswordReset } from '@/modules/identity/application/confirm-password-reset.usecase';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserId } from '@/modules/identity/domain/value-objects/user-id.vo';
import {
  UserStatus,
  UserStatusType,
} from '@/modules/identity/domain/value-objects/user-status.vo';
import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';
import { InvalidResetTokenError } from '@/modules/identity/domain/errors/invalid-reset-token.error';
import { AccountSuspendedError } from '@/modules/identity/domain/errors/account-suspended.error';
import { WeakPasswordError } from '@/modules/identity/domain/errors/weak-password.error';

describe('ConfirmPasswordReset', () => {
  const mockPasswordResetTokenRepo = {
    save: jest.fn(),
    consume: jest.fn(),
    findByTokenHash: jest.fn(),
    consumeAllActiveForUser: jest.fn(),
  };
  const mockUserRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
  };
  const mockSessionRepo = {
    findActiveByUserId: jest.fn(),
    revokeAll: jest.fn(),
  };
  const mockLoginAttemptRepo = {
    record: jest.fn(),
    countFailedSinceLastSuccess: jest.fn(),
  };
  const mockUow = { run: jest.fn() };
  const hashToken = jest.fn();
  const hashPassword = jest.fn();
  const clock = jest.fn();

  const IP = '203.0.113.10';
  const NOW = new Date('2026-08-29T12:00:00.000Z');
  const STRONG_PASSWORD = 'Str0ng!Pass';

  let sut: ConfirmPasswordReset;
  let userId: UserId;

  beforeEach(() => {
    jest.clearAllMocks();
    userId = UserId.create();
    hashToken.mockReturnValue('hashed-token');
    hashPassword.mockResolvedValue('$2b$12$newhash');
    clock.mockReturnValue(NOW);
    mockSessionRepo.findActiveByUserId.mockResolvedValue([]);
    mockSessionRepo.revokeAll.mockResolvedValue(undefined);
    mockUserRepo.save.mockResolvedValue(undefined);
    mockPasswordResetTokenRepo.consume.mockResolvedValue(undefined);
    mockLoginAttemptRepo.record.mockResolvedValue(undefined);
    mockUow.run.mockImplementation(
      async (cb: (repos: unknown) => Promise<unknown>) =>
        cb({
          userRepo: mockUserRepo,
          sessionRepo: mockSessionRepo,
          passwordResetTokenRepo: mockPasswordResetTokenRepo,
          loginAttemptRepo: mockLoginAttemptRepo,
        }),
    );

    sut = new ConfirmPasswordReset(
      mockPasswordResetTokenRepo,
      mockUserRepo,
      mockUow as never,
      hashToken,
      hashPassword,
      clock,
    );
  });

  function buildUser(status: UserStatusType = 'ACTIVE'): User {
    return User.reconstitute({
      id: userId,
      name: 'Ada Lovelace',
      email: Email.create('ada@example.com'),
      passwordHash: 'old-hash',
      status: UserStatus.from(status),
      emailVerified: status === 'ACTIVE',
      termsAccepted: true,
      registrationIp: '127.0.0.1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  function redeemableToken(): PasswordResetToken {
    return PasswordResetToken.reconstitute({
      id: 'token-1',
      userId: userId.toString(),
      tokenHash: 'hashed-token',
      requestedIp: IP,
      createdAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 20 * 60 * 1000),
      consumedAt: null,
    });
  }

  function fakeSession(id: string) {
    return { id: { toString: () => id } };
  }

  const input = {
    token: 'plain-token',
    newPassword: STRONG_PASSWORD,
    ipAddress: IP,
  };

  it('com token válido troca a senha, consome o token, revoga sessões e limpa o lockout', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      redeemableToken(),
    );
    const user = buildUser('ACTIVE');
    mockUserRepo.findById.mockResolvedValue(user);
    mockSessionRepo.findActiveByUserId.mockResolvedValue([
      fakeSession('sess-1'),
      fakeSession('sess-2'),
    ]);

    const result = await sut.execute(input);

    expect(hashToken).toHaveBeenCalledWith('plain-token');
    expect(hashPassword).toHaveBeenCalledWith(STRONG_PASSWORD);
    expect(user.passwordHash).toBe('$2b$12$newhash');
    expect(mockUserRepo.save).toHaveBeenCalledWith(user);
    expect(mockPasswordResetTokenRepo.consume).toHaveBeenCalledTimes(1);
    expect(mockSessionRepo.revokeAll).toHaveBeenCalledWith(userId.toString());
    expect(mockLoginAttemptRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ada@example.com',
        successful: true,
        userId: userId.toString(),
      }),
    );
    expect(result.revokedSessionCount).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      sessionId: 'sess-1',
      userId: userId.toString(),
      reason: 'password_reset',
    });
  });

  it('atomicidade: as escritas do redeem acontecem dentro de uow.run', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      redeemableToken(),
    );
    mockUserRepo.findById.mockResolvedValue(buildUser('ACTIVE'));

    await sut.execute(input);

    expect(mockUow.run).toHaveBeenCalledTimes(1);
    // consume do token só é chamado pelo repo transacional do callback
    expect(mockPasswordResetTokenRepo.consume).toHaveBeenCalledWith(
      expect.objectContaining({ consumedAt: NOW }),
    );
  });

  it('REC-004: permite nova senha igual à atual (não bloqueia)', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      redeemableToken(),
    );
    // hashPassword resolve para o MESMO hash que o usuário já tem
    hashPassword.mockResolvedValue('old-hash');
    mockUserRepo.findById.mockResolvedValue(buildUser('ACTIVE'));

    await expect(sut.execute(input)).resolves.toEqual(
      expect.objectContaining({ revokedSessionCount: 0 }),
    );
    expect(mockUserRepo.save).toHaveBeenCalledTimes(1);
  });

  it('senha fraca lança WeakPasswordError antes de qualquer chamada a repositório', async () => {
    await expect(
      sut.execute({ ...input, newPassword: 'weak' }),
    ).rejects.toBeInstanceOf(WeakPasswordError);

    expect(mockPasswordResetTokenRepo.findByTokenHash).not.toHaveBeenCalled();
    expect(mockUserRepo.findById).not.toHaveBeenCalled();
    expect(mockUow.run).not.toHaveBeenCalled();
  });

  it('token inexistente lança InvalidResetTokenError', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(null);

    await expect(sut.execute(input)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('token expirado lança InvalidResetTokenError', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      PasswordResetToken.reconstitute({
        id: 'token-1',
        userId: userId.toString(),
        tokenHash: 'hashed-token',
        requestedIp: IP,
        createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        expiresAt: new Date(NOW.getTime() - 30 * 60 * 1000),
        consumedAt: null,
      }),
    );

    await expect(sut.execute(input)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
    expect(mockUow.run).not.toHaveBeenCalled();
  });

  it('token já consumido lança InvalidResetTokenError', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      PasswordResetToken.reconstitute({
        id: 'token-1',
        userId: userId.toString(),
        tokenHash: 'hashed-token',
        requestedIp: IP,
        createdAt: new Date(NOW.getTime() - 60_000),
        expiresAt: new Date(NOW.getTime() + 20 * 60 * 1000),
        consumedAt: new Date(NOW.getTime() - 1000),
      }),
    );

    await expect(sut.execute(input)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
  });

  it('usuário do token não existe mais lança InvalidResetTokenError', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      redeemableToken(),
    );
    mockUserRepo.findById.mockResolvedValue(null);

    await expect(sut.execute(input)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );
    expect(mockUow.run).not.toHaveBeenCalled();
  });

  it('conta SUSPENDED lança AccountSuspendedError', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      redeemableToken(),
    );
    mockUserRepo.findById.mockResolvedValue(buildUser('SUSPENDED'));

    await expect(sut.execute(input)).rejects.toBeInstanceOf(
      AccountSuspendedError,
    );
    expect(mockUow.run).not.toHaveBeenCalled();
  });

  it('sem sessões ativas retorna revokedSessionCount 0, nenhum evento e ainda grava o LoginAttempt de limpeza', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      redeemableToken(),
    );
    mockUserRepo.findById.mockResolvedValue(buildUser('ACTIVE'));
    mockSessionRepo.findActiveByUserId.mockResolvedValue([]);

    const result = await sut.execute(input);

    expect(result.revokedSessionCount).toBe(0);
    expect(result.events).toEqual([]);
    expect(mockLoginAttemptRepo.record).toHaveBeenCalledTimes(1);
  });

  it('propaga o erro quando sessionRepo.revokeAll lança dentro da transação', async () => {
    mockPasswordResetTokenRepo.findByTokenHash.mockResolvedValue(
      redeemableToken(),
    );
    mockUserRepo.findById.mockResolvedValue(buildUser('ACTIVE'));
    mockSessionRepo.revokeAll.mockRejectedValue(new Error('rollback'));

    await expect(sut.execute(input)).rejects.toThrow('rollback');
  });
});
