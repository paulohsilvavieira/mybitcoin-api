import { PgSessionReadRepository } from '@/modules/identity/infrastructure/persistence/pg-session-read.repository';
import { SessionReadRepository } from '@/modules/identity/domain/repositories';

const mockDb = {
  query: jest.fn(),
};

function sessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date();
  return {
    id: 'session-1',
    user_id: 'user-1',
    token_hash: 'a'.repeat(64),
    device_info: 'Chrome on Linux',
    ip_address: '127.0.0.1',
    created_at: now,
    last_activity_at: now,
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    revoked_at: null,
    ...overrides,
  };
}

describe('PgSessionReadRepository', () => {
  let repository: PgSessionReadRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PgSessionReadRepository(mockDb);
  });

  describe('findById', () => {
    it('delegates to the injected ReadQueryExecutor', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sessionRow()] });

      const session = await repository.findById('session-1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(session?.id.toString()).toBe('session-1');
    });

    it('returns null when the session does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const session = await repository.findById('missing');

      expect(session).toBeNull();
    });
  });

  describe('findByTokenHash', () => {
    it('delegates to the injected ReadQueryExecutor', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sessionRow()] });

      const session = await repository.findByTokenHash('a'.repeat(64));

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(session?.userId).toBe('user-1');
    });

    it('returns null when the hash does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const session = await repository.findByTokenHash('missing');

      expect(session).toBeNull();
    });
  });

  describe('findActiveByUserId', () => {
    it('delegates to the injected ReadQueryExecutor and filters inactive sessions', async () => {
      const idleExpired = sessionRow({
        id: 'session-2',
        last_activity_at: new Date(Date.now() - 40 * 60 * 1000),
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [sessionRow(), idleExpired],
      });

      const sessions = await repository.findActiveByUserId('user-1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id.toString()).toBe('session-1');
    });
  });

  it('never declares a mutation method (save/delete/update/revoke/touch)', () => {
    const readOnlyMethods = Object.getOwnPropertyNames(
      SessionReadRepository.prototype,
    );

    expect(readOnlyMethods).not.toEqual(
      expect.arrayContaining(['save', 'delete', 'update', 'revoke', 'touch']),
    );
  });
});
