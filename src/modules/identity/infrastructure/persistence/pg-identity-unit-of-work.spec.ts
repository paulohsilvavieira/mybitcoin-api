import { Pool } from 'pg';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { PgIdentityUnitOfWork } from '@/modules/identity/infrastructure/persistence/pg-identity-unit-of-work';
import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import { LoginAttempt } from '@/modules/identity/domain/entities/login-attempt.entity';

describe('PgIdentityUnitOfWork (integração)', () => {
  let pool: Pool;
  let sut: PgIdentityUnitOfWork;
  let userId: string;
  let email: string;

  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    sut = new PgIdentityUnitOfWork(new DatabaseService(pool));
  });

  beforeEach(async () => {
    email = `identity-uow-${Date.now()}-${Math.random()}@example.com`;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('UoW User', $1, 'original-hash', '127.0.0.1')
       RETURNING id`,
      [email],
    );
    userId = res.rows[0].id;
  });

  afterEach(async () => {
    await pool.query('DELETE FROM login_attempts WHERE email = $1', [email]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [
      userId,
    ]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('faz ROLLBACK de todas as 4 tabelas quando o callback lança no meio', async () => {
    await expect(
      sut.run(async (repos) => {
        const user = await repos.userRepo.findById(userId);
        user!.changePassword('new-hash');
        await repos.userRepo.save(user!);

        await repos.passwordResetTokenRepo.save(
          PasswordResetToken.issue({
            userId,
            tokenHash: 'a'.repeat(64),
            requestedIp: '10.0.0.1',
          }),
        );

        await repos.sessionRepo.create(
          Session.create({
            userId,
            tokenHash: 'b'.repeat(64),
            deviceInfo: 'test',
            ipAddress: '10.0.0.1',
          }),
        );

        await repos.loginAttemptRepo.record(
          LoginAttempt.create({
            email,
            ipAddress: '10.0.0.1',
            successful: true,
            userId,
          }),
        );

        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const user = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    expect(user.rows[0].password_hash).toBe('original-hash');

    const tokens = await pool.query(
      'SELECT 1 FROM password_reset_tokens WHERE user_id = $1',
      [userId],
    );
    expect(tokens.rowCount).toBe(0);

    const sessions = await pool.query(
      'SELECT 1 FROM sessions WHERE user_id = $1',
      [userId],
    );
    expect(sessions.rowCount).toBe(0);

    const attempts = await pool.query(
      'SELECT 1 FROM login_attempts WHERE email = $1',
      [email],
    );
    expect(attempts.rowCount).toBe(0);
  });

  it('COMMITa as 4 escritas quando o callback conclui', async () => {
    await sut.run(async (repos) => {
      const user = await repos.userRepo.findById(userId);
      user!.changePassword('committed-hash');
      await repos.userRepo.save(user!);
      await repos.passwordResetTokenRepo.save(
        PasswordResetToken.issue({
          userId,
          tokenHash: 'c'.repeat(64),
          requestedIp: '10.0.0.1',
        }),
      );
      await repos.loginAttemptRepo.record(
        LoginAttempt.create({
          email,
          ipAddress: '10.0.0.1',
          successful: true,
          userId,
        }),
      );
    });

    const user = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    expect(user.rows[0].password_hash).toBe('committed-hash');
    const tokens = await pool.query(
      'SELECT 1 FROM password_reset_tokens WHERE user_id = $1',
      [userId],
    );
    expect(tokens.rowCount).toBe(1);
  });
});
