import { Pool } from 'pg';
import { PgLoginAttemptRepository } from '@/modules/identity/infrastructure/persistence/pg-login-attempt.repository';
import { LoginAttempt } from '@/modules/identity/domain/entities/login-attempt.entity';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

describe('PgLoginAttemptRepository (integração)', () => {
  let pool: Pool;
  let db: QueryExecutor;
  let sut: PgLoginAttemptRepository;
  let userId: string;
  let email: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    db = { query: (sql, params) => pool.query(sql, params) };
    sut = new PgLoginAttemptRepository(db);

    email = `login-attempt-repo-${Date.now()}@example.com`;
    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Test User', $1, 'hash', '127.0.0.1')
       RETURNING id`,
      [email],
    );
    userId = userResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM login_attempts WHERE email = $1', [email]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM login_attempts WHERE email = $1', [email]);
  });

  describe('record', () => {
    it('persiste uma tentativa com userId quando informado', async () => {
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: false,
          userId,
        }),
      );

      const { rows } = await pool.query<{
        user_id: string;
        successful: boolean;
        ip_address: string;
      }>(
        'SELECT user_id, successful, ip_address FROM login_attempts WHERE email = $1',
        [email],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(userId);
      expect(rows[0].successful).toBe(false);
      expect(rows[0].ip_address).toBe('10.0.0.1');
    });

    it('persiste user_id NULL quando o email não corresponde a nenhum usuário', async () => {
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: false,
        }),
      );

      const { rows } = await pool.query<{ user_id: string | null }>(
        'SELECT user_id FROM login_attempts WHERE email = $1',
        [email],
      );

      expect(rows[0].user_id).toBeNull();
    });
  });

  describe('countFailedSinceLastSuccess', () => {
    it('retorna count 0 e mostRecentFailureAt null quando não há nenhuma tentativa', async () => {
      const summary = await sut.countFailedSinceLastSuccess(email);

      expect(summary).toEqual({ count: 0, mostRecentFailureAt: null });
    });

    it('conta as falhas registradas para o email', async () => {
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: false,
        }),
      );
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: false,
        }),
      );

      const summary = await sut.countFailedSinceLastSuccess(email);

      expect(summary.count).toBe(2);
      expect(summary.mostRecentFailureAt).not.toBeNull();
    });

    it('não conta falhas anteriores a um login bem-sucedido', async () => {
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: false,
        }),
      );
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: false,
        }),
      );
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: true,
          userId,
        }),
      );
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: false,
        }),
      );

      const summary = await sut.countFailedSinceLastSuccess(email);

      expect(summary.count).toBe(1);
    });

    it('mostRecentFailureAt é o timestamp da falha mais recente', async () => {
      await sut.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: false,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondFailure = LoginAttempt.create({
        email,
        ipAddress: '10.0.0.1',
        successful: false,
      });
      await sut.record(secondFailure);

      const summary = await sut.countFailedSinceLastSuccess(email);

      expect(summary.mostRecentFailureAt?.getTime()).toBeCloseTo(
        secondFailure.createdAt.getTime(),
        -2,
      );
    });

    it('isola tentativas por email — não mistura contadores de emails diferentes', async () => {
      const otherEmail = `other-${email}`;
      await sut.record(
        LoginAttempt.create({
          email: otherEmail,
          ipAddress: '10.0.0.1',
          successful: false,
        }),
      );

      const summary = await sut.countFailedSinceLastSuccess(email);

      expect(summary.count).toBe(0);
      await pool.query('DELETE FROM login_attempts WHERE email = $1', [
        otherEmail,
      ]);
    });
  });
});
