import { Pool } from 'pg';
import { PgLedgerEntryRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry.repository';
import { PgLedgerEntryReadRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry-read.repository';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { LedgerEntry, Transaction } from '@/modules/financial/domain/entities';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

// Regressão de hidratação (ADR 0006 / Gap): confirma que um LedgerEntry
// salvo via PgLedgerEntryRepository (escrita) é encontrado com o MESMO id e
// createdAt (não regenerados) — tanto pelo próprio write repo quanto pelo
// read repo (réplica de leitura, mesmo schema) — quando lido de volta por
// findByTransactionId. Mesma correção de hidratação já feita para
// Transaction.restore().
describe('PgLedgerEntryRepository + PgLedgerEntryReadRepository (integração — hidratação)', () => {
  let pool: Pool;
  let db: QueryExecutor;
  let transactionRepo: PgTransactionRepository;
  let writeRepo: PgLedgerEntryRepository;
  let readRepo: PgLedgerEntryReadRepository;
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
    transactionRepo = new PgTransactionRepository(db);
    writeRepo = new PgLedgerEntryRepository(db);
    readRepo = new PgLedgerEntryReadRepository(db);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Test User', $1, 'hash', '127.0.0.1')
       RETURNING id`,
      [`ledger-entry-repo-${Date.now()}@example.com`],
    );
    userId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // ledger_entries é apenas-append (INV-014, trigger de banco); não há
    // como limpar as linhas geradas, então transactions/users também ficam
    // retidos por FK — mesmo padrão documentado nos outros specs do módulo.
    await pool.end();
  });

  async function createConfirmedTransaction(params: {
    asset: string;
    amountSatoshi: bigint;
  }): Promise<Transaction> {
    const transaction = Transaction.create({
      accountId: userId,
      type: 'deposit',
      asset: params.asset,
      amountSatoshi: params.amountSatoshi,
    });
    await transactionRepo.save(transaction);
    return transaction;
  }

  it('finds the same id, createdAt and fields after save (write repo) + findByTransactionId (write repo)', async () => {
    const transaction = await createConfirmedTransaction({
      asset: 'BTC',
      amountSatoshi: 90_000n,
    });
    const entry = LedgerEntry.create({
      transactionId: transaction.id,
      account: `USER:${userId}:BTC`,
      type: 'credit',
      amountSatoshi: 90_000n,
    });

    await writeRepo.save(entry);
    const found = await writeRepo.findByTransactionId(transaction.id);

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(entry.id);
    expect(found[0].transactionId).toBe(transaction.id);
    expect(found[0].account).toBe(`USER:${userId}:BTC`);
    expect(found[0].type).toBe('credit');
    expect(found[0].amountSatoshi).toBe(90_000n);
    expect(typeof found[0].amountSatoshi).toBe('bigint');
    expect(found[0].createdAt.getTime()).toBe(entry.createdAt.getTime());
  });

  it('finds the same id, createdAt and fields after save (write repo) + findByTransactionId (read repo)', async () => {
    const transaction = await createConfirmedTransaction({
      asset: 'ETH',
      amountSatoshi: 42_000n,
    });
    const debit = LedgerEntry.create({
      transactionId: transaction.id,
      account: `EXCHANGE:TREASURY:ETH`,
      type: 'debit',
      amountSatoshi: 42_000n,
    });
    const credit = LedgerEntry.create({
      transactionId: transaction.id,
      account: `USER:${userId}:ETH`,
      type: 'credit',
      amountSatoshi: 42_000n,
    });

    await writeRepo.save(debit);
    await writeRepo.save(credit);

    const found = await readRepo.findByTransactionId(transaction.id);
    expect(found).toHaveLength(2);

    const foundDebit = found.find((e) => e.type === 'debit');
    const foundCredit = found.find((e) => e.type === 'credit');

    expect(foundDebit).toBeDefined();
    expect(foundDebit?.id).toBe(debit.id);
    expect(foundDebit?.account).toBe(`EXCHANGE:TREASURY:ETH`);
    expect(foundDebit?.amountSatoshi).toBe(42_000n);
    expect(foundDebit?.createdAt.getTime()).toBe(debit.createdAt.getTime());

    expect(foundCredit).toBeDefined();
    expect(foundCredit?.id).toBe(credit.id);
    expect(foundCredit?.account).toBe(`USER:${userId}:ETH`);
    expect(foundCredit?.amountSatoshi).toBe(42_000n);
    expect(foundCredit?.createdAt.getTime()).toBe(credit.createdAt.getTime());
  });

  it('returns an empty array for a transaction id with no ledger entries', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';

    expect(await writeRepo.findByTransactionId(missingId)).toEqual([]);
    expect(await readRepo.findByTransactionId(missingId)).toEqual([]);
  });
});
