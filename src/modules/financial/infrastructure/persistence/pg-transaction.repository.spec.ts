import { Pool } from 'pg';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { PgTransactionReadRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction-read.repository';
import { Transaction } from '@/modules/financial/domain/entities/transaction.entity';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

// Regressão de hidratação (ADR 0006 / Gap): confirma que uma Transaction
// salva via PgTransactionRepository (escrita) é encontrada com o MESMO id e
// com os mesmos campos — incluindo amount_satoshi como bigint — quando lida
// de volta por PgTransactionReadRepository (réplica de leitura, mesmo schema).
describe('PgTransactionRepository + PgTransactionReadRepository (integração — hidratação)', () => {
  let pool: Pool;
  let db: QueryExecutor;
  let writeRepo: PgTransactionRepository;
  let readRepo: PgTransactionReadRepository;
  let userId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    db = { query: (sql, params) => pool.query(sql, params) };
    writeRepo = new PgTransactionRepository(db);
    readRepo = new PgTransactionReadRepository(db);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Test User', $1, 'hash', '127.0.0.1')
       RETURNING id`,
      [`transaction-repo-${Date.now()}@example.com`],
    );
    userId = userResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM transactions WHERE account_id = $1', [
      userId,
    ]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM transactions WHERE account_id = $1', [
      userId,
    ]);
  });

  it('finds the same id and equivalent fields after save + findById (write repo)', async () => {
    const transaction = Transaction.create({
      accountId: userId,
      type: 'deposit',
      asset: 'BTC',
      amountSatoshi: 100_000n,
    });

    await writeRepo.save(transaction);
    const found = await writeRepo.findById(transaction.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(transaction.id);
    expect(found?.accountId).toBe(userId);
    expect(found?.type).toBe('deposit');
    expect(found?.asset).toBe('BTC');
    expect(found?.amountSatoshi).toBe(100_000n);
    expect(typeof found?.amountSatoshi).toBe('bigint');
    expect(found?.status).toBe('pending');
  });

  it('finds the same id and equivalent fields after save (write repo) + findById (read repo)', async () => {
    const transaction = Transaction.create({
      accountId: userId,
      type: 'withdrawal',
      asset: 'BTC',
      amountSatoshi: 250_000n,
    });

    await writeRepo.save(transaction);
    const found = await readRepo.findById(transaction.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(transaction.id);
    expect(found?.accountId).toBe(userId);
    expect(found?.amountSatoshi).toBe(250_000n);
    expect(typeof found?.amountSatoshi).toBe('bigint');
  });

  it('persists status transitions performed on the domain entity before saving', async () => {
    const transaction = Transaction.create({
      accountId: userId,
      type: 'deposit',
      asset: 'BTC',
      amountSatoshi: 10_000n,
    });
    transaction.confirm();

    await writeRepo.save(transaction);
    const found = await writeRepo.findById(transaction.id);

    expect(found?.status).toBe('confirmed');
  });

  it('returns null from both repositories for an id that was never saved', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';

    expect(await writeRepo.findById(missingId)).toBeNull();
    expect(await readRepo.findById(missingId)).toBeNull();
  });

  // Regressão do bug corrigido pelo ADR 0006: confirmar uma Transaction JÁ
  // PERSISTIDA (findById -> confirm() -> save()) deve fazer um UPDATE na
  // linha existente, nunca inserir uma segunda linha. saveTransactionQuery
  // usa ON CONFLICT (id) DO UPDATE, mas isso só funciona se o id retornado
  // por findById for o mesmo id original — daí o teste de ciclo completo.
  it('updates the existing row in place (no duplicate insert) on findById -> confirm() -> save()', async () => {
    const transaction = Transaction.create({
      accountId: userId,
      type: 'deposit',
      asset: 'BTC',
      amountSatoshi: 60_000n,
    });
    await writeRepo.save(transaction);

    const found = await writeRepo.findById(transaction.id);
    expect(found).not.toBeNull();

    found!.confirm();
    await writeRepo.save(found!);

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM transactions WHERE id = $1',
      [transaction.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('confirmed');

    const { rows: countRows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM transactions WHERE account_id = $1',
      [userId],
    );
    expect(Number(countRows[0].count)).toBe(1);
  });
});
