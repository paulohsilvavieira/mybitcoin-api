import { Pool } from 'pg';
import { PgPasswordResetTokenRepository } from '@/modules/identity/infrastructure/persistence/pg-password-reset-token.repository';
import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';
import { ActiveResetTokenExistsError } from '@/modules/identity/domain/errors/active-reset-token-exists.error';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

describe('PgPasswordResetTokenRepository (integração)', () => {
  let pool: Pool;
  let db: QueryExecutor;
  let sut: PgPasswordResetTokenRepository;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    db = { query: (sql, params) => pool.query(sql, params) };
    sut = new PgPasswordResetTokenRepository(db);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Test User', $1, 'hash', '127.0.0.1')
       RETURNING id`,
      [`prt-repo-${Date.now()}@example.com`],
    );
    userId = userResult.rows[0].id;

    const otherResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Other User', $1, 'hash', '127.0.0.1')
       RETURNING id`,
      [`prt-repo-other-${Date.now()}@example.com`],
    );
    otherUserId = otherResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = ANY($1)',
      [[userId, otherUserId]],
    );
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [
      [userId, otherUserId],
    ]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = ANY($1)',
      [[userId, otherUserId]],
    );
  });

  function buildToken(tokenHash: string): PasswordResetToken {
    return PasswordResetToken.issue({
      userId,
      tokenHash,
      requestedIp: '10.0.0.1',
    });
  }

  it('persiste e recupera um token pelo hash (round-trip)', async () => {
    const token = buildToken('a'.repeat(64));
    await sut.save(token);

    const found = await sut.findByTokenHash('a'.repeat(64));

    expect(found).not.toBeNull();
    expect(found?.id).toBe(token.id);
    expect(found?.userId).toBe(userId);
    expect(found?.consumedAt).toBeNull();
    expect(found?.isRedeemable()).toBe(true);
  });

  it('retorna null para hash inexistente', async () => {
    expect(await sut.findByTokenHash('b'.repeat(64))).toBeNull();
  });

  it('save lança ActiveResetTokenExistsError quando já há token ativo do mesmo usuário', async () => {
    await sut.save(buildToken('c'.repeat(64)));

    await expect(sut.save(buildToken('d'.repeat(64)))).rejects.toBeInstanceOf(
      ActiveResetTokenExistsError,
    );
  });

  it('consume seta consumed_at do token informado', async () => {
    const token = buildToken('e'.repeat(64));
    await sut.save(token);

    token.consume();
    await sut.consume(token);

    const found = await sut.findByTokenHash('e'.repeat(64));
    expect(found?.consumedAt).not.toBeNull();
    expect(found?.isRedeemable()).toBe(false);
  });

  it('após consumir, save de um novo token do mesmo usuário volta a funcionar', async () => {
    const first = buildToken('f'.repeat(64));
    await sut.save(first);
    first.consume();
    await sut.consume(first);

    await expect(sut.save(buildToken('1'.repeat(64)))).resolves.toBeUndefined();
  });

  it('consumeAllActiveForUser consome o token ativo e preserva o consumed_at de um já consumido', async () => {
    // token já consumido no passado
    const old = buildToken('3'.repeat(64));
    await sut.save(old);
    old.consume(new Date('2026-01-01T00:00:00Z'));
    await sut.consume(old);
    // token ativo
    const active = buildToken('2'.repeat(64));
    await sut.save(active);

    await sut.consumeAllActiveForUser(userId);

    const consumed = await sut.findByTokenHash('2'.repeat(64));
    expect(consumed?.consumedAt).not.toBeNull();

    const untouched = await sut.findByTokenHash('3'.repeat(64));
    expect(untouched?.consumedAt?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('token_hash é UNIQUE mesmo entre usuários distintos', async () => {
    await sut.save(buildToken('4'.repeat(64)));

    const collision = PasswordResetToken.issue({
      userId: otherUserId,
      tokenHash: '4'.repeat(64),
      requestedIp: '10.0.0.2',
    });
    await expect(sut.save(collision)).rejects.toThrow();
  });
});
