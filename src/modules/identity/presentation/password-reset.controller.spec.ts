import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Pool } from 'pg';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { ThrottlerStorage } from '@nestjs/throttler';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import {
  READ_POOL_TOKEN,
  WRITE_POOL_TOKEN,
} from '@/infrastructure/database/database.token';
import { IdentityModule } from '@/modules/identity/identity.module';
import { DomainErrorFilter } from '@/infrastructure/http/domain-error.filter';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '@/modules/identity/presentation/session-cookies';

const PASSWORD = 'Str0ng!Pass';
const NEW_PASSWORD = 'N3w!Str0ngPass';
const NEUTRAL_MESSAGE =
  'Se existir uma conta para este e-mail, enviamos um link de redefinição.';

/**
 * Fake do EmailService que captura o token em claro do último
 * sendPasswordReset — é a única forma de um teste e2e obter o token, já que só
 * o hash é persistido.
 */
class CapturingEmailService extends EmailService {
  lastToken: string | null = null;
  lastTo: string | null = null;
  callCount = 0;

  sendVerification(): Promise<void> {
    return Promise.resolve();
  }

  sendPasswordReset(params: {
    to: string;
    name: string;
    token: string;
  }): Promise<void> {
    this.lastToken = params.token;
    this.lastTo = params.to;
    this.callCount += 1;
    return Promise.resolve();
  }

  reset(): void {
    this.lastToken = null;
    this.lastTo = null;
    this.callCount = 0;
  }
}

function readCookie(
  header: string[] | undefined,
  name: string,
): string | undefined {
  const entry = (header ?? []).find((c) => c.startsWith(`${name}=`));
  if (!entry) return undefined;
  const value = entry.split(';')[0].slice(name.length + 1);
  return value === '' ? undefined : value;
}

describe('IdentityController — recuperação de senha (integração)', () => {
  let app: INestApplication<App>;
  let server: App;
  let writePool: Pool;
  let email: string;
  let userId: string;
  const emailService = new CapturingEmailService();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        IdentityModule,
      ],
    })
      .overrideProvider(EmailService)
      .useValue(emailService)
      .compile();

    app = moduleRef.createNestApplication<App>();
    app.use(cookieParser());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
    server = app.getHttpServer();

    writePool = new Pool({
      database: process.env.DB_NAME ?? 'mybitcoin',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      host: process.env.DB_WRITE_HOST ?? 'localhost',
      port: Number(process.env.DB_WRITE_PORT ?? 5432),
    });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
    await writePool.end();
    await app.get<Pool>(WRITE_POOL_TOKEN).end();
    await app.get<Pool>(READ_POOL_TOKEN).end();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    if (!userId) return;
    await writePool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [userId],
    );
    await writePool.query(
      'DELETE FROM password_reset_requests WHERE email = $1',
      [email],
    );
    await writePool.query('DELETE FROM login_attempts WHERE email = $1', [
      email,
    ]);
    await writePool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await writePool.query('DELETE FROM users WHERE id = $1', [userId]);
  }

  function clearThrottler(): void {
    try {
      const storage = app.get<ThrottlerStorage>(ThrottlerStorage);
      const map = (storage as unknown as { storage?: Map<string, unknown> })
        .storage;
      map?.clear();
    } catch {
      /* storage não acessível — o teste de throttle não depende disso */
    }
  }

  beforeEach(async () => {
    clearThrottler();
    emailService.reset();
    await cleanup();

    email = `pwd-reset-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const res = await request(server)
      .post('/auth/register')
      .send({
        name: 'Ada Lovelace',
        email,
        password: PASSWORD,
        termsAccepted: true,
      })
      .expect(201);
    userId = res.body.userId as string;
  });

  function requestReset(targetEmail = email): request.Test {
    return request(server)
      .post('/auth/forgot-password')
      .send({ email: targetEmail });
  }

  async function issuedToken(): Promise<string> {
    await requestReset().expect(202);
    if (!emailService.lastToken) throw new Error('nenhum token capturado');
    return emailService.lastToken;
  }

  describe('POST /auth/forgot-password', () => {
    it('LOG-003: resposta é idêntica para e-mail existente e inexistente', async () => {
      const existing = await requestReset(email).expect(202);
      const unknown = await requestReset(
        `ghost-${Date.now()}@example.com`,
      ).expect(202);

      expect(existing.body).toEqual({ message: NEUTRAL_MESSAGE });
      expect(unknown.body).toEqual({ message: NEUTRAL_MESSAGE });
    });

    it('não envia e-mail para conta inexistente', async () => {
      await requestReset(`ghost-${Date.now()}@example.com`).expect(202);
      expect(emailService.callCount).toBe(0);
    });

    it('422 INVALID_EMAIL quando o formato é inválido', async () => {
      const res = await requestReset('not-an-email').expect(422);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });

    it('REC-002: novo pedido invalida o token anterior', async () => {
      const first = await issuedToken();
      emailService.reset();
      const second = await issuedToken();

      expect(second).not.toBe(first);

      await request(server)
        .post('/auth/reset-password')
        .send({ token: first, password: NEW_PASSWORD })
        .expect(422);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('fluxo feliz: troca a senha, invalida a senha antiga e as sessões', async () => {
      const preLogin = await request(server)
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      const oldSession = readCookie(
        preLogin.headers['set-cookie'] as unknown as string[],
        SESSION_COOKIE_NAME,
      );
      const oldCsrf = readCookie(
        preLogin.headers['set-cookie'] as unknown as string[],
        CSRF_COOKIE_NAME,
      );

      const token = await issuedToken();

      await request(server)
        .post('/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);

      // REC-006: sessão anterior morta
      await request(server)
        .get('/auth/me')
        .set(
          'Cookie',
          `${SESSION_COOKIE_NAME}=${oldSession}; ${CSRF_COOKIE_NAME}=${oldCsrf}`,
        )
        .expect(401);

      // senha antiga não vale mais
      await request(server)
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(401);

      // senha nova funciona
      await request(server)
        .post('/auth/login')
        .send({ email, password: NEW_PASSWORD })
        .expect(200);
    });

    it('REC-004: token consumido não pode ser reutilizado', async () => {
      const token = await issuedToken();

      await request(server)
        .post('/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);

      const res = await request(server)
        .post('/auth/reset-password')
        .send({ token, password: 'An0ther!Pass' })
        .expect(422);
      expect(res.body.code).toBe('INVALID_RESET_TOKEN');
    });

    it('REC-003: token expirado é recusado', async () => {
      const token = await issuedToken();
      await writePool.query(
        `UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1`,
        [userId],
      );

      const res = await request(server)
        .post('/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(422);
      expect(res.body.code).toBe('INVALID_RESET_TOKEN');
    });

    it('token desconhecido → 422 INVALID_RESET_TOKEN', async () => {
      const res = await request(server)
        .post('/auth/reset-password')
        .send({ token: 'deadbeef'.repeat(8), password: NEW_PASSWORD })
        .expect(422);
      expect(res.body.code).toBe('INVALID_RESET_TOKEN');
    });

    it('REC-005: senha fora da política → 422 (WEAK_PASSWORD ou validação do DTO)', async () => {
      const token = await issuedToken();
      const res = await request(server)
        .post('/auth/reset-password')
        .send({ token, password: 'weak' })
        .expect(422);
      // A validação do DTO (ValidationPipe) ou o VO Password barram — ambos 422.
      expect(res.status).toBe(422);
    });

    it('GAP-1: redefinir a senha limpa o bloqueio de LOG-006', async () => {
      // 5 falhas → bloqueado
      for (let i = 0; i < 5; i += 1) {
        await request(server)
          .post('/auth/login')
          .send({ email, password: 'Wr0ng!Pass' });
      }
      await request(server)
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(429);

      const token = await issuedToken();
      await request(server)
        .post('/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);

      // login com a senha nova funciona imediatamente, sem esperar a janela
      await request(server)
        .post('/auth/login')
        .send({ email, password: NEW_PASSWORD })
        .expect(200);
    });
  });
});
