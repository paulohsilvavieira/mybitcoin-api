import { RequestPasswordReset } from '@/modules/identity/application/request-password-reset.usecase';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserId } from '@/modules/identity/domain/value-objects/user-id.vo';
import {
  UserStatus,
  UserStatusType,
} from '@/modules/identity/domain/value-objects/user-status.vo';
import { InvalidEmailError } from '@/modules/identity/domain/errors/invalid-email.error';
import { ActiveResetTokenExistsError } from '@/modules/identity/domain/errors/active-reset-token-exists.error';
import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';

describe('RequestPasswordReset', () => {
  const mockUserRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
  };
  const mockRequestRepo = {
    record: jest.fn(),
    countSince: jest.fn(),
  };
  const mockPasswordResetTokenRepo = {
    save: jest.fn(),
    consume: jest.fn(),
    findByTokenHash: jest.fn(),
    consumeAllActiveForUser: jest.fn(),
  };
  const mockUow = {
    run: jest.fn(),
  };
  const mockEmailService = {
    sendVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  };
  const generateToken = jest.fn();
  const hashToken = jest.fn();
  const clock = jest.fn();

  const IP = '203.0.113.10';
  const NOW = new Date('2026-08-29T12:00:00.000Z');

  let sut: RequestPasswordReset;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestRepo.record.mockResolvedValue(undefined);
    mockRequestRepo.countSince.mockResolvedValue(0);
    mockPasswordResetTokenRepo.consumeAllActiveForUser.mockResolvedValue(
      undefined,
    );
    mockPasswordResetTokenRepo.save.mockResolvedValue(undefined);
    mockEmailService.sendPasswordReset.mockResolvedValue(undefined);
    generateToken.mockReturnValue('plain-token');
    hashToken.mockReturnValue('hashed-token');
    clock.mockReturnValue(NOW);
    mockUow.run.mockImplementation(
      async (cb: (repos: unknown) => Promise<unknown>) =>
        cb({ passwordResetTokenRepo: mockPasswordResetTokenRepo }),
    );

    sut = new RequestPasswordReset(
      mockUserRepo,
      mockRequestRepo,
      mockUow as never,
      mockEmailService,
      generateToken,
      hashToken,
      clock,
    );
  });

  function buildUser(status: UserStatusType = 'ACTIVE'): User {
    return User.reconstitute({
      id: UserId.create(),
      name: 'Ada Lovelace',
      email: Email.create('ada@example.com'),
      passwordHash: 'hashed-password',
      status: UserStatus.from(status),
      emailVerified: status === 'ACTIVE',
      termsAccepted: true,
      registrationIp: '127.0.0.1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const input = { email: 'ada@example.com', ipAddress: IP };

  it('para e-mail existente ACTIVE registra a solicitação, rotaciona o token e envia o e-mail', async () => {
    const user = buildUser('ACTIVE');
    mockUserRepo.findByEmail.mockResolvedValue(user);

    await expect(sut.execute(input)).resolves.toBeUndefined();

    expect(mockRequestRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', userFound: true }),
    );
    // atomicidade: a rotação de token roda dentro de uow.run
    expect(mockUow.run).toHaveBeenCalledTimes(1);
    expect(
      mockPasswordResetTokenRepo.consumeAllActiveForUser,
    ).toHaveBeenCalledWith(user.id.toString());
    expect(mockPasswordResetTokenRepo.save).toHaveBeenCalledWith(
      expect.any(PasswordResetToken),
    );
    expect(mockPasswordResetTokenRepo.save).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendPasswordReset).toHaveBeenCalledWith({
      to: 'ada@example.com',
      name: 'Ada Lovelace',
      token: 'plain-token',
    });
  });

  it('persiste apenas o hash do token, nunca o token em claro', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser('ACTIVE'));

    await sut.execute(input);

    const savedToken = mockPasswordResetTokenRepo.save.mock
      .calls[0][0] as PasswordResetToken;
    expect(savedToken.tokenHash).toBe('hashed-token');
  });

  it('para e-mail inexistente registra a solicitação com userFound=false e não emite token nem e-mail', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(sut.execute(input)).resolves.toBeUndefined();

    expect(mockRequestRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', userFound: false }),
    );
    expect(mockUow.run).not.toHaveBeenCalled();
    expect(mockPasswordResetTokenRepo.save).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('para conta SUSPENDED não emite token nem e-mail e retorna void', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser('SUSPENDED'));

    await expect(sut.execute(input)).resolves.toBeUndefined();

    expect(mockUow.run).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('para conta PENDING_EMAIL_VERIFICATION segue o fluxo normal', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(
      buildUser('PENDING_EMAIL_VERIFICATION'),
    );

    await sut.execute(input);

    expect(mockPasswordResetTokenRepo.save).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('quando o rate-limit por e-mail é excedido (> 3 em 15 min) não emite token nem e-mail', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser('ACTIVE'));
    mockRequestRepo.countSince.mockResolvedValue(4);

    await expect(sut.execute(input)).resolves.toBeUndefined();

    // LOG-005: a solicitação throttled ainda entra na trilha de auditoria,
    // com o IP, ANTES da contagem.
    expect(mockRequestRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', ipAddress: IP }),
    );
    expect(mockRequestRepo.countSince).toHaveBeenCalledWith(
      'ada@example.com',
      new Date(NOW.getTime() - 15 * 60 * 1000),
    );
    expect(mockUow.run).not.toHaveBeenCalled();
    expect(mockEmailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('não faz throttle no limite exato de 3 solicitações', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser('ACTIVE'));
    mockRequestRepo.countSince.mockResolvedValue(3);

    await sut.execute(input);

    expect(mockEmailService.sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('lança InvalidEmailError quando o formato do e-mail é inválido', async () => {
    await expect(
      sut.execute({ email: 'not-an-email', ipAddress: IP }),
    ).rejects.toBeInstanceOf(InvalidEmailError);

    expect(mockRequestRepo.record).not.toHaveBeenCalled();
  });

  it('não propaga falha do envio de e-mail (fire-and-forget) e mantém o token salvo', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser('ACTIVE'));
    mockEmailService.sendPasswordReset.mockRejectedValue(
      new Error('smtp down'),
    );

    await expect(sut.execute(input)).resolves.toBeUndefined();

    expect(mockPasswordResetTokenRepo.save).toHaveBeenCalledTimes(1);
  });

  it('quando o save do token lança ActiveResetTokenExistsError (corrida) responde neutro sem enviar e-mail', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser('ACTIVE'));
    mockPasswordResetTokenRepo.save.mockRejectedValue(
      new ActiveResetTokenExistsError(),
    );

    await expect(sut.execute(input)).resolves.toBeUndefined();

    expect(mockEmailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('propaga erros inesperados vindos da transação', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(buildUser('ACTIVE'));
    mockPasswordResetTokenRepo.save.mockRejectedValue(new Error('db exploded'));

    await expect(sut.execute(input)).rejects.toThrow('db exploded');
  });
});
