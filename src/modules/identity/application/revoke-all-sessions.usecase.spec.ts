import { RevokeAllSessions } from '@/modules/identity/application/revoke-all-sessions.usecase';
import { Session } from '@/modules/identity/domain/entities/session.entity';

describe('RevokeAllSessions', () => {
  const mockSessionRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
    revoke: jest.fn(),
    revokeAll: jest.fn(),
    touch: jest.fn(),
  };

  let sut: RevokeAllSessions;

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new RevokeAllSessions(mockSessionRepo);
  });

  it('revoga todas as sessões ativas do usuário em lote', async () => {
    const sessions = [
      Session.create({
        userId: 'user-1',
        tokenHash: 'a'.repeat(64),
        deviceInfo: 'Chrome',
        ipAddress: '127.0.0.1',
      }),
      Session.create({
        userId: 'user-1',
        tokenHash: 'b'.repeat(64),
        deviceInfo: 'Firefox',
        ipAddress: '127.0.0.2',
      }),
    ];
    mockSessionRepo.findActiveByUserId.mockResolvedValue(sessions);

    await sut.execute({ userId: 'user-1', reason: 'logout_all' });

    expect(mockSessionRepo.revokeAll).toHaveBeenCalledWith('user-1');
  });

  it('retorna um evento SessionRevoked por sessão afetada', async () => {
    const sessions = [
      Session.create({
        userId: 'user-1',
        tokenHash: 'a'.repeat(64),
        deviceInfo: 'Chrome',
        ipAddress: '127.0.0.1',
      }),
      Session.create({
        userId: 'user-1',
        tokenHash: 'b'.repeat(64),
        deviceInfo: 'Firefox',
        ipAddress: '127.0.0.2',
      }),
    ];
    mockSessionRepo.findActiveByUserId.mockResolvedValue(sessions);

    const result = await sut.execute({
      userId: 'user-1',
      reason: 'password_reset',
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[0].reason).toBe('password_reset');
  });
});
