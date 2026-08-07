import { Pool } from 'pg';
import { ConfirmDepositWithUowUseCase } from '@/modules/financial/application/confirm-deposit-with-uow.usecase';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { PostgresUnitOfWork } from '@/infrastructure/database/unit-of-work-postgres.service';
import { PgWalletRepository } from '@/modules/financial/infrastructure/persistence/pg-wallet.repository';
import { PgTransactionRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction.repository';
import { Transaction } from '@/modules/financial/domain/entities';

// Regressão de atomicidade (UnitOfWork): se qualquer passo do fluxo de
// confirmação de depósito falhar DEPOIS que a transação e os lançamentos de
// ledger já foram escritos (mas antes do COMMIT), nada pode sobreviver —
// nem a Transaction, nem os LedgerEntry, nem a Wallet. Isso é exercitado com
// uma transação e um UnitOfWork REAIS (não mocks), forçando a falha apenas
// no último passo (crédito da wallet) via spy no repositório concreto.
describe('ConfirmDepositWithUowUseCase — rollback do UnitOfWork (integração)', () => {
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
      [`confirm-deposit-rollback-${Date.now()}@example.com`],
    );
    userId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // ledger_entries é apenas-append (INV-014, trigger de banco); não há
    // nada para limpar ali de qualquer forma, já que este teste prova que
    // NENHUMA linha de ledger sobrevive ao rollback.
    await pool.query('DELETE FROM wallets WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM transactions WHERE account_id = $1', [
      userId,
    ]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rolls back the transaction, the ledger entries and the wallet credit when the last step fails', async () => {
    const transaction = Transaction.create({
      accountId: userId,
      type: 'deposit',
      asset: 'BTC',
      amountSatoshi: 75_000n,
    });
    const writeRepo = new PgTransactionRepository(db);
    await writeRepo.save(transaction);

    jest
      .spyOn(PgWalletRepository.prototype, 'creditAvailable')
      .mockRejectedValueOnce(new Error('forced failure after ledger writes'));

    await expect(
      useCase.execute({ transactionId: transaction.id, confirmations: 3 }),
    ).rejects.toThrow('forced failure after ledger writes');

    const { rows: transactionRows } = await pool.query(
      `SELECT status FROM transactions WHERE id = $1`,
      [transaction.id],
    );
    expect(transactionRows).toHaveLength(1);
    // A transação foi salva ANTES do uow.run (fora da transação SQL forçada a
    // falhar), então ela persiste com status 'pending' — mas a confirmação
    // feita DENTRO do uow.run (status -> 'confirmed') deve ter sido revertida.
    expect(transactionRows[0].status).toBe('pending');

    const { rows: ledgerRows } = await pool.query(
      `SELECT * FROM ledger_entries WHERE transaction_id = $1`,
      [transaction.id],
    );
    expect(ledgerRows).toHaveLength(0);

    const { rows: walletRows } = await pool.query(
      `SELECT * FROM wallets WHERE user_id = $1 AND asset = 'BTC'`,
      [userId],
    );
    expect(walletRows).toHaveLength(0);
  });

  it('leaves no ledger entry for the transaction and no wallet row for the user when the wallet credit step fails', async () => {
    const transaction = Transaction.create({
      accountId: userId,
      type: 'deposit',
      asset: 'ETH',
      amountSatoshi: 20_000n,
    });
    const writeRepo = new PgTransactionRepository(db);
    await writeRepo.save(transaction);

    jest
      .spyOn(PgWalletRepository.prototype, 'creditAvailable')
      .mockRejectedValueOnce(new Error('forced failure same run'));

    await expect(
      useCase.execute({ transactionId: transaction.id, confirmations: 3 }),
    ).rejects.toThrow('forced failure same run');

    const { rows: transactionRows } = await pool.query(
      `SELECT status FROM transactions WHERE id = $1`,
      [transaction.id],
    );
    expect(transactionRows[0].status).toBe('pending');

    const { rows: ledgerRows } = await pool.query(
      `SELECT * FROM ledger_entries WHERE transaction_id = $1`,
      [transaction.id],
    );
    expect(ledgerRows).toHaveLength(0);

    const { rows: walletRows } = await pool.query(
      `SELECT * FROM wallets WHERE user_id = $1 AND asset = 'ETH'`,
      [userId],
    );
    expect(walletRows).toHaveLength(0);
  });
});
