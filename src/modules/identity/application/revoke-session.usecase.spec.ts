import { RevokeSession } from '@/modules/identity/application/revoke-session.usecase';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import { SessionNotFoundError } from '@/modules/identity/domain/errors/session-not-found.error';
import { SessionAlreadyRevokedError } from '@/modules/identity/domain/errors/session-already-revoked.error';

describe('RevokeSession', () => {
  const mockSessionRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
    revoke: jest.fn(),
    revokeAll: jest.fn(),
    touch: jest.fn(),
  };

  let sut: RevokeSession;

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new RevokeSession(mockSessionRepo);
  });

  it('revoga a sessão do próprio usuário', async () => {
    const session = Session.create({
      userId: 'user-1',
      tokenHash: 'a'.repeat(64),
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    mockSessionRepo.findById.mockResolvedValue(session);

    await sut.execute({
      sessionId: session.id.toString(),
      requestingUserId: 'user-1',
    });

    expect(mockSessionRepo.revoke).toHaveBeenCalledWith(session.id.toString());
  });

  it('retorna um evento SessionRevoked com reason user_requested', async () => {
    const session = Session.create({
      userId: 'user-1',
      tokenHash: 'a'.repeat(64),
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    mockSessionRepo.findById.mockResolvedValue(session);

    const result = await sut.execute({
      sessionId: session.id.toString(),
      requestingUserId: 'user-1',
    });

    expect(result.event.reason).toBe('user_requested');
    expect(result.event.userId).toBe('user-1');
  });

  it('lança SessionNotFoundError quando a sessão não existe', async () => {
    mockSessionRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ sessionId: 'unknown', requestingUserId: 'user-1' }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('lança SessionNotFoundError ao tentar revogar sessão de outro usuário', async () => {
    const session = Session.create({
      userId: 'user-2',
      tokenHash: 'a'.repeat(64),
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    mockSessionRepo.findById.mockResolvedValue(session);

    await expect(
      sut.execute({
        sessionId: session.id.toString(),
        requestingUserId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
  });

  it('lança SessionAlreadyRevokedError ao tentar revogar sessão já revogada', async () => {
    const session = Session.create({
      userId: 'user-1',
      tokenHash: 'a'.repeat(64),
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    session.revoke();
    mockSessionRepo.findById.mockResolvedValue(session);

    await expect(
      sut.execute({
        sessionId: session.id.toString(),
        requestingUserId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(SessionAlreadyRevokedError);
    expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
  });
});
