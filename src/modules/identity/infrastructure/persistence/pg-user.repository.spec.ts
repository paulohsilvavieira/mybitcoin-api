import { PgUserRepository } from '@/modules/identity/infrastructure/persistence/pg-user.repository';
import { UserRow } from '@/modules/identity/infrastructure/persistence/user.mapper';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';

describe('PgUserRepository', () => {
  let db: { query: jest.Mock };
  let sut: PgUserRepository;

  beforeEach(() => {
    db = { query: jest.fn() };
    sut = new PgUserRepository(db);
  });

  function buildRow(overrides: Partial<UserRow> = {}): UserRow {
    return {
      id: 'a3b1f6b0-2e1a-4b8f-9c7e-1234567890ab',
      name: 'Test User',
      email: 'test@example.com',
      password_hash: 'hash',
      status: 'PENDING_EMAIL_VERIFICATION',
      email_verified: false,
      terms_accepted: true,
      registration_ip: '127.0.0.1',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      email_verification_token_hash: null,
      email_verification_expires_at: null,
      email_verification_last_sent_at: null,
      ...overrides,
    };
  }

  describe('findByEmailVerificationTokenHash', () => {
    it('retorna null quando nenhuma linha é encontrada', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await sut.findByEmailVerificationTokenHash('a'.repeat(64));

      expect(result).toBeNull();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('email_verification_token_hash = $1'),
        ['a'.repeat(64)],
      );
    });

    it('retorna o User reconstituído quando a linha é encontrada', async () => {
      const row = buildRow({
        email_verification_token_hash: 'b'.repeat(64),
        email_verification_expires_at: new Date('2026-01-01T01:00:00.000Z'),
        email_verification_last_sent_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      db.query.mockResolvedValue({ rows: [row] });

      const result = await sut.findByEmailVerificationTokenHash('b'.repeat(64));

      expect(result).not.toBeNull();
      expect(result?.email.toString()).toBe('test@example.com');
      expect(result?.emailVerificationTokenHash).toBe('b'.repeat(64));
    });
  });

  describe('issueEmailVerificationTokenIfDue', () => {
    it('monta a query com o cooldownThreshold calculado a partir de now e cooldownMs', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const now = new Date('2026-01-01T00:02:00.000Z');
      const expiresAt = new Date('2026-01-01T01:02:00.000Z');

      await sut.issueEmailVerificationTokenIfDue({
        email: Email.create('test@example.com'),
        tokenHash: 'c'.repeat(64),
        expiresAt,
        now,
        cooldownMs: 60_000,
      });

      const [query, values] = db.query.mock.calls[0];
      expect(query).toContain('UPDATE users');
      expect(query).toContain("status = 'PENDING_EMAIL_VERIFICATION'");
      expect(values).toEqual([
        'c'.repeat(64),
        expiresAt,
        now,
        'test@example.com',
        new Date(now.getTime() - 60_000),
      ]);
    });

    it('retorna null quando nenhuma linha é atualizada (0 rows)', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await sut.issueEmailVerificationTokenIfDue({
        email: Email.create('test@example.com'),
        tokenHash: 'd'.repeat(64),
        expiresAt: new Date('2026-01-01T01:00:00.000Z'),
        now: new Date('2026-01-01T00:00:00.000Z'),
        cooldownMs: 60_000,
      });

      expect(result).toBeNull();
    });

    it('retorna o User atualizado quando a linha é retornada', async () => {
      const row = buildRow({
        email_verification_token_hash: 'e'.repeat(64),
        email_verification_expires_at: new Date('2026-01-01T01:00:00.000Z'),
        email_verification_last_sent_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      db.query.mockResolvedValue({ rows: [row] });

      const result = await sut.issueEmailVerificationTokenIfDue({
        email: Email.create('test@example.com'),
        tokenHash: 'e'.repeat(64),
        expiresAt: new Date('2026-01-01T01:00:00.000Z'),
        now: new Date('2026-01-01T00:00:00.000Z'),
        cooldownMs: 60_000,
      });

      expect(result).not.toBeNull();
      expect(result?.emailVerificationTokenHash).toBe('e'.repeat(64));
    });
  });
});
