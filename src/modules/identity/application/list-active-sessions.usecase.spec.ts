import { ListActiveSessions } from '@/modules/identity/application/list-active-sessions.usecase';
import { Session } from '@/modules/identity/domain/entities/session.entity';

describe('ListActiveSessions', () => {
  const mockSessionReadRepo = {
    findById: jest.fn(),
    findByTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
  };

  let sut: ListActiveSessions;

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new ListActiveSessions(mockSessionReadRepo);
  });

  it('retorna as sessões ativas do usuário informado', async () => {
    const session = Session.create({
      userId: 'user-1',
      tokenHash: 'a'.repeat(64),
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
    mockSessionReadRepo.findActiveByUserId.mockResolvedValue([session]);

    const result = await sut.execute({ userId: 'user-1' });

    expect(result.sessions).toEqual([session]);
    expect(mockSessionReadRepo.findActiveByUserId).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('retorna lista vazia quando o usuário não tem sessões ativas', async () => {
    mockSessionReadRepo.findActiveByUserId.mockResolvedValue([]);

    const result = await sut.execute({ userId: 'user-1' });

    expect(result.sessions).toEqual([]);
  });
});
