import { Pool } from 'pg';
import { ConfirmDepositWithUowUseCase } from '@/modules/financial/application/confirm-deposit-with-uow.usecase';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { PostgresUnitOfWork } from '@/infrastructure/database/unit-of-work-postgres.service';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { Transaction } from '@/modules/financial/domain/entities';

// Plano de Teste do ADR 0006 — reconciliação INV-008/INV-009: depois que um
// depósito é confirmado, o crédito na wallet materializada não pode ser nem
// maior (INV-008 — sem criação espontânea) nem menor (INV-009 — sem
// destruição espontânea) do que a soma dos ledger_entries de crédito da
// conta do usuário. Usa UnitOfWork/Postgres reais (não mocks) para exercitar
// o fluxo completo de ConfirmDepositWithUowUseCase.
describe('ConfirmDepositWithUowUseCase — reconciliação ledger x wallet (integração)', () => {
  let pool: Pool;
  let db: DatabaseService;
  let uow: PostgresUnitOfWork;
  let useCase: ConfirmDepositWithUowUseCase;
  let userId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    });
    db = new DatabaseService(pool);
    uow = new PostgresUnitOfWork(db);
    useCase = new ConfirmDepositWithUowUseCase(uow);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Test User', $1, 'hash', '127.0.0.1')
       RETURNING id`,
      [`confirm-deposit-reconciliation-${Date.now()}@example.com`],
    );
    userId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // ledger_entries é apenas-append (INV-014, trigger de banco); transactions
    // e users ficam retidos pela FK, mesma limitação documentada nos demais
    // specs de integração do módulo.
    await pool.query('DELETE FROM wallets WHERE user_id = $1', [userId]);
    await pool.end();
  });

  async function confirmDeposit(params: {
    asset: string;
    amountSatoshi: bigint;
  }): Promise<string> {
    const transaction = Transaction.create({
      accountId: userId,
      type: 'deposit',
      asset: params.asset,
      amountSatoshi: params.amountSatoshi,
    });
    const writeRepo = new PgTransactionRepository(db);
    await writeRepo.save(transaction);

    await useCase.execute({
      transactionId: transaction.id,
      confirmations: 3,
    });

    return transaction.id;
  }

  it('credits the wallet by exactly the amount of the associated credit ledger entry (INV-008)', async () => {
    const transactionId = await confirmDeposit({
      asset: 'BTC',
      amountSatoshi: 120_000n,
    });

    const account = `USER:${userId}:BTC`;
    const { rows: creditRows } = await pool.query<{ amount_satoshi: string }>(
      `SELECT amount_satoshi FROM ledger_entries
       WHERE transaction_id = $1 AND account = $2 AND type = 'credit'`,
      [transactionId, account],
    );
    expect(creditRows).toHaveLength(1);
    const creditAmount = BigInt(creditRows[0].amount_satoshi);
    expect(creditAmount).toBe(120_000n);

    const { rows: walletRows } = await pool.query<{
      available_satoshi: string;
    }>(
      `SELECT available_satoshi FROM wallets WHERE user_id = $1 AND asset = 'BTC'`,
      [userId],
    );
    expect(walletRows).toHaveLength(1);
    const availableSatoshi = BigInt(walletRows[0].available_satoshi);

    // INV-008: nenhum saldo é criado do nada — o crédito na wallet é
    // exatamente o valor do ledger_entry de crédito associado à transação.
    expect(availableSatoshi).toBe(creditAmount);
  });

  it('keeps wallet.available_satoshi exactly equal to the sum of credit ledger entries across two sequential deposits (INV-009)', async () => {
    await confirmDeposit({ asset: 'ETH', amountSatoshi: 30_000n });
    await confirmDeposit({ asset: 'ETH', amountSatoshi: 15_000n });

    const account = `USER:${userId}:ETH`;
    const { rows: creditRows } = await pool.query<{ amount_satoshi: string }>(
      `SELECT amount_satoshi FROM ledger_entries
       WHERE account = $1 AND type = 'credit'`,
      [account],
    );
    expect(creditRows).toHaveLength(2);
    const totalCredited = creditRows.reduce(
      (sum, row) => sum + BigInt(row.amount_satoshi),
      0n,
    );
    expect(totalCredited).toBe(45_000n);

    const { rows: debitRows } = await pool.query<{ amount_satoshi: string }>(
      `SELECT amount_satoshi FROM ledger_entries
       WHERE account = 'EXCHANGE:TREASURY:ETH' AND type = 'debit'
         AND transaction_id IN (
           SELECT id FROM transactions WHERE account_id = $1 AND asset = 'ETH'
         )`,
      [userId],
    );
    const totalDebited = debitRows.reduce(
      (sum, row) => sum + BigInt(row.amount_satoshi),
      0n,
    );

    const { rows: walletRows } = await pool.query<{
      available_satoshi: string;
    }>(
      `SELECT available_satoshi FROM wallets WHERE user_id = $1 AND asset = 'ETH'`,
      [userId],
    );
    expect(walletRows).toHaveLength(1);
    const availableSatoshi = BigInt(walletRows[0].available_satoshi);

    // INV-009: sem destruição espontânea — a soma de créditos menos débitos
    // da conta do usuário (aqui só há créditos na conta do usuário; débitos
    // são registrados na conta do tesouro) bate exatamente com o saldo
    // materializado, mesmo após dois depósitos sequenciais.
    expect(availableSatoshi).toBe(totalCredited);
    // A conta do usuário nunca recebe lançamentos de débito neste fluxo —
    // confirma a suposição usada acima (créditos - débitos = créditos).
    const { rows: userDebitRows } = await pool.query(
      `SELECT amount_satoshi FROM ledger_entries WHERE account = $1 AND type = 'debit'`,
      [account],
    );
    expect(userDebitRows).toHaveLength(0);
    expect(totalDebited).toBe(30_000n + 15_000n);
  });
});
