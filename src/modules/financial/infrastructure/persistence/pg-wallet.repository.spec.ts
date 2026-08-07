import { Pool } from 'pg';
import { PgWalletRepository } from '@/modules/financial/infrastructure/persistence/pg-wallet.repository';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

describe('PgWalletRepository (integração)', () => {
  let pool: Pool;
  let db: QueryExecutor;
  let sut: PgWalletRepository;
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
    sut = new PgWalletRepository(db);

    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, registration_ip)
       VALUES ('Test User', $1, 'hash', '127.0.0.1')
       RETURNING id`,
      [`wallet-repo-${Date.now()}@example.com`],
    );
    userId = userResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM wallets WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM wallets WHERE user_id = $1', [userId]);
  });

  describe('creditAvailable', () => {
    it('creates the wallet row on the first credit for a user+asset pair', async () => {
      const wallet = await sut.creditAvailable({
        userId,
        asset: 'BTC',
        amountSatoshi: 100_000n,
      });

      expect(wallet.userId).toBe(userId);
      expect(wallet.asset).toBe('BTC');
      expect(wallet.availableSatoshi).toBe(100_000n);
      expect(wallet.lockedSatoshi).toBe(0n);
    });

    it('accumulates available balance on subsequent credits, preserving the id', async () => {
      const first = await sut.creditAvailable({
        userId,
        asset: 'BTC',
        amountSatoshi: 100_000n,
      });

      const second = await sut.creditAvailable({
        userId,
        asset: 'BTC',
        amountSatoshi: 50_000n,
      });

      expect(second.id).toBe(first.id);
      expect(second.availableSatoshi).toBe(150_000n);
    });

    it('keeps balances of different assets for the same user independent', async () => {
      await sut.creditAvailable({
        userId,
        asset: 'BTC',
        amountSatoshi: 100_000n,
      });
      await sut.creditAvailable({
        userId,
        asset: 'ETH',
        amountSatoshi: 200_000n,
      });

      const btc = await sut.findByUserIdAndAsset(userId, 'BTC');
      const eth = await sut.findByUserIdAndAsset(userId, 'ETH');

      expect(btc?.availableSatoshi).toBe(100_000n);
      expect(eth?.availableSatoshi).toBe(200_000n);
    });

    // Regressão de concorrência: o incremento é feito inteiramente no lado
    // do SQL (INSERT ... ON CONFLICT DO UPDATE SET available_satoshi =
    // wallets.available_satoshi + EXCLUDED.available_satoshi), nunca via
    // read-modify-write em memória. Duas chamadas concorrentes para o mesmo
    // (user_id, asset) devem, portanto, somar corretamente sem perder
    // nenhuma das duas escritas.
    it('sums both amounts correctly when two credits race for the same user+asset', async () => {
      const [walletA, walletB] = await Promise.all([
        sut.creditAvailable({
          userId,
          asset: 'BTC',
          amountSatoshi: 30_000n,
        }),
        sut.creditAvailable({
          userId,
          asset: 'BTC',
          amountSatoshi: 70_000n,
        }),
      ]);

      expect(walletA.id).toBe(walletB.id);

      const finalWallet = await sut.findByUserIdAndAsset(userId, 'BTC');
      expect(finalWallet?.availableSatoshi).toBe(100_000n);
    });

    // Mesma regressão de concorrência acima, mas cobrindo o caminho
    // ON CONFLICT DO UPDATE sob concorrência real: a wallet já existe (criada
    // por um crédito anterior) quando as duas chamadas concorrentes chegam,
    // então o INSERT inicial de nenhuma delas "vence" — as duas caem no
    // DO UPDATE e precisam somar corretamente mesmo assim.
    it('sums both amounts correctly when two credits race against an already-existing wallet', async () => {
      const initial = await sut.creditAvailable({
        userId,
        asset: 'BTC',
        amountSatoshi: 1_000n,
      });

      const [walletA, walletB] = await Promise.all([
        sut.creditAvailable({
          userId,
          asset: 'BTC',
          amountSatoshi: 30_000n,
        }),
        sut.creditAvailable({
          userId,
          asset: 'BTC',
          amountSatoshi: 70_000n,
        }),
      ]);

      expect(walletA.id).toBe(initial.id);
      expect(walletB.id).toBe(initial.id);

      const finalWallet = await sut.findByUserIdAndAsset(userId, 'BTC');
      expect(finalWallet?.availableSatoshi).toBe(101_000n);
    });
  });

  describe('findByUserIdAndAsset', () => {
    it('returns null when no wallet exists for the user+asset pair', async () => {
      const wallet = await sut.findByUserIdAndAsset(userId, 'BTC');

      expect(wallet).toBeNull();
    });

    it('rehydrates satoshi amounts as bigint', async () => {
      await sut.creditAvailable({
        userId,
        asset: 'BTC',
        amountSatoshi: 42_000n,
      });

      const wallet = await sut.findByUserIdAndAsset(userId, 'BTC');

      expect(typeof wallet?.availableSatoshi).toBe('bigint');
      expect(wallet?.availableSatoshi).toBe(42_000n);
    });
  });
});
