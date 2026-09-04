import { ResendVerificationEmail } from '@/modules/identity/application/resend-verification-email.usecase';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserId } from '@/modules/identity/domain/value-objects/user-id.vo';
import { UserStatus } from '@/modules/identity/domain/value-objects/user-status.vo';
import { InvalidEmailError } from '@/modules/identity/domain/errors/invalid-email.error';
import { RESEND_COOLDOWN_MS } from '@/modules/identity/domain/services/email-verification-policy';

describe('ResendVerificationEmail', () => {
  const mockUserRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    findByEmailVerificationTokenHash: jest.fn(),
    issueEmailVerificationTokenIfDue: jest.fn(),
  };

  const mockEmailService = {
    sendVerification: jest.fn().mockResolvedValue(undefined),
  };

  let sut: ResendVerificationEmail;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmailService.sendVerification.mockResolvedValue(undefined);
    sut = new ResendVerificationEmail(mockUserRepo, mockEmailService);
  });

  function buildUser(): User {
    return User.reconstitute({
      id: UserId.create(),
      name: 'Ada Lovelace',
      email: Email.create('ada.lovelace@example.com'),
      passwordHash: 'hashed-password',
      status: UserStatus.pendingEmailVerification(),
      emailVerified: false,
      termsAccepted: true,
      registrationIp: '127.0.0.1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  it('não envia e-mail quando issueEmailVerificationTokenIfDue retorna null (inexistente/ativo/suspenso/cooldown)', async () => {
    mockUserRepo.issueEmailVerificationTokenIfDue.mockResolvedValue(null);

    await sut.execute({ email: 'ghost@example.com' });

    expect(mockEmailService.sendVerification).not.toHaveBeenCalled();
  });

  it('envia o e-mail com o token em claro quando issueEmailVerificationTokenIfDue retorna um User', async () => {
    const user = buildUser();
    mockUserRepo.issueEmailVerificationTokenIfDue.mockResolvedValue(user);

    await sut.execute({ email: 'ada.lovelace@example.com' });

    expect(mockEmailService.sendVerification).toHaveBeenCalledTimes(1);
    const callArgs = mockEmailService.sendVerification.mock.calls[0][0];
    expect(callArgs.to).toBe('ada.lovelace@example.com');
    expect(callArgs.name).toBe('Ada Lovelace');
    expect(typeof callArgs.token).toBe('string');
    expect(callArgs.token.length).toBeGreaterThan(0);
  });

  it('chama issueEmailVerificationTokenIfDue com email, tokenHash, expiresAt, now e cooldownMs corretos', async () => {
    mockUserRepo.issueEmailVerificationTokenIfDue.mockResolvedValue(null);

    await sut.execute({ email: 'ada.lovelace@example.com' });

    expect(mockUserRepo.issueEmailVerificationTokenIfDue).toHaveBeenCalledTimes(
      1,
    );
    const params =
      mockUserRepo.issueEmailVerificationTokenIfDue.mock.calls[0][0];
    expect(params.email.toString()).toBe('ada.lovelace@example.com');
    expect(typeof params.tokenHash).toBe('string');
    expect(params.tokenHash).toHaveLength(64);
    expect(params.expiresAt).toBeInstanceOf(Date);
    expect(params.now).toBeInstanceOf(Date);
    expect(params.cooldownMs).toBe(RESEND_COOLDOWN_MS);
  });

  it('lança InvalidEmailError para formato de e-mail inválido antes de chamar o repositório', async () => {
    await expect(sut.execute({ email: 'not-an-email' })).rejects.toBeInstanceOf(
      InvalidEmailError,
    );
    expect(
      mockUserRepo.issueEmailVerificationTokenIfDue,
    ).not.toHaveBeenCalled();
    expect(mockEmailService.sendVerification).not.toHaveBeenCalled();
  });

  it('sempre resolve (void) mesmo quando o e-mail é enviado', async () => {
    mockUserRepo.issueEmailVerificationTokenIfDue.mockResolvedValue(
      buildUser(),
    );

    await expect(
      sut.execute({ email: 'ada.lovelace@example.com' }),
    ).resolves.toBeUndefined();
  });
});
