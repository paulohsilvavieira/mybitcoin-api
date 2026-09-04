import { createHash } from 'node:crypto';
import { VerifyEmail } from '@/modules/identity/application/verify-email.usecase';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserId } from '@/modules/identity/domain/value-objects/user-id.vo';
import {
  UserStatus,
  UserStatusType,
} from '@/modules/identity/domain/value-objects/user-status.vo';
import { EmailVerificationTokenInvalidError } from '@/modules/identity/domain/errors/email-verification-token-invalid.error';
import { EmailVerificationTokenExpiredError } from '@/modules/identity/domain/errors/email-verification-token-expired.error';

describe('VerifyEmail', () => {
  const mockUserRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    findByEmailVerificationTokenHash: jest.fn(),
    issueEmailVerificationTokenIfDue: jest.fn(),
  };

  let sut: VerifyEmail;

  const TOKEN = 'a'.repeat(64);
  const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new VerifyEmail(mockUserRepo);
  });

  function buildUser(params: {
    status: UserStatusType;
    emailVerificationExpiresAt: Date | null;
  }): User {
    return User.reconstitute({
      id: UserId.create(),
      name: 'Ada Lovelace',
      email: Email.create('ada.lovelace@example.com'),
      passwordHash: 'hashed-password',
      status: UserStatus.from(params.status),
      emailVerified: params.status === 'ACTIVE',
      termsAccepted: true,
      registrationIp: '127.0.0.1',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerificationTokenHash: TOKEN_HASH,
      emailVerificationExpiresAt: params.emailVerificationExpiresAt,
      emailVerificationLastSentAt: new Date(),
    });
  }

  it('verifica com sucesso um token válido de conta PENDING_EMAIL_VERIFICATION', async () => {
    const user = buildUser({
      status: 'PENDING_EMAIL_VERIFICATION',
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockUserRepo.findByEmailVerificationTokenHash.mockResolvedValue(user);

    const output = await sut.execute({ token: TOKEN });

    expect(output).toEqual({
      userId: user.id.toString(),
      email: 'ada.lovelace@example.com',
      status: 'ACTIVE',
    });
    expect(mockUserRepo.save).toHaveBeenCalledTimes(1);
    expect(mockUserRepo.findByEmailVerificationTokenHash).toHaveBeenCalledWith(
      TOKEN_HASH,
    );
  });

  it('lança EmailVerificationTokenInvalidError quando o token não é encontrado', async () => {
    mockUserRepo.findByEmailVerificationTokenHash.mockResolvedValue(null);

    await expect(sut.execute({ token: TOKEN })).rejects.toBeInstanceOf(
      EmailVerificationTokenInvalidError,
    );
    expect(mockUserRepo.save).not.toHaveBeenCalled();
  });

  it('retorna sucesso idempotente para conta já ACTIVE, mesmo com token expirado', async () => {
    const user = buildUser({
      status: 'ACTIVE',
      // Token "expirado" — prova que a expiração não é checada para ACTIVE.
      emailVerificationExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    mockUserRepo.findByEmailVerificationTokenHash.mockResolvedValue(user);

    const output = await sut.execute({ token: TOKEN });

    expect(output).toEqual({
      userId: user.id.toString(),
      email: 'ada.lovelace@example.com',
      status: 'ACTIVE',
    });
    expect(mockUserRepo.save).not.toHaveBeenCalled();
  });

  it('lança EmailVerificationTokenInvalidError (não AccountSuspendedError) para conta SUSPENDED', async () => {
    const user = buildUser({
      status: 'SUSPENDED',
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockUserRepo.findByEmailVerificationTokenHash.mockResolvedValue(user);

    await expect(sut.execute({ token: TOKEN })).rejects.toBeInstanceOf(
      EmailVerificationTokenInvalidError,
    );
    expect(mockUserRepo.save).not.toHaveBeenCalled();
  });

  it('lança EmailVerificationTokenExpiredError para token expirado de conta PENDING_EMAIL_VERIFICATION', async () => {
    const user = buildUser({
      status: 'PENDING_EMAIL_VERIFICATION',
      emailVerificationExpiresAt: new Date(Date.now() - 1000),
    });
    mockUserRepo.findByEmailVerificationTokenHash.mockResolvedValue(user);

    await expect(sut.execute({ token: TOKEN })).rejects.toBeInstanceOf(
      EmailVerificationTokenExpiredError,
    );
    expect(mockUserRepo.save).not.toHaveBeenCalled();
  });
});
