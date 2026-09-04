import { Pool } from 'pg';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { PostgresUnitOfWork } from '@/infrastructure/database/unit-of-work-postgres.service';
import { PgAssetRepository } from '@/modules/wallets/infrastructure/persistence/pg-asset.repository';
import { PgWalletReadRepository } from '@/modules/wallets/infrastructure/persistence/pg-wallet-read.repository';
import { CreditUseCase } from '@/modules/wallets/application/credit.usecase';
import { DebitUseCase } from '@/modules/wallets/application/debit.usecase';
import { LockUseCase } from '@/modules/wallets/application/lock.usecase';
import { UnlockUseCase } from '@/modules/wallets/application/unlock.usecase';
import { InsufficientBalanceError } from '@/modules/wallets/domain/errors/insufficient-balance.error';

describe('Wallet / Balance / Ledger (integração — banco real)', () => {
  let pool: Pool;
  let db: DatabaseService;
  let credit: CreditUseCase;
  let debit: DebitUseCase;
  let lock: LockUseCase;
  let unlock: UnlockUseCase;
  let walletRead: PgWalletReadRepository;
  let userId: string;

  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    db = new DatabaseService(pool);
    const uow = new PostgresUnitOfWork(db);
    const assetRepo = new PgAssetRepository(db);
    credit = new CreditUseCase(uow, assetRepo);
    debit = new DebitUseCase(uow, assetRepo);
    lock = new LockUseCase(uow, assetRepo);
    unlock = new UnlockUseCase(uow, assetRepo);
    walletRead = new PgWalletReadRepository({
      query: (sql, params) => pool.query(sql, params),
    });
  });

  beforeEach(async () => {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Wallet Test', $1, 'hash', '127.0.0.1') RETURNING id`,
      [`wallet-it-${Date.now()}-${Math.random()}@example.com`],
    );
    userId = res.rows[0].id;
  });

  afterEach(async () => {
    // TRUNCATE não dispara os triggers BEFORE UPDATE/DELETE de imutabilidade.
    await pool.query(
      `TRUNCATE ledger_entries, transactions, balances, wallets CASCADE`,
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('depósito credita 0.5 BTC → balances + 2 ledger_entries balanceados', async () => {
    await credit.execute({
      userId,
      asset: 'BTC',
      amountMinor: 50_000_000n,
      reference: { referenceType: 'DEPOSIT', referenceId: `dep-${userId}` },
    });

    const balances = await walletRead.listBalancesByUserId(userId);
    expect(balances).toHaveLength(1);
    expect(balances[0].availableMinor).toBe(50_000_000n);

    const legs = await pool.query<{
      entry_type: string;
      account: string;
      amount_minor: string;
    }>(
      `SELECT le.entry_type, le.account, le.amount_minor
       FROM ledger_entries le
       JOIN transactions t ON t.id = le.transaction_id
       WHERE t.reference_id = $1 ORDER BY le.entry_type`,
      [`dep-${userId}`],
    );
    expect(legs.rows).toHaveLength(2);
    const debitLeg = legs.rows.find((r) => r.entry_type === 'debit')!;
    const creditLeg = legs.rows.find((r) => r.entry_type === 'credit')!;
    expect(debitLeg.account).toBe('EXCHANGE:TREASURY:BTC');
    expect(creditLeg.account).toBe(`USER_AVAILABLE:${userId}:BTC`);
    expect(BigInt(debitLeg.amount_minor)).toBe(BigInt(creditLeg.amount_minor));
  });

  it('lock seguido de unlock preserva o total (4 pernas)', async () => {
    await credit.execute({
      userId,
      asset: 'BTC',
      amountMinor: 100n,
      reference: { referenceType: 'DEPOSIT', referenceId: `d-${userId}` },
    });
    await lock.execute({
      userId,
      asset: 'BTC',
      amountMinor: 40n,
      reference: { referenceType: 'ORDER', referenceId: `o-${userId}` },
    });
    await unlock.execute({
      userId,
      asset: 'BTC',
      amountMinor: 40n,
      reference: { referenceType: 'ORDER', referenceId: `o-${userId}` },
    });

    const [b] = await walletRead.listBalancesByUserId(userId);
    expect(b.availableMinor).toBe(100n);
    expect(b.lockedMinor).toBe(0n);
  });

  it('debit além do disponível → rollback total + erro tipado', async () => {
    await expect(
      debit.execute({
        userId,
        asset: 'BTC',
        amountMinor: 10n,
        reference: { referenceType: 'WITHDRAWAL', referenceId: `w-${userId}` },
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    const tx = await pool.query(
      `SELECT 1 FROM transactions WHERE reference_id = $1`,
      [`w-${userId}`],
    );
    expect(tx.rows).toHaveLength(0);
  });

  it('idempotência: 2x a mesma tripla → 1 transaction', async () => {
    const ref = {
      referenceType: 'DEPOSIT' as const,
      referenceId: `idem-${userId}`,
    };
    await credit.execute({
      userId,
      asset: 'BTC',
      amountMinor: 100n,
      reference: ref,
    });
    const second = await credit.execute({
      userId,
      asset: 'BTC',
      amountMinor: 100n,
      reference: ref,
    });

    expect(second.idempotent).toBe(true);
    const txs = await pool.query(
      `SELECT 1 FROM transactions WHERE reference_id = $1`,
      [`idem-${userId}`],
    );
    expect(txs.rows).toHaveLength(1);

    const [b] = await walletRead.listBalancesByUserId(userId);
    expect(b.availableMinor).toBe(100n);
  });

  it('concorrência: dois debit paralelos com saldo p/ só um → um falha, saldo nunca negativo', async () => {
    await credit.execute({
      userId,
      asset: 'BTC',
      amountMinor: 100n,
      reference: { referenceType: 'DEPOSIT', referenceId: `c-${userId}` },
    });

    const results = await Promise.allSettled([
      debit.execute({
        userId,
        asset: 'BTC',
        amountMinor: 100n,
        reference: { referenceType: 'WITHDRAWAL', referenceId: `c1-${userId}` },
      }),
      debit.execute({
        userId,
        asset: 'BTC',
        amountMinor: 100n,
        reference: { referenceType: 'WITHDRAWAL', referenceId: `c2-${userId}` },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const [b] = await walletRead.listBalancesByUserId(userId);
    expect(b.availableMinor).toBe(0n);
  });

  it('imutabilidade: UPDATE / DELETE em ledger_entries → exceção do trigger', async () => {
    await credit.execute({
      userId,
      asset: 'BTC',
      amountMinor: 100n,
      reference: { referenceType: 'DEPOSIT', referenceId: `im-${userId}` },
    });

    await expect(
      pool.query(
        `UPDATE ledger_entries SET amount_minor = 1
         WHERE account = $1`,
        [`USER_AVAILABLE:${userId}:BTC`],
      ),
    ).rejects.toThrow(/append-only/);

    await expect(
      pool.query(`DELETE FROM ledger_entries WHERE account = $1`, [
        `USER_AVAILABLE:${userId}:BTC`,
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it('reconciliação: Σ ledger_entries das contas do usuário == balances', async () => {
    await credit.execute({
      userId,
      asset: 'BTC',
      amountMinor: 100n,
      reference: { referenceType: 'DEPOSIT', referenceId: `r-${userId}` },
    });
    await lock.execute({
      userId,
      asset: 'BTC',
      amountMinor: 30n,
      reference: { referenceType: 'ORDER', referenceId: `rl-${userId}` },
    });

    const recon = await pool.query<{
      available_minor: string;
      locked_minor: string;
      ledger_available: string;
      ledger_locked: string;
    }>(
      `SELECT b.available_minor, b.locked_minor,
        COALESCE(SUM(CASE WHEN le.account = 'USER_AVAILABLE:' || $1 || ':' || b.asset
             THEN (CASE WHEN le.entry_type = 'credit' THEN le.amount_minor ELSE -le.amount_minor END) ELSE 0 END), 0) AS ledger_available,
        COALESCE(SUM(CASE WHEN le.account = 'USER_LOCKED:' || $1 || ':' || b.asset
             THEN (CASE WHEN le.entry_type = 'credit' THEN le.amount_minor ELSE -le.amount_minor END) ELSE 0 END), 0) AS ledger_locked
       FROM balances b
       JOIN wallets w ON w.id = b.wallet_id
       LEFT JOIN ledger_entries le ON le.account IN (
         'USER_AVAILABLE:' || $1 || ':' || b.asset,
         'USER_LOCKED:' || $1 || ':' || b.asset)
       WHERE w.user_id = $1::uuid
       GROUP BY b.available_minor, b.locked_minor`,
      [userId],
    );

    const row = recon.rows[0];
    expect(BigInt(row.available_minor)).toBe(BigInt(row.ledger_available));
    expect(BigInt(row.locked_minor)).toBe(BigInt(row.ledger_locked));
  });
});
