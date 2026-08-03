import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Pool } from 'pg';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import {
  READ_POOL_TOKEN,
  WRITE_POOL_TOKEN,
} from '@/infrastructure/database/database.token';
import { IdentityModule } from '@/modules/identity/identity.module';
import { DomainErrorFilter } from '@/infrastructure/http/domain-error.filter';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '@/modules/identity/presentation/session-cookies';

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

describe('IdentityController — autenticação (integração)', () => {
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
        IdentityModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<App>();
    app.use(cookieParser());
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

    email = `login-controller-${Date.now()}@example.com`;
    const registerResponse = await request(server)
      .post('/auth/register')
      .send({
        name: 'Ada Lovelace',
        email,
        password: PASSWORD,
        termsAccepted: true,
      })
      .expect(201);
    userId = registerResponse.body.userId as string;

    await waitForReplica(userId);
  }, 30_000);

  afterAll(async () => {
    await writePool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await writePool.query('DELETE FROM users WHERE id = $1', [userId]);
    await writePool.end();
    await readPool.end();
    // Os pools do DatabaseModule não têm hook de shutdown — encerra manualmente
    // para o Jest não ficar com handles abertos.
    await app.get<Pool>(WRITE_POOL_TOKEN).end();
    await app.get<Pool>(READ_POOL_TOKEN).end();
    await app.close();
  });

  afterEach(async () => {
    await writePool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    // LOG-006: sem isso, as tentativas falhas de um teste vazam pro próximo e
    // podem acionar o bloqueio de tentativas em testes que esperam login OK.
    await writePool.query('DELETE FROM login_attempts WHERE email = $1', [
      email,
    ]);
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

  describe('POST /auth/login', () => {
    it('autentica com credenciais válidas e retorna os dados do usuário', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      expect(response.body).toEqual({
        userId,
        name: 'Ada Lovelace',
        email,
        status: 'PENDING_EMAIL_VERIFICATION',
      });
    });

    it('define __Host-session (httpOnly) e __Host-csrf (não-httpOnly)', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      const cookies = parseSetCookie(
        response.headers['set-cookie'] as unknown as string[],
      );
      const sessionCookie = cookies.raw.find((c) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`),
      )!;
      const csrfCookie = cookies.raw.find((c) =>
        c.startsWith(`${CSRF_COOKIE_NAME}=`),
      )!;

      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/Secure/i);
      expect(sessionCookie).toMatch(/SameSite=Strict/i);
      expect(csrfCookie).not.toMatch(/HttpOnly/i);
      expect(csrfCookie).toMatch(/Secure/i);
    });

    it('persiste a sessão criada no banco', async () => {
      await login();

      const { rows } = await writePool.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM sessions WHERE user_id = $1',
        [userId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].revoked_at).toBeNull();
    });

    it('rejeita com 401 e mensagem genérica quando o email não existe', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email: `ghost-${Date.now()}@example.com`, password: PASSWORD })
        .expect(401);

      expect(response.body).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    });

    it('rejeita com 401 e mensagem genérica quando a senha está incorreta', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email, password: 'Wr0ng!Pass' })
        .expect(401);

      expect(response.body).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    });

    it('LOG-003: resposta de email inexistente é indistinguível da de senha errada', async () => {
      const unknownEmail = await request(server)
        .post('/auth/login')
        .send({ email: `ghost-${Date.now()}@example.com`, password: PASSWORD });
      const wrongPassword = await request(server)
        .post('/auth/login')
        .send({ email, password: 'Wr0ng!Pass' });

      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('não define cookie de sessão quando as credenciais são inválidas', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email, password: 'Wr0ng!Pass' })
        .expect(401);

      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('não cria sessão no banco quando as credenciais são inválidas', async () => {
      await request(server)
        .post('/auth/login')
        .send({ email, password: 'Wr0ng!Pass' })
        .expect(401);

      const { rowCount } = await writePool.query(
        'SELECT 1 FROM sessions WHERE user_id = $1',
        [userId],
      );

      expect(rowCount).toBe(0);
    });

    it('responde 403 ACCOUNT_SUSPENDED quando a conta está suspensa', async () => {
      await writePool.query(
        `UPDATE users SET status = 'SUSPENDED' WHERE id = $1`,
        [userId],
      );

      try {
        const response = await request(server)
          .post('/auth/login')
          .send({ email, password: PASSWORD })
          .expect(403);

        expect(response.body).toEqual({
          code: 'ACCOUNT_SUSPENDED',
          message: 'This account has been suspended',
        });
        expect(response.body.message).not.toContain(userId);
      } finally {
        await writePool.query(
          `UPDATE users SET status = 'PENDING_EMAIL_VERIFICATION' WHERE id = $1`,
          [userId],
        );
      }
    });

    it('responde 422 INVALID_EMAIL quando o formato do email é inválido', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email: 'not-an-email', password: PASSWORD })
        .expect(422);

      expect(response.body.code).toBe('INVALID_EMAIL');
    });

    describe('LOG-006 — bloqueio por excesso de tentativas', () => {
      it('responde 429 TOO_MANY_LOGIN_ATTEMPTS após 5 falhas, mesmo com a senha correta na 6ª tentativa', async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await request(server)
            .post('/auth/login')
            .send({ email, password: 'Wr0ng!Pass' })
            .expect(401);
        }

        const response = await request(server)
          .post('/auth/login')
          .send({ email, password: PASSWORD })
          .expect(429);

        expect(response.body).toEqual({
          code: 'TOO_MANY_LOGIN_ATTEMPTS',
          message: 'Too many failed login attempts. Try again later.',
        });
      });

      it('não cria sessão quando bloqueado, mesmo com credenciais corretas', async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await request(server)
            .post('/auth/login')
            .send({ email, password: 'Wr0ng!Pass' })
            .expect(401);
        }

        await request(server)
          .post('/auth/login')
          .send({ email, password: PASSWORD })
          .expect(429);

        const { rowCount } = await writePool.query(
          'SELECT 1 FROM sessions WHERE user_id = $1',
          [userId],
        );
        expect(rowCount).toBe(0);
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('revoga a sessão atual e limpa os cookies', async () => {
      const cookies = await login();

      const response = await request(server)
        .post('/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .expect(204);

      const { rows } = await writePool.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM sessions WHERE user_id = $1',
        [userId],
      );
      expect(rows[0].revoked_at).not.toBeNull();

      const cleared = response.headers['set-cookie'] as unknown as string[];
      expect(
        cleared.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=;`)),
      ).toBe(true);
      expect(cleared.some((c) => c.startsWith(`${CSRF_COOKIE_NAME}=;`))).toBe(
        true,
      );
    });

    it('OUT-001: responde 204 sem cookie de sessão', async () => {
      await request(server).post('/auth/logout').expect(204);
    });

    it('OUT-003: responde 204 quando a sessão já foi revogada', async () => {
      const cookies = await login();

      await request(server)
        .post('/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .expect(204);
      await request(server)
        .post('/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .expect(204);
    });

    it('responde 204 com token de sessão desconhecido', async () => {
      await request(server)
        .post('/auth/logout')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${'f'.repeat(64)}`)
        .expect(204);
    });

    it('não exige header X-CSRF-Token (rota sem guard)', async () => {
      const cookies = await login();

      await request(server)
        .post('/auth/logout')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${cookies.session}`)
        .expect(204);
    });
  });

  describe('POST /auth/logout-all', () => {
    it('revoga todas as sessões ativas do usuário', async () => {
      const first = await login();
      await login();

      await request(server)
        .post('/auth/logout-all')
        .set('Cookie', cookieHeader(first))
        .set('X-CSRF-Token', first.csrf!)
        .expect(204);

      const { rowCount } = await writePool.query(
        'SELECT 1 FROM sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      expect(rowCount).toBe(0);
    });

    it('responde 401 sem sessão válida', async () => {
      await request(server).post('/auth/logout-all').expect(401);
    });

    it('responde 403 quando o header X-CSRF-Token não bate com o cookie', async () => {
      const cookies = await login();

      await request(server)
        .post('/auth/logout-all')
        .set('Cookie', cookieHeader(cookies))
        .set('X-CSRF-Token', 'wrong-csrf-token')
        .expect(403);
    });
  });

  describe('GET /auth/me', () => {
    it('retorna os dados do usuário autenticado', async () => {
      const cookies = await login();

      const response = await request(server)
        .get('/auth/me')
        .set('Cookie', cookieHeader(cookies))
        .expect(200);

      expect(response.body).toEqual({
        id: userId,
        name: 'Ada Lovelace',
        email,
        status: 'PENDING_EMAIL_VERIFICATION',
      });
    });

    it('responde 401 sem cookie de sessão', async () => {
      await request(server).get('/auth/me').expect(401);
    });

    it('responde 401 depois do logout', async () => {
      const cookies = await login();
      await request(server)
        .post('/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .expect(204);

      await request(server)
        .get('/auth/me')
        .set('Cookie', cookieHeader(cookies))
        .expect(401);
    });
  });
});
