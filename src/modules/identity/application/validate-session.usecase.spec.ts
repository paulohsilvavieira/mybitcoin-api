import { createHash } from 'node:crypto';
import { ValidateSession } from '@/modules/identity/application/validate-session.usecase';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import { SessionNotFoundError } from '@/modules/identity/domain/errors/session-not-found.error';
import { SessionExpiredError } from '@/modules/identity/domain/errors/session-expired.error';

describe('ValidateSession', () => {
  const mockSessionRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
    revoke: jest.fn(),
    revokeAll: jest.fn(),
    touch: jest.fn(),
  };

  let sut: ValidateSession;

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new ValidateSession(mockSessionRepo);
  });

  const token = 'plain-token';
  const tokenHash = createHash('sha256').update(token).digest('hex');

  it('retorna a sessão quando o hash do token bate com um registro ativo', async () => {
    const session = Session.create({
      userId: 'user-1',
      tokenHash,
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    mockSessionRepo.findByTokenHash.mockResolvedValue(session);

    const result = await sut.execute({ token });

    expect(result.session).toBe(session);
    expect(mockSessionRepo.findByTokenHash).toHaveBeenCalledWith(tokenHash);
  });

  it('lança SessionNotFoundError quando o hash não é encontrado', async () => {
    mockSessionRepo.findByTokenHash.mockResolvedValue(null);

    await expect(sut.execute({ token })).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  it('lança SessionExpiredError quando a sessão está expirada', async () => {
    const session = Session.create({
      userId: 'user-1',
      tokenHash,
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    session.revoke();
    mockSessionRepo.findByTokenHash.mockResolvedValue(session);

    await expect(sut.execute({ token })).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it('atualiza lastActivityAt (touch) quando a sessão é válida', async () => {
    const session = Session.create({
      userId: 'user-1',
      tokenHash,
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    mockSessionRepo.findByTokenHash.mockResolvedValue(session);

    await sut.execute({ token });

    expect(mockSessionRepo.touch).toHaveBeenCalledWith(
      session.id.toString(),
      session.lastActivityAt,
    );
  });
});
