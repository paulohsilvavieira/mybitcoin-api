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
import { IdentityModule } from '@/modules/identity/identity.module';
import { KycModule } from '@/modules/kyc/kyc.module';
import { DomainErrorFilter } from '@/infrastructure/http/domain-error.filter';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '@/modules/identity/presentation/session-cookies';

const PASSWORD = 'Str0ng!Pass';

function checkDigit(digits: number[]): number {
  const factorStart = digits.length + 1;
  const sum = digits.reduce(
    (acc, digit, index) => acc + digit * (factorStart - index),
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Gera um CPF válido e formatado, distinto a cada chamada. */
function generateValidCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const d1 = checkDigit(base);
  const d2 = checkDigit([...base, d1]);
  const all = [...base, d1, d2].join('');
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

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

describe('KycController (integração)', () => {
  let app: INestApplication<App>;
  let server: App;
  let writePool: Pool;
  let readPool: Pool;
  const createdUserIds: string[] = [];
  const run = Date.now();
  let userSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        IdentityModule,
        KycModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<App>();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new DomainErrorFilter());
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
  }, 30_000);

  afterAll(async () => {
    if (createdUserIds.length > 0 && writePool) {
      await writePool.query(
        'DELETE FROM kyc_submissions WHERE user_id = ANY($1)',
        [createdUserIds],
      );
      await writePool.query(
        'DELETE FROM kyc_profiles WHERE user_id = ANY($1)',
        [createdUserIds],
      );
      await writePool.query('DELETE FROM sessions WHERE user_id = ANY($1)', [
        createdUserIds,
      ]);
      await writePool.query('DELETE FROM users WHERE id = ANY($1)', [
        createdUserIds,
      ]);
    }
    await writePool?.end();
    await readPool?.end();
    if (app) {
      await app.get<Pool>(WRITE_POOL_TOKEN).end();
      await app.get<Pool>(READ_POOL_TOKEN).end();
      await app.close();
    }
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

  async function createUserAndLogin(): Promise<{
    userId: string;
    cookies: ParsedCookies;
  }> {
    userSeq += 1;
    const email = `kyc-controller-${run}-${userSeq}@example.com`;
    const registerResponse = await request(server)
      .post('/auth/register')
      .send({
        name: 'Ada Lovelace',
        email,
        password: PASSWORD,
        termsAccepted: true,
      })
      .expect(201);
    const userId = registerResponse.body.userId as string;
    createdUserIds.push(userId);
    await waitForReplica(userId);

    const loginResponse = await request(server)
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = parseSetCookie(
      loginResponse.headers['set-cookie'] as unknown as string[],
    );
    return { userId, cookies };
  }

  function cookieHeader(cookies: ParsedCookies): string {
    return `${SESSION_COOKIE_NAME}=${cookies.session}; ${CSRF_COOKIE_NAME}=${cookies.csrf}`;
  }

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      fullName: 'Ada Lovelace',
      cpf: generateValidCpf(),
      birthDate: '1990-05-20',
      nationality: 'BR',
      ...overrides,
    };
  }

  function submitKyc(cookies: ParsedCookies, body: Record<string, unknown>) {
    return request(server)
      .post('/kyc')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.csrf!)
      .send(body);
  }

  it('POST /kyc com dados válidos aprova automaticamente (201)', async () => {
    const { cookies } = await createUserAndLogin();

    const response = await submitKyc(cookies, validBody()).expect(201);

    expect(response.body.status).toBe('APPROVED');
    const approvedAt = response.body.approvedAt as string;
    expect(typeof approvedAt).toBe('string');
    expect(Number.isNaN(Date.parse(approvedAt))).toBe(false);
  });

  it('GET /kyc/me devolve APPROVED com CPF mascarado', async () => {
    const { cookies } = await createUserAndLogin();
    await submitKyc(cookies, validBody()).expect(201);

    const response = await request(server)
      .get('/kyc/me')
      .set('Cookie', cookieHeader(cookies))
      .expect(200);

    expect(response.body.status).toBe('APPROVED');
    expect(response.body.maskedCpf).toMatch(/^\*\*\*\.\*\*\*\.\*\*-\d{2}$/);
  });

  it('POST /kyc de novo para o mesmo usuário responde 409 KYC_ALREADY_APPROVED', async () => {
    const { cookies } = await createUserAndLogin();
    await submitKyc(cookies, validBody()).expect(201);

    const response = await submitKyc(cookies, validBody()).expect(409);

    expect(response.body.code).toBe('KYC_ALREADY_APPROVED');
  });

  it('CPF inválido responde 422 INVALID_CPF e persiste REJECTED', async () => {
    const { cookies } = await createUserAndLogin();

    const submit = await submitKyc(
      cookies,
      validBody({ cpf: '000.000.000-00' }),
    ).expect(422);
    expect(submit.body.code).toBe('INVALID_CPF');

    const status = await request(server)
      .get('/kyc/me')
      .set('Cookie', cookieHeader(cookies))
      .expect(200);
    expect(status.body.status).toBe('REJECTED');
    expect(status.body.rejectionReason).toBe('INVALID_CPF');
  });

  it('menor de idade responde 422 UNDERAGE', async () => {
    const { cookies } = await createUserAndLogin();

    const response = await submitKyc(
      cookies,
      validBody({ birthDate: '2020-01-01' }),
    ).expect(422);

    expect(response.body.code).toBe('UNDERAGE');
  });

  it('segundo usuário com o mesmo CPF de uma conta aprovada responde 409 CPF_ALREADY_IN_USE', async () => {
    const sharedCpf = generateValidCpf();
    const first = await createUserAndLogin();
    await submitKyc(first.cookies, validBody({ cpf: sharedCpf })).expect(201);

    const second = await createUserAndLogin();
    const response = await submitKyc(
      second.cookies,
      validBody({ cpf: sharedCpf }),
    ).expect(409);

    expect(response.body.code).toBe('CPF_ALREADY_IN_USE');
  });

  it('POST /kyc sem X-CSRF-Token responde 403', async () => {
    const { cookies } = await createUserAndLogin();

    await request(server)
      .post('/kyc')
      .set('Cookie', cookieHeader(cookies))
      .send(validBody())
      .expect(403);
  });

  it('POST /kyc sem cookie de sessão responde 401', async () => {
    await request(server).post('/kyc').send(validBody()).expect(401);
  });

  it('GET /kyc/me de usuário que nunca submeteu responde NOT_SUBMITTED', async () => {
    const { cookies } = await createUserAndLogin();

    const response = await request(server)
      .get('/kyc/me')
      .set('Cookie', cookieHeader(cookies))
      .expect(200);

    expect(response.body).toEqual({ status: 'NOT_SUBMITTED' });
  });
});
