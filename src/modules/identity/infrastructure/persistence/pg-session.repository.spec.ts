import { Pool } from 'pg';
import { PgSessionRepository } from '@/modules/identity/infrastructure/persistence/pg-session.repository';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

describe('PgSessionRepository (integração)', () => {
  let pool: Pool;
  let db: QueryExecutor;
  let sut: PgSessionRepository;
  let userId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    db = { query: (sql, params) => pool.query(sql, params) };
    sut = new PgSessionRepository(db);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Test User', $1, 'hash', '127.0.0.1')
       RETURNING id`,
      [`session-repo-${Date.now()}@example.com`],
    );
    userId = userResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  });

  function buildSession(overrides: { tokenHash?: string } = {}): Session {
    return Session.create({
      userId,
      tokenHash: overrides.tokenHash ?? 'a'.repeat(64),
      deviceInfo: 'Integration test device',
      ipAddress: '10.0.0.1',
    });
  }

  it('persiste e recupera uma sessão por id', async () => {
    const session = buildSession();
    await sut.create(session);

    const found = await sut.findById(session.id.toString());

    expect(found).not.toBeNull();
    expect(found?.userId).toBe(userId);
    expect(found?.deviceInfo).toBe('Integration test device');
  });

  it('recupera uma sessão pelo hash do token, nunca pelo token em claro', async () => {
    const session = buildSession({ tokenHash: 'b'.repeat(64) });
    await sut.create(session);

    const found = await sut.findByTokenHash('b'.repeat(64));
    expect(found?.id.toString()).toBe(session.id.toString());

    const notFound = await sut.findByTokenHash('plain-token-value');
    expect(notFound).toBeNull();
  });

  it('retorna null ao buscar hash inexistente', async () => {
    const notFound = await sut.findByTokenHash('c'.repeat(64));
    expect(notFound).toBeNull();
  });

  it('findActiveByUserId retorna apenas sessões ativas', async () => {
    const active = buildSession({ tokenHash: 'd'.repeat(64) });
    const revoked = buildSession({ tokenHash: 'e'.repeat(64) });
    await sut.create(active);
    await sut.create(revoked);
    await sut.revoke(revoked.id.toString());

    const result = await sut.findActiveByUserId(userId);

    expect(result).toHaveLength(1);
    expect(result[0].id.toString()).toBe(active.id.toString());
  });

  it('revoke marca revoked_at e a sessão para de ser ativa', async () => {
    const session = buildSession();
    await sut.create(session);

    await sut.revoke(session.id.toString());

    const found = await sut.findById(session.id.toString());
    expect(found?.revokedAt).not.toBeNull();
    expect(found?.isActive()).toBe(false);
  });

  it('revokeAll revoga todas as sessões ativas do usuário em lote', async () => {
    const first = buildSession({ tokenHash: 'f'.repeat(64) });
    const second = buildSession({ tokenHash: '1'.repeat(64) });
    await sut.create(first);
    await sut.create(second);

    await sut.revokeAll(userId);

    const result = await sut.findActiveByUserId(userId);
    expect(result).toHaveLength(0);
  });

  it('touch atualiza last_activity_at', async () => {
    const session = buildSession();
    await sut.create(session);
    const newLastActivity = new Date(Date.now() + 60_000);

    await sut.touch(session.id.toString(), newLastActivity);

    const found = await sut.findById(session.id.toString());
    expect(found?.lastActivityAt.getTime()).toBe(newLastActivity.getTime());
  });
});
