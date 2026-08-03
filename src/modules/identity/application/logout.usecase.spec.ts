import { createHash } from 'node:crypto';
import { Logout } from '@/modules/identity/application/logout.usecase';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import { SessionId } from '@/modules/identity/domain/value-objects/session-id.vo';

describe('Logout', () => {
  const mockSessionRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByTokenHash: jest.fn(),
    findActiveByUserId: jest.fn(),
    revoke: jest.fn(),
    revokeAll: jest.fn(),
    touch: jest.fn(),
  };

  const TOKEN = 'a'.repeat(64);
  const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

  let sut: Logout;

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new Logout(mockSessionRepo);
  });

  function buildActiveSession(): Session {
    return Session.create({
      userId: 'user-1',
      tokenHash: TOKEN_HASH,
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
    });
  }

  function buildRevokedSession(): Session {
    const now = new Date();
    return Session.reconstitute({
      id: SessionId.create(),
      userId: 'user-1',
      tokenHash: TOKEN_HASH,
      deviceInfo: 'Chrome',
      ipAddress: '127.0.0.1',
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
      revokedAt: now,
    });
  }

  it('revoga a sessão ativa correspondente ao token', async () => {
    const session = buildActiveSession();
    mockSessionRepo.findByTokenHash.mockResolvedValue(session);

    const output = await sut.execute({ token: TOKEN });

    expect(mockSessionRepo.revoke).toHaveBeenCalledWith(session.id.toString());
    expect(output.event).not.toBeNull();
    expect(output.event?.sessionId).toBe(session.id.toString());
    expect(output.event?.userId).toBe('user-1');
    expect(output.event?.reason).toBe('user_requested');
  });

  it('procura a sessão pelo hash sha256 do token, nunca pelo token em claro', async () => {
    mockSessionRepo.findByTokenHash.mockResolvedValue(null);

    await sut.execute({ token: TOKEN });

    expect(mockSessionRepo.findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
  });

  it('OUT-003: não lança e não revoga quando a sessão já está revogada', async () => {
    mockSessionRepo.findByTokenHash.mockResolvedValue(buildRevokedSession());

    const output = await sut.execute({ token: TOKEN });

    expect(output.event).toBeNull();
    expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
  });

  it('OUT-001: não lança quando o token não corresponde a nenhuma sessão', async () => {
    mockSessionRepo.findByTokenHash.mockResolvedValue(null);

    const output = await sut.execute({ token: TOKEN });

    expect(output.event).toBeNull();
    expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
  });

  it('OUT-001: não lança e não consulta o banco quando o token está ausente', async () => {
    const output = await sut.execute({ token: undefined });

    expect(output.event).toBeNull();
    expect(mockSessionRepo.findByTokenHash).not.toHaveBeenCalled();
    expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
  });

  it('trata token vazio como ausente', async () => {
    const output = await sut.execute({ token: '' });

    expect(output.event).toBeNull();
    expect(mockSessionRepo.findByTokenHash).not.toHaveBeenCalled();
  });

  it('é idempotente: chamadas repetidas com o mesmo token não lançam', async () => {
    mockSessionRepo.findByTokenHash
      .mockResolvedValueOnce(buildActiveSession())
      .mockResolvedValueOnce(buildRevokedSession());

    const first = await sut.execute({ token: TOKEN });
    const second = await sut.execute({ token: TOKEN });

    expect(first.event).not.toBeNull();
    expect(second.event).toBeNull();
    expect(mockSessionRepo.revoke).toHaveBeenCalledTimes(1);
  });
});
