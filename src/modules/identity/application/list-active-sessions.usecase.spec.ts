import { ListActiveSessions } from '@/modules/identity/application/list-active-sessions.usecase';
import { Session } from '@/modules/identity/domain/entities/session.entity';

describe('ListActiveSessions', () => {
  const mockSessionRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
    revoke: jest.fn(),
    revokeAll: jest.fn(),
    touch: jest.fn(),
  };

  let sut: ListActiveSessions;

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new ListActiveSessions(mockSessionRepo);
  });

  it('retorna as sessões ativas do usuário informado', async () => {
    const session = Session.create({
      userId: 'user-1',
      tokenHash: 'a'.repeat(64),
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    mockSessionRepo.findActiveByUserId.mockResolvedValue([session]);

    const result = await sut.execute({ userId: 'user-1' });

    expect(result.sessions).toEqual([session]);
    expect(mockSessionRepo.findActiveByUserId).toHaveBeenCalledWith('user-1');
  });

  it('retorna lista vazia quando o usuário não tem sessões ativas', async () => {
    mockSessionRepo.findActiveByUserId.mockResolvedValue([]);

    const result = await sut.execute({ userId: 'user-1' });

    expect(result.sessions).toEqual([]);
  });
});
