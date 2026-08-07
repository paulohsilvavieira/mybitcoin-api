import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Pool } from 'pg';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import {
  READ_POOL_TOKEN,
  WRITE_POOL_TOKEN,
} from '@/infrastructure/database/database.token';
import { FinancialModule } from '@/modules/financial/financial.module';
import { IdentityModule } from '@/modules/identity/identity.module';
import { DomainErrorFilter } from '@/infrastructure/http/domain-error.filter';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '@/modules/identity/presentation/session-cookies';
import { INTERNAL_API_KEY_HEADER } from '@/modules/financial/presentation/guards/api-key.guard';

const PASSWORD = 'Str0ng!Pass';

interface ParsedCookies {
  session?: string;
  csrf?: string;
  raw: string[];
}

function parseSetCookie(header: string[] | undefined): ParsedCookies {
  const raw = header ?? [];
  const read = (name: string): string | undefined => {
    const entry = raw.find((cookie) => cookie.startsWith(`${name}=`));
    if (!entry) return undefined;
    const value = entry.split(';')[0].slice(name.length + 1);
    return value === '' ? undefined : value;
  };
  return {
    session: read(SESSION_COOKIE_NAME),
    csrf: read(CSRF_COOKIE_NAME),
    raw,
  };
}

describe('FinancialController (integração)', () => {
  let app: INestApplication<App>;
  let server: App;
  let writePool: Pool;
  let readPool: Pool;
  let email: string;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        FinancialModule,
        IdentityModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<App>();
    app.use(cookieParser());
    app.useGlobalFilters(new DomainErrorFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer();

    const poolConfig = {
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    };
    writePool = new Pool({
      ...poolConfig,
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
    });
    readPool = new Pool({
      ...poolConfig,
      host: process.env.DB_READ_HOST ?? 'localhost',
      port: Number(process.env.DB_READ_PORT ?? 5432),
    });

    email = `financial-controller-${Date.now()}@example.com`;
    const registerResponse = await request(server)
      .post('/auth/register')
      .send({
        name: 'Satoshi Nakamoto',
        email,
        password: PASSWORD,
        termsAccepted: true,
      })
      .expect(201);
    userId = registerResponse.body.userId as string;

    await waitForReplica(userId);
  }, 30_000);

  afterAll(async () => {
    await writePool.query('DELETE FROM wallets WHERE user_id = $1', [userId]);
    // ledger_entries é apenas-append (INV-014, trigger de banco) e referencia
    // transactions via FK — nenhuma das duas pode ser limpa em teste; as
    // linhas geradas aqui permanecem intencionalmente.
    await writePool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    // users não é limpo: transactions (com ledger_entries append-only
    // apontando para ele) permanece por causa da FK, então o usuário também
    // fica retido por transactions_account_id_fkey.
    await writePool.end();
    await readPool.end();
    await app.get<Pool>(WRITE_POOL_TOKEN).end();
    await app.get<Pool>(READ_POOL_TOKEN).end();
    await app.close();
  });

  async function waitForReplica(id: string): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const { rowCount } = await readPool.query(
        'SELECT 1 FROM users WHERE id = $1',
        [id],
      );
      if (rowCount === 1) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Usuário ${id} não replicou para a réplica a tempo`);
  }

  async function login(): Promise<ParsedCookies> {
    const response = await request(server)
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return parseSetCookie(
      response.headers['set-cookie'] as unknown as string[],
    );
  }

  function cookieHeader(cookies: ParsedCookies): string {
    return `${SESSION_COOKIE_NAME}=${cookies.session}; ${CSRF_COOKIE_NAME}=${cookies.csrf}`;
  }

  async function insertPendingDeposit(params: {
    asset: string;
    amountSatoshi: bigint;
  }): Promise<string> {
    const { rows } = await writePool.query<{ id: string }>(
      `INSERT INTO transactions (id, account_id, type, asset, amount_satoshi, status, created_at)
       VALUES (gen_random_uuid(), $1, 'deposit', $2, $3, 'pending', NOW())
       RETURNING id`,
      [userId, params.asset, params.amountSatoshi.toString()],
    );
    return rows[0].id;
  }

  async function waitForBalanceReplica(asset: string): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const { rowCount } = await readPool.query(
        'SELECT 1 FROM wallets WHERE user_id = $1 AND asset = $2',
        [userId, asset],
      );
      if (rowCount === 1) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Wallet ${userId}/${asset} não replicou a tempo`);
  }

  const VALID_API_KEY =
    process.env.BLOCKCHAIN_MONITOR_API_KEY ?? 'test-blockchain-monitor-key';

  describe('GET /financial/balances', () => {
    it('responde 401 sem sessão', async () => {
      await request(server).get('/financial/balances').expect(401);
    });

    it('responde 200 com lista vazia para usuário sem movimentação', async () => {
      const cookies = await login();

      const response = await request(server)
        .get('/financial/balances')
        .set('Cookie', cookieHeader(cookies))
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('reflete o saldo do usuário após um depósito confirmado', async () => {
      const cookies = await login();
      const transactionId = await insertPendingDeposit({
        asset: 'BTC',
        amountSatoshi: 150_000n,
      });

      await request(server)
        .post('/financial/deposit/confirm')
        .set(INTERNAL_API_KEY_HEADER, VALID_API_KEY)
        .send({ transactionId, confirmations: 3 })
        .expect(201);

      await waitForBalanceReplica('BTC');

      const response = await request(server)
        .get('/financial/balances')
        .set('Cookie', cookieHeader(cookies))
        .expect(200);

      expect(response.body).toEqual([
        {
          asset: 'BTC',
          available: '150000',
          locked: '0',
          total: '150000',
        },
      ]);
    });
  });

  describe('POST /financial/deposit/confirm', () => {
    it('responde 401 sem o header X-Internal-Api-Key', async () => {
      const transactionId = await insertPendingDeposit({
        asset: 'ETH',
        amountSatoshi: 5_000n,
      });

      await request(server)
        .post('/financial/deposit/confirm')
        .send({ transactionId, confirmations: 1 })
        .expect(401);
    });

    it('responde 401 com um header X-Internal-Api-Key inválido', async () => {
      const transactionId = await insertPendingDeposit({
        asset: 'ETH',
        amountSatoshi: 5_000n,
      });

      await request(server)
        .post('/financial/deposit/confirm')
        .set(INTERNAL_API_KEY_HEADER, 'wrong-key')
        .send({ transactionId, confirmations: 1 })
        .expect(401);
    });

    it('confirma o depósito com uma API key válida e retorna status confirmed', async () => {
      const transactionId = await insertPendingDeposit({
        asset: 'ETH',
        amountSatoshi: 5_000n,
      });

      const response = await request(server)
        .post('/financial/deposit/confirm')
        .set(INTERNAL_API_KEY_HEADER, VALID_API_KEY)
        .send({ transactionId, confirmations: 1 })
        .expect(201);

      expect(response.body).toEqual({ status: 'confirmed' });

      const { rows } = await writePool.query<{ status: string }>(
        'SELECT status FROM transactions WHERE id = $1',
        [transactionId],
      );
      expect(rows[0].status).toBe('confirmed');
    });

    it('responde 422 TRANSACTION_NOT_FOUND para uma transação inexistente', async () => {
      const missingId = '00000000-0000-0000-0000-000000000000';

      const response = await request(server)
        .post('/financial/deposit/confirm')
        .set(INTERNAL_API_KEY_HEADER, VALID_API_KEY)
        .send({ transactionId: missingId, confirmations: 1 })
        .expect(422);

      expect(response.body.code).toBe('TRANSACTION_NOT_FOUND');
    });
  });
});
