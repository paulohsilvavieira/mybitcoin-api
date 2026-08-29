import { Pool } from 'pg';
import { PgPasswordResetRequestRepository } from '@/modules/identity/infrastructure/persistence/pg-password-reset-request.repository';
import { PasswordResetRequest } from '@/modules/identity/domain/entities/password-reset-request.entity';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

describe('PgPasswordResetRequestRepository (integração)', () => {
  let pool: Pool;
  let db: QueryExecutor;
  let sut: PgPasswordResetRequestRepository;
  const email = `prr-repo-${Date.now()}@example.com`;

  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    db = { query: (sql, params) => pool.query(sql, params) };
    sut = new PgPasswordResetRequestRepository(db);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM password_reset_requests WHERE email = $1', [
      email,
    ]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM password_reset_requests WHERE email = $1', [
      email,
    ]);
  });

  it('record grava a solicitação e countSince a enxerga', async () => {
    await sut.record(
      PasswordResetRequest.record({
        email,
        ipAddress: '10.0.0.1',
        userFound: true,
      }),
    );

    const count = await sut.countSince(
      email,
      new Date(Date.now() - 15 * 60 * 1000),
    );
    expect(count).toBe(1);
  });

  it('countSince conta apenas solicitações dentro da janela', async () => {
    const now = Date.now();
    // uma dentro da janela
    await sut.record(
      PasswordResetRequest.record({
        email,
        ipAddress: '10.0.0.1',
        userFound: false,
      }),
    );
    // uma antiga (20 min atrás) inserida direto
    await pool.query(
      `INSERT INTO password_reset_requests (email, ip_address, user_found, created_at)
       VALUES ($1, '10.0.0.1', false, $2)`,
      [email, new Date(now - 20 * 60 * 1000)],
    );

    const count = await sut.countSince(email, new Date(now - 15 * 60 * 1000));
    expect(count).toBe(1);
  });

  it('countSince retorna 0 para e-mail sem solicitações', async () => {
    const count = await sut.countSince(
      `nope-${Date.now()}@example.com`,
      new Date(Date.now() - 15 * 60 * 1000),
    );
    expect(count).toBe(0);
  });
});
