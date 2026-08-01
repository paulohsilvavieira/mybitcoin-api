import { CreateSession } from '@/modules/identity/application/create-session.usecase';

describe('CreateSession', () => {
  const mockSessionRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
    revoke: jest.fn(),
    revokeAll: jest.fn(),
    touch: jest.fn(),
  };

  let sut: CreateSession;

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new CreateSession(mockSessionRepo);
  });

  const validInput = {
    userId: 'user-1',
    deviceInfo: 'Chrome on Linux',
    ipAddress: '127.0.0.1',
  };

  it('persiste a sessão criada', async () => {
    await sut.execute(validInput);
    expect(mockSessionRepo.create).toHaveBeenCalledTimes(1);
  });

  it('gera um token diferente a cada chamada (SES-001)', async () => {
    const first = await sut.execute(validInput);
    const second = await sut.execute(validInput);
    expect(first.token).not.toBe(second.token);
    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it('persiste deviceInfo e ipAddress (SES-004)', async () => {
    await sut.execute(validInput);
    const savedSession = mockSessionRepo.create.mock.calls[0][0];
    expect(savedSession.deviceInfo).toBe('Chrome on Linux');
    expect(savedSession.ipAddress).toBe('127.0.0.1');
  });

  it('nunca persiste o token em claro — apenas o hash', async () => {
    const result = await sut.execute(validInput);
    const savedSession = mockSessionRepo.create.mock.calls[0][0];
    expect(savedSession.tokenHash).not.toBe(result.token);
    expect(savedSession.tokenHash).toHaveLength(64);
  });

  it('retorna um evento SessionCreated com os dados da sessão', async () => {
    const result = await sut.execute(validInput);
    expect(result.event.userId).toBe('user-1');
    expect(result.event.deviceInfo).toBe('Chrome on Linux');
    expect(result.event.ipAddress).toBe('127.0.0.1');
    expect(result.event.sessionId).toBe(result.sessionId);
  });
});
