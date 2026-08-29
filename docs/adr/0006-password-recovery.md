# ADR 0006 — Identity: Recuperação de Senha

**Status:** Aceito
**Data:** 2026-08-28
**Autores:** Time de Backend
**Contexto relacionado:** ADR 0001 (UnitOfWork), ADR 0002 (Cadastro), ADR 0004 (Transporte de Sessão via Cookie), ADR 0005 (Login e Logout)
**Gerado por:** skill `/adr-architect`

---

## Contexto

O bounded context `identity` tem hoje Cadastro (ADR 0002), Sessões (ADR 0004) e Login/Logout (ADR 0005) implementados. `docs/bussiness/02-identidade-e-acesso.md` seção 4 define **Recuperação de Senha** (REC-001 a REC-006) — não implementada. Não há hoje nenhuma forma de um usuário que esqueceu a senha voltar a acessar a conta.

Descobertas de código que moldam o escopo:

1. **`EmailService` é um stub no-op.** `src/modules/identity/domain/services/email.service.ts` só declara `sendVerification`; a implementação em `identity.module.ts` resolve com `Promise.resolve()`. O envio real de e-mail não existe e continua fora de escopo — este ADR adiciona o **contrato** `sendPasswordReset` e mantém a implementação stub, igual ao que ADR 0002 fez para verificação.
2. **`SessionRevokedReason` já prevê `'password_reset'`** (`domain/events/session-revoked.event.ts`) e `RevokeAllSessions` (`application/revoke-all-sessions.usecase.ts`) já aceita esse motivo — o gancho para REC-006 já existe.
3. **O `UnitOfWork` atual é acoplado a `financial`.** `src/shared/unit-of-work.ts` fixa `Repositories = { transactionRepo, ledgerRepo }` (decisão consciente do ADR 0001: interface fixa, sem genérico). O redeem de senha escreve em `users` + `password_reset_tokens` + `sessions` e precisa de atomicidade — exige um UnitOfWork próprio do módulo `identity`.
4. **`saveUserQuery` não atualiza `password_hash`.** O `ON CONFLICT (id) DO UPDATE` em `infrastructure/persistence/user.sql.ts` só toca `name`, `status`, `email_verified`, `updated_at`. Precisa passar a atualizar `password_hash`.
5. **Não há biblioteca de rate-limit no projeto.** LOG-006 (bloqueio de login) é feito por tabela (`login_attempts`) + query derivada, sem contador mutável.

---

## Forças em Jogo

- **REC-001..006** são lei do domínio: solicitação por e-mail, token único, com expiração, uso único, nova senha respeitando a política, sessões revogadas após redefinição.
- **Não vazar existência de conta** (mesma força de LOG-003): a solicitação precisa responder de forma neutra e com timing parecido para e-mail existente e inexistente.
- **Atomicidade** (ADR 0001): o redeem toca 3 tabelas; falha parcial deixaria senha trocada sem revogar sessões, ou token consumido sem trocar senha.
- **Custo de e-mail / abuso:** o endpoint de solicitação dispara e-mail e não exige autenticação — alvo natural de spam e de enumeração por timing.
- **Clean Architecture:** a composição da URL do link (infra de e-mail) não pode vazar para o use case (domínio/aplicação).
- **Segredo em repouso:** o token não pode ser armazenado em claro (mesma força das sessões — `sessions` guarda `token_hash`).

---

## Decisão

Dois endpoints públicos (sem `SessionAuthGuard`) no `IdentityController`:

| Método | Rota | Efeito |
|--------|------|--------|
| `POST` | `/auth/forgot-password` | Solicita recuperação. **Sempre** responde `202 Accepted` com corpo neutro. |
| `POST` | `/auth/reset-password` | Redefine a senha com `token` + nova senha. `204 No Content` em sucesso. |

### Token

- Gerado como `randomBytes(32).toString('hex')` (32 bytes de entropia), igual ao token de sessão.
- **Só o hash é persistido**: `token_hash = sha256(token)` em hex. Lookup por `token_hash`.
- TTL de **30 minutos** (`PASSWORD_RESET_TTL_MS`, constante na entidade).
- **Uso único** (REC-004): coluna `consumed_at`. Ao redimir, seta `consumed_at = NOW()`.
- **Token único por usuário** (REC-002): ao gerar um novo token, todos os tokens ativos (`consumed_at IS NULL`) do mesmo usuário são marcados como consumidos antes de inserir o novo.
- O token viaja no e-mail como parte da URL montada pela **implementação de infraestrutura** do `EmailService`: `${PASSWORD_RESET_URL}?token=<token>`. `PASSWORD_RESET_URL` é uma **nova variável de ambiente**.

### Fluxo `POST /auth/forgot-password`

```
1. ThrottlerGuard por IP (10 req/min) — 429 se exceder.
2. Email.create(dto.email) — formato inválido → InvalidEmailError (422).
3. Registra a solicitação em password_reset_requests (email normalizado, ip, user_found).
4. Rate-limit por e-mail: se houve > 3 solicitações para este e-mail nos últimos 15 min
   → log 'password_reset.request.throttled' e RETORNA neutro (nenhum e-mail, nenhum token).
5. userRepo.findByEmail(email):
   - null            → log 'password_reset.request.no_account', RETORNA neutro.
   - status SUSPENDED → log 'password_reset.request.suspended', RETORNA neutro.
   - PENDING/ACTIVE   → segue.
6. IdentityUnitOfWork.run:
   - passwordResetTokenRepo.consumeAllActiveForUser(userId)
   - passwordResetTokenRepo.save(PasswordResetToken.issue({ userId, tokenHash }))
     // save = INSERT ... ON CONFLICT (user_id) WHERE consumed_at IS NULL DO NOTHING (GAP-4).
     // Se rowCount === 0 (corrida — outra tx já emitiu um token ativo), o repo lança
     // ActiveResetTokenExistsError → a transação faz ROLLBACK e o passo 7 NÃO envia e-mail
     // (o token deste request não foi persistido; o e-mail da outra tx já saiu).
7. emailService.sendPasswordReset({ to, name, token }).catch(log)   // só se o passo 6 teve sucesso; fire-and-forget, igual ao register
   // catch(ActiveResetTokenExistsError) → log 'password_reset.request.token_exists', pula para o passo 9
8. Log estruturado 'password_reset.request.completed' (userId | null, email).
9. Responde 202 { message: "Se existir uma conta para este e-mail, enviamos um link de redefinição." }
```

O corpo e o status são idênticos em todos os ramos do passo 5. O `catch` do envio de e-mail nunca altera a resposta. **Resíduo de timing conhecido e aceito** (GAP-3): o caminho de conta elegível executa 2 escritas em transação antes de responder, enquanto o caminho de conta inexistente/suspensa responde após 1 INSERT — há uma diferença de latência observável. Aceita como trade-off (ver Consequências), pelas mesmas razões pragmáticas do rate-limit in-memory; a mitigação completa (token fora do caminho de resposta) fica como evolução.

### Fluxo `POST /auth/reset-password`

```
1. ThrottlerGuard por IP (10 req/min) — 429 se exceder.
2. Password.create(dto.password) — valida a política (REC-005) → WeakPasswordError (422).
3. tokenHash = sha256(dto.token).
4. passwordResetTokenRepo.findByTokenHash(tokenHash):
   - null                          → InvalidResetTokenError (422)
   - !token.isRedeemable(now)       → InvalidResetTokenError (422)   // expirado OU consumido OU invalidado
5. userRepo.findById(token.userId):
   - null            → InvalidResetTokenError (422)                  // invariante quebrada, resposta genérica
   - status SUSPENDED → AccountSuspendedError (403)
6. newHash = bcrypt.hash(dto.password, 12)
7. IdentityUnitOfWork.run (repos: userRepo, sessionRepo, passwordResetTokenRepo, loginAttemptRepo):
   - user.changePassword(newHash);      userRepo.save(user)          // UPDATE users.password_hash + updated_at
   - token.consume(now);                passwordResetTokenRepo.consume(token)
   - activeSessions = sessionRepo.findActiveByUserId(user.id)
   - sessionRepo.revokeAll(user.id)                                  // REC-006
   - revokedSessionCount = activeSessions.length
   - loginAttemptRepo.record(LoginAttempt.create({ email, userId, ipAddress, successful: true }))
     // GAP-1: zera o contador de LOG-006 — a posse do e-mail comprovada pelo link é o
     //        sinal de "o dono legítimo está de volta". A linha fica na trilha de auditoria
     //        (successful=true) e é logada com operation 'password_reset.lockout_cleared'.
8. Emite um SessionRevoked(sessionId, userId, 'password_reset') por sessão em activeSessions
   e loga 'password_reset.completed' (userId, revokedSessionCount).
9. Limpa os cookies de sessão da resposta (clearSessionCookies) e responde 204.
```

> **Nota (GAP-2):** a revogação NÃO reusa o use case `RevokeAllSessions` porque este recebe um `SessionRepository` já injetado (fora da transação). O redeem replica a mesma lógica (`findActiveByUserId` → `revokeAll` → mapear eventos) usando o `sessionRepo` transacional do `IdentityUnitOfWork`. `SessionRepository.revokeAll` continua retornando `void`; a contagem vem de `activeSessions.length`. Apenas `SessionRevoked` é emitido — os eventos `PasswordResetRequested`/`PasswordResetCompleted` foram descartados (decisão rodada 3): sem event bus no projeto, o fato do reset é registrado por log estruturado; `SessionRevoked` é mantido porque o tipo já existe e `RevokeAllSessions` também o emite.

### Rate-limit / anti-abuso

Defesa em duas camadas (decisão do usuário — opções 1 e 3):

- **Por e-mail (regra de negócio):** tabela `password_reset_requests`, chave por e-mail normalizado, limite de **3 solicitações / 15 min** derivado por query (mesmo padrão de `login_attempts`, sem contador mutável). Registra **todas** as solicitações, inclusive e-mails inexistentes (`user_found = false`) — serve também de trilha de auditoria consultável via SQL.
- **Por IP (transporte):** `@nestjs/throttler` (`ThrottlerGuard`) em ambos os endpoints, **10 req/min por IP**. Nova dependência — `/dep-audit` deve ser rodado antes de instalar; fixar versão exata; é o pacote oficial da NestJS.

### `IdentityUnitOfWork` (evolução do ADR 0001)

O ADR 0001 escolheu conscientemente uma interface `Repositories` fixa e não-genérica. Mantemos essa filosofia, mas **por módulo**: cada módulo que precisa de atomicidade define seu próprio contrato fixo.

```typescript
// src/modules/identity/domain/identity-unit-of-work.ts
export interface IdentityRepositories {
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  passwordResetTokenRepo: PasswordResetTokenRepository;
  loginAttemptRepo: LoginAttemptRepository; // GAP-1: limpar lockout de LOG-006 no redeem
}

export abstract class IdentityUnitOfWork {
  abstract run<T>(fn: (repos: IdentityRepositories) => Promise<T>): Promise<T>;
}
```

Implementação `PgIdentityUnitOfWork` em `infrastructure/persistence/`, usando `DatabaseService.runInTransaction` (idêntico ao `PostgresUnitOfWork` de financial). O `src/shared/unit-of-work.ts` de financial **não é tocado**.

### Schema

```sql
-- Migration: create_password_reset_tokens_table
-- REC-001..004: token opaco de recuperação de senha, único por solicitação,
-- com expiração (30 min) e uso único. Só o hash sha256 é persistido — o token
-- em claro só existe no e-mail enviado ao usuário (mesmo padrão de sessions).
CREATE TABLE password_reset_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE CASCADE: token não tem valor de auditoria após a conta sumir;
  -- a trilha de auditoria fica em password_reset_requests.
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    CHAR(64) NOT NULL UNIQUE,          -- sha256(token) em hex
  requested_ip  INET NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  -- Uso único (REC-004). Também é setado quando um novo pedido invalida
  -- os tokens ativos anteriores do mesmo usuário (REC-002).
  consumed_at   TIMESTAMPTZ NULL
);

-- GAP-4: índice parcial ÚNICO — garante no máximo 1 token ativo por usuário
-- (REC-002) mesmo sob solicitações concorrentes. Serve também de índice para a
-- invalidação em lote no novo pedido. O INSERT de emissão usa
-- `ON CONFLICT (user_id) WHERE consumed_at IS NULL DO NOTHING`: em caso de corrida,
-- o segundo INSERT é no-op e o use case apenas loga 'password_reset.request.token_exists'.
CREATE UNIQUE INDEX idx_password_reset_tokens_active_by_user
  ON password_reset_tokens (user_id) WHERE consumed_at IS NULL;
```

```sql
-- Migration: create_password_reset_requests_table
-- Rate-limit por e-mail (3 / 15 min, derivado por query, sem contador mutável —
-- mesmo padrão de login_attempts) + trilha de auditoria de LOG-005/KYC-006.
-- Registra também e-mails inexistentes (user_found = false) para não criar um
-- canal lateral que revele existência de conta (LOG-003).
CREATE TABLE password_reset_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL,
  ip_address  INET NOT NULL,
  user_found  BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_requests_email_created_at
  ON password_reset_requests (email, created_at);
```

```sql
-- Migration: alter users save — password_hash passa a ser atualizável.
-- (Alteração na constante saveUserQuery em user.sql.ts, não uma migration de
--  schema — a coluna users.password_hash já existe.)
```

### Rationale

**Por que `IdentityUnitOfWork` próprio e não generalizar o `UnitOfWork` de financial?**
O ADR 0001 documenta explicitamente a rejeição do genérico ("Simple: no Map, no generic, no errors"). Generalizar agora reabriria essa decisão e acoplaria `identity` a `financial`. Um contrato fixo por módulo mantém a simplicidade e o isolamento entre bounded contexts.

**Por que não ativar a conta (PENDING → ACTIVE) no redeem?**
Decisão do usuário: reset de senha não é verificação de e-mail. A seção 6 resolverá a transição de status. Manter o escopo limitado.

**Por que resposta neutra só na solicitação e erro explícito no redeem?**
A tabela de edge cases da seção 4 manda "rejeitar operação" para token expirado/reutilizado e "resposta neutra" só para e-mail inexistente. No redeem, quem tem um token válido já provou posse do e-mail — não há o que proteger com neutralidade.

**Por que `InvalidResetTokenError` genérico (não distinguir expirado / consumido / inexistente)?**
Distinguir criaria um oráculo ("este token existiu") sem ganho de UX real. O frontend mostra a mesma tela "link inválido ou expirado, solicite um novo".

---

## Impacto nos Bounded Contexts (OBRIGATÓRIO)

| Bounded Context | Impacto | Como se comunica |
|-----------------|---------|------------------|
| account / identity | Todo o trabalho: 2 tabelas novas, entidade `PasswordResetToken`, `IdentityUnitOfWork`, 2 use cases, 2 endpoints, contrato `EmailService.sendPasswordReset`, `User.changePassword`, atualização de `saveUserQuery`. | — |
| financial | Nenhum. `src/shared/unit-of-work.ts` não é tocado. | — |
| bitcoin | Nenhum. | — |

**Entidades de domínio afetadas:** `PasswordResetToken` (nova), `PasswordResetRequest` (nova), `User` (novo método `changePassword`), `Session` (reuso de `revokeAll`/`findActiveByUserId`), `LoginAttempt` (reuso de `record` com `successful=true` para limpar lockout — GAP-1).
**Interfaces de repositório afetadas:** `PasswordResetTokenRepository` (nova), `PasswordResetRequestRepository` (nova), `IdentityUnitOfWork` (nova — inclui `loginAttemptRepo`), `UserRepository` (sem mudança de assinatura — muda o SQL de `save`), `LoginAttemptRepository` (sem mudança de assinatura — `record` reusado no redeem).
**Eventos de domínio:** apenas `SessionRevoked` com `reason: 'password_reset'` (reuso — tipo já existente). Os eventos `PasswordResetRequested`/`PasswordResetCompleted` foram descartados na rodada 3 (sem event bus no projeto, o fato é registrado por log estruturado).
**Migrations necessárias:** sim — `create_password_reset_tokens_table`, `create_password_reset_requests_table`.

---

## Checklist de Arquitetura (OBRIGATÓRIO)

- [x] Nenhum arquivo em `identity/domain/` importa de `identity/infrastructure/` ou `identity/presentation/` — a montagem da URL do link fica na impl de infra do `EmailService`; o use case só passa o token.
- [x] Valores monetários usam `BIGINT` / `bigint` — **não aplicável** (nenhum valor monetário neste fluxo).
- [x] Erros de domínio são subclasses de `DomainError` — `InvalidResetTokenError` (novo); reuso de `WeakPasswordError`, `AccountSuspendedError`, `InvalidEmailError`. Nenhum retorno booleano.
- [x] Operações multi-tabela usam UnitOfWork — `IdentityUnitOfWork` no redeem (users + password_reset_tokens + sessions + login_attempts) e na rotação de token da solicitação (consume + insert).
- [x] Entidades não recebem dependências de infraestrutura no construtor — `PasswordResetToken` é POJO de domínio; bcrypt e sha256 ficam na aplicação/infra.

---

## Plano de Implementação (OBRIGATÓRIO — na ordem)

### 1. Domínio (`src/modules/identity/domain/`)
- [ ] `entities/password-reset-token.entity.ts` — `PasswordResetToken` com `id`, `userId`, `tokenHash`, `requestedIp`, `createdAt`, `expiresAt`, `consumedAt`. Constante `PASSWORD_RESET_TTL_MS = 30*60*1000`. Métodos: `isRedeemable(now = new Date()): boolean` (`consumedAt === null && now <= expiresAt`), `consume(now = new Date()): void` (idempotente, igual a `Session.revoke`). Estáticos: `issue({ userId, tokenHash, requestedIp })`, `reconstitute({...})`.
- [ ] `errors/invalid-reset-token.error.ts` — `InvalidResetTokenError extends DomainError`, `code = 'INVALID_RESET_TOKEN'`, mensagem **estática** `'Invalid or expired password reset token'`.
- [ ] `errors/active-reset-token-exists.error.ts` — `ActiveResetTokenExistsError extends DomainError`, `code = 'ACTIVE_RESET_TOKEN_EXISTS'`. **Interno** — nunca chega ao cliente; `RequestPasswordReset` captura e responde neutro (GAP-4).
- [ ] `entities/password-reset-request.entity.ts` — `PasswordResetRequest` com `email`, `ipAddress`, `userFound`, `createdAt`. Estático `record({ email, ipAddress, userFound })`.
- [ ] `repositories/password-reset-token.repository.ts` — abstract `PasswordResetTokenRepository`: `save(token): Promise<void>` (INSERT idempotente — no-op se já existe token ativo do usuário, GAP-4), `consume(token): Promise<void>` (marca `consumed_at` por `id`, usado no redeem), `findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>`, `consumeAllActiveForUser(userId: string): Promise<void>`.
- [ ] `repositories/password-reset-request.repository.ts` — abstract `PasswordResetRequestRepository`: `record(request): Promise<void>`, `countSince(email: string, since: Date): Promise<number>`.
- [ ] `identity-unit-of-work.ts` — `IdentityRepositories` (`userRepo`, `sessionRepo`, `passwordResetTokenRepo`, `loginAttemptRepo`) + `IdentityUnitOfWork` abstract.
- [ ] `repositories/index.ts` — reexportar as novas abstracts.
- [ ] `entities/user.entity.ts` — método `changePassword(newHash: string): void` (muta `_passwordHash`; `updated_at` é responsabilidade do repositório, igual ao padrão de `Session`).
- [ ] `services/email.service.ts` — adicionar `abstract sendPasswordReset(params: { to: string; name: string; token: string }): Promise<void>`.

### 2. Aplicação (`src/modules/identity/application/`)
- [ ] `request-password-reset.usecase.ts` — `RequestPasswordReset`. Deps: `UserRepository`, `PasswordResetRequestRepository`, `IdentityUnitOfWork`, `EmailService`, `generateToken: () => string`, `hashToken: (t: string) => string`, `clock?: () => Date`. Implementa o fluxo de 9 passos. Retorna `void`. Rate-limit: `countSince(email, now - 15min) > 3`.
- [ ] `confirm-password-reset.usecase.ts` — `ConfirmPasswordReset`. Deps: `PasswordResetTokenRepository`, `UserRepository`, `IdentityUnitOfWork`, `hashToken`, `hashPassword: (plain) => Promise<string>`, `clock?`. Implementa o fluxo de 9 passos. Retorna `{ revokedSessionCount: number; events: SessionRevoked[] }`. Chama `Password.create` para validar a política antes de qualquer I/O. Dentro do `uow.run`: `changePassword`+`save`, `token.consume`+`consume`, `findActiveByUserId`→`revokeAll`, e `loginAttemptRepo.record(LoginAttempt.create({ email, userId, ipAddress, successful: true }))` (GAP-1). Emite `SessionRevoked(_, _, 'password_reset')` por sessão ativa.
- [ ] `dtos/` — inputs/outputs dos dois use cases se o padrão do módulo exigir arquivo separado (seguir `register-user.usecase.input.ts`).

### 3. Infraestrutura (`src/modules/identity/infrastructure/`)
- [ ] `migrations/<ts>_create_password_reset_tokens_table.sql` — conforme Schema.
- [ ] `migrations/<ts>_create_password_reset_requests_table.sql` — conforme Schema.
- [ ] `persistence/password-reset-token.sql.ts` — `insertPasswordResetTokenQuery` (`INSERT ... ON CONFLICT (user_id) WHERE consumed_at IS NULL DO NOTHING` — GAP-4), `consumePasswordResetTokenByIdQuery(id)` (`UPDATE ... SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL`), `findPasswordResetTokenByHashQuery`, `consumeActivePasswordResetTokensQuery(userId)` (`UPDATE ... SET consumed_at = NOW() WHERE user_id = $1 AND consumed_at IS NULL`).
- [ ] `persistence/password-reset-token.mapper.ts` — row ↔ `PasswordResetToken`.
- [ ] `persistence/pg-password-reset-token.repository.ts` — `PgPasswordResetTokenRepository extends PasswordResetTokenRepository`, recebe `QueryExecutor`. `save` executa o INSERT `... ON CONFLICT (user_id) WHERE consumed_at IS NULL DO NOTHING`; se `result.rowCount === 0` lança `ActiveResetTokenExistsError` (não retorna boolean — segue a convenção de erro tipado).
- [ ] `persistence/password-reset-request.sql.ts` — `recordPasswordResetRequestQuery`, `countPasswordResetRequestsSinceQuery(email, since)`.
- [ ] `persistence/pg-password-reset-request.repository.ts` — `PgPasswordResetRequestRepository`.
- [ ] `persistence/pg-identity-unit-of-work.ts` — `PgIdentityUnitOfWork extends IdentityUnitOfWork`, usa `DatabaseService.runInTransaction`, monta `{ userRepo: new PgUserRepository(tx), sessionRepo: new PgSessionRepository(tx), passwordResetTokenRepo: new PgPasswordResetTokenRepository(tx), loginAttemptRepo: new PgLoginAttemptRepository(tx) }`.
- [ ] `persistence/user.sql.ts` — adicionar `password_hash = $4` e `updated_at = $10` (já existe) ao `ON CONFLICT DO UPDATE` de `saveUserQuery`.
- [ ] Impl de `EmailService` — mover o stub de `identity.module.ts` para uma classe `NoopEmailService` (ou manter inline) que agora também implementa `sendPasswordReset` e compõe `${config.get('PASSWORD_RESET_URL')}?token=${token}` (log em dev, no-op de envio).

### 4. Presentation (`src/modules/identity/presentation/`)
- [ ] `dto/forgot-password.dto.ts` — `{ email: string }` (`@IsEmail`).
- [ ] `dto/reset-password.dto.ts` — `{ token: string; password: string }` (`@IsString`, `@MinLength(8)` no password; validação forte fica no VO).
- [ ] `dto/forgot-password-response.dto.ts` — `{ message: string }` (corpo neutro).
- [ ] `identity.controller.ts` — `POST /auth/forgot-password` (`@HttpCode(202)`, `@UseGuards(ThrottlerGuard)` / `@Throttle`), `POST /auth/reset-password` (`@HttpCode(204)`, throttle, `clearSessionCookies` na resposta). Docs Swagger no padrão dos outros endpoints. Logs estruturados de sucesso/falha.
- [ ] `infrastructure/http/domain-error.filter.ts` — mapear `INVALID_RESET_TOKEN` → `422` (é o default, então opcional; adicionar comentário). `WEAK_PASSWORD` continua no default 422.
- [ ] `identity.module.ts` — providers das 2 repos, `IdentityUnitOfWork` → `PgIdentityUnitOfWork`, `RequestPasswordReset`, `ConfirmPasswordReset` (com `generateToken = () => randomBytes(32).toString('hex')`, `hashToken = (t) => createHash('sha256').update(t).digest('hex')`, `hashPassword` já existe via bcrypt). Importar `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])` (aqui ou no `AppModule`).
- [ ] `app.module.ts` — se o `ThrottlerModule` for global, registrar aqui.
- [ ] `.env.example` / `.env.test` — `PASSWORD_RESET_URL=http://localhost:5173/reset-password`.

### 5. Fora deste ADR (frontend — pipeline separado)
Rotas `/forgot-password` e `/reset-password?token=` no `mybitcoin-front`, link "Esqueci minha senha" na `login-page`, feedback de "todas as sessões foram encerradas" (REC-006).

---

## Edge Cases & Erros de Domínio (OBRIGATÓRIO)

| Caso | Erro de domínio | Comportamento decidido |
|------|-----------------|------------------------|
| e-mail inexistente (solicitação) | — | `202` neutro; `password_reset_requests` com `user_found = false`; nenhum e-mail |
| conta `SUSPENDED` (solicitação) | — | `202` neutro; nenhum e-mail; log `password_reset.request.suspended` |
| conta `PENDING_EMAIL_VERIFICATION` (solicitação) | — | Fluxo normal — pode recuperar senha (decisão do usuário) |
| e-mail com formato inválido (solicitação) | `InvalidEmailError` | `422` (mesmo tratamento do login) |
| > 3 solicitações / 15 min para o mesmo e-mail | — | `202` neutro; nenhum token; nenhum e-mail; log `password_reset.request.throttled` |
| > 10 req / min do mesmo IP | `ThrottlerException` | `429` |
| novo pedido com token anterior ainda válido | — | Tokens anteriores marcados `consumed_at = NOW()`; só o novo vale (REC-002) |
| 2 solicitações concorrentes para o mesmo usuário | `ActiveResetTokenExistsError` (interno) | Índice parcial `UNIQUE` garante 1 token ativo; o 2º INSERT é no-op, o repo lança o erro interno, `RequestPasswordReset` captura, não envia e-mail, responde `202` neutro (GAP-4) |
| token não encontrado (redeem) | `InvalidResetTokenError` | `422` |
| token expirado > 30 min (redeem) | `InvalidResetTokenError` | `422` |
| token já consumido / invalidado (redeem) | `InvalidResetTokenError` | `422` |
| usuário do token não existe mais (redeem) | `InvalidResetTokenError` | `422` (resposta genérica; invariante quebrada logada) |
| conta `SUSPENDED` (redeem) | `AccountSuspendedError` | `403` |
| nova senha fora da política (redeem) | `WeakPasswordError` | `422` — validado antes de qualquer I/O |
| nova senha igual à atual (redeem) | — | **Permitido** (decisão do usuário — não bloquear) |
| falha no envio do e-mail | — | Token permanece válido; conta intacta; usuário pode solicitar novo (invalida o anterior); erro logado |
| falha parcial no redeem (ex.: `revokeAll` lança) | — | `IdentityUnitOfWork` faz `ROLLBACK`; nada persistido (senha, token, sessões, lockout); `500` |
| usuário estava bloqueado por LOG-006 e faz o redeem | — | `LoginAttempt successful=true` gravado na transação zera o contador; login com a senha nova funciona de imediato (GAP-1) |
| redeem concluído com sucesso | — | Senha trocada; `consumed_at` setado; **todas** as sessões revogadas com motivo `password_reset` (REC-006); lockout de login limpo; cookies limpos; N×`SessionRevoked('password_reset')` emitidos + log `password_reset.completed` |
| redeem por usuário atualmente logado | — | A própria sessão do requester também é revogada; ele precisa logar de novo com a senha nova |

---

## Plano de Teste (OBRIGATÓRIO)

- [ ] **Unit — `PasswordResetToken`:** `issue` seta `expiresAt = createdAt + 30min` e `consumedAt = null`; `isRedeemable` true dentro da janela; false quando expirado; false quando `consumedAt` setado; `consume` é idempotente e seta `consumedAt` uma vez.
- [ ] **Unit — `User.changePassword`:** troca o `passwordHash`; não altera `id`/`email`/`status`.
- [ ] **Unit — `RequestPasswordReset`** (repos e UoW mockados):
  - e-mail existente ACTIVE → registra request (`user_found = true`), invalida tokens ativos, salva 1 token novo, chama `sendPasswordReset` com o token em claro, retorna void.
  - e-mail inexistente → registra request (`user_found = false`), **não** salva token, **não** chama e-mail, retorna void (sem lançar).
  - conta SUSPENDED → não salva token, não chama e-mail, retorna void.
  - 4ª solicitação em 15 min → não salva token, não chama e-mail (`countSince` mockado retornando 3).
  - formato de e-mail inválido → lança `InvalidEmailError`.
  - falha do `sendPasswordReset` → não propaga (use case retorna void), token permanece salvo.
  - `save` lança `ActiveResetTokenExistsError` (corrida) → use case captura, **não** chama e-mail, retorna void neutro (GAP-4).
- [ ] **Unit — `ConfirmPasswordReset`** (repos e UoW mockados):
  - token válido → `Password.create` ok, hash novo gerado, `uow.run` chamado, `userRepo.save` com hash novo, `passwordResetTokenRepo.consume`, `sessionRepo.findActiveByUserId` + `revokeAll(userId)`, `loginAttemptRepo.record` com `successful=true` (GAP-1), retorna `revokedSessionCount` correto + 1 `SessionRevoked('password_reset')` por sessão ativa (GAP-2).
  - senha fraca → lança `WeakPasswordError` **antes** de qualquer chamada a repo.
  - token inexistente / expirado / já consumido → `InvalidResetTokenError`.
  - conta SUSPENDED → `AccountSuspendedError`.
  - usuário sem sessões ativas → `revokedSessionCount === 0`, nenhum `SessionRevoked`, ainda grava o `LoginAttempt` de limpeza de lockout.
  - `sessionRepo.revokeAll` lança → erro propaga, `uow.run` rejeita (rollback garantido pela infra).
- [ ] **Integração (banco real) — `PgPasswordResetTokenRepository`:** `save` + `findByTokenHash` round-trip; `save` é no-op quando já existe token ativo do usuário (índice parcial `UNIQUE`, GAP-4); `consume` por id e `consumeAllActiveForUser` setam `consumed_at` só nos ativos; `UNIQUE(token_hash)` respeitado.
- [ ] **Integração — `PgPasswordResetRequestRepository`:** `record` + `countSince` contando só dentro da janela.
- [ ] **Integração — `PgIdentityUnitOfWork`:** callback que lança no meio → nenhuma das 4 tabelas alterada (users, password_reset_tokens, sessions, login_attempts) — rollback.
- [ ] **Integração (e2e do controller):**
  - `POST /auth/forgot-password` com e-mail existente e inexistente → **mesmo** status `202` e **mesmo** corpo.
  - Fluxo feliz completo: register → forgot-password → captura token (via spy do `EmailService`) → reset-password → login com senha antiga falha (`401`) → login com senha nova ok → sessão antiga (cookie pré-reset) rejeitada em `/auth/me` (`401`).
  - Lockout limpo (GAP-1): 5 logins falhos → `429 TOO_MANY_LOGIN_ATTEMPTS` → forgot-password → reset-password → login com a senha nova ok **imediatamente** (sem esperar a janela).
  - `reset-password` com token expirado (manipular `expires_at` no banco) → `422 INVALID_RESET_TOKEN`.
  - `reset-password` reusando token já consumido → `422`.
  - Throttle por IP: 11ª chamada em 1 min → `429`.
- [ ] **Regra de Dependência (GAP-5):** coberta pela Etapa 7 da pipeline (`/arch-guard`) — nenhum import de `infrastructure/`/`presentation/` em `application/` ou `domain/`.
- [ ] **Negativo / regressão:** rodar `pnpm test` completo — nenhuma regressão em Cadastro/Login/Logout/Sessões; `saveUserQuery` alterado não quebra `RegisterUser` nem `verifyEmail`.

---

## Fluxos

```
SOLICITAÇÃO
  Usuário informa e-mail em /forgot-password
  → 202 neutro (sempre)
  → [se conta elegível] token gerado, anteriores invalidados, e-mail com link enviado

REDEFINIÇÃO
  Usuário abre link do e-mail → frontend /reset-password?token=XXX
  → informa nova senha
  → POST /auth/reset-password { token, password }
  → política de senha validada
  → senha trocada + token consumido + TODAS as sessões revogadas  (atômico)
  → 204, cookies limpos
  → usuário faz login novamente com a senha nova
```

---

## Consequências

**Positivas:**
- REC-001..006 cobertos; usuário deixa de ficar permanentemente trancado fora da conta.
- `IdentityUnitOfWork` abre caminho para outras operações atômicas de `identity` (verificação de e-mail, MFA) sem tocar o UoW de financial.
- `password_reset_requests` dá trilha de auditoria SQL para o fluxo (LOG-005/KYC-006).
- Contrato `sendPasswordReset` deixa o envio real de e-mail plugável quando a infra de e-mail existir.

**Negativas / Trade-offs:**
- **Resíduo de timing (GAP-3):** `/auth/forgot-password` não tem timing perfeitamente constante — conta elegível faz 2 escritas em transação antes de responder; conta inexistente responde após 1 INSERT. É um oráculo fraco de existência de conta. Aceito conscientemente; mitigação completa (emitir token fora do caminho de resposta) fica como evolução.
- **`LoginAttempt` sintético (GAP-1):** o redeem grava uma linha `successful=true` em `login_attempts` que não corresponde a um login real, para zerar o contador de LOG-006. A linha é honesta enquanto trilha de auditoria (é logada com `operation: 'password_reset.lockout_cleared'`) mas infla a contagem de "logins bem-sucedidos" em relatórios ingênuos.
- Nova dependência `@nestjs/throttler` (mitigado: pacote oficial, `/dep-audit` antes de instalar, versão fixada).
- `EmailService` continua stub — em produção o fluxo não envia e-mail de verdade até a infra de e-mail ser implementada (mesma dívida do ADR 0002; registrada, não introduzida aqui).
- Rate-limit por IP é in-memory (single-instance). Com múltiplas instâncias, o limite efetivo multiplica pelo número de réplicas. Aceitável para o estágio atual; store distribuído fica como evolução.
- Dois padrões de UnitOfWork no código (shared/financial fixo + identity fixo por módulo) até uma eventual convergência.

---

## Decisões do Usuário (rastreabilidade)

> Confirmadas no grelhamento (Passo 2 da skill). Não são suposições do arquiteto.

- 2026-08-28 — TTL do token de reset? → **30 minutos**
- 2026-08-28 — Bloquear nova senha igual à anterior (REC-004 "opcionalmente bloquear")? → **Não bloquear**
- 2026-08-28 — Após redefinição, revogar sessões? → **Todas as sessões do usuário** (REC-006)
- 2026-08-28 — E-mail inexistente na solicitação? → **Resposta neutra**
- 2026-08-28 — Token de uso único? → **Sim**
- 2026-08-28 — Atomicidade do redeem (3 tabelas)? → **Estender UnitOfWork para o módulo identity**
- 2026-08-28 — Redeem ativa conta PENDING → ACTIVE? → **Não, mantém o status**
- 2026-08-28 — Quais status podem recuperar senha? → **PENDING e ACTIVE; SUSPENDED não**
- 2026-08-28 — Novo pedido invalida tokens anteriores? → **Sim, invalida os anteriores** (no máx. 1 token ativo por usuário)
- 2026-08-28 — Rotas dos endpoints? → **`/auth/forgot-password` e `/auth/reset-password`**
- 2026-08-28 — Proteção contra abuso da solicitação? → **Tabela de tentativas por e-mail (padrão `login_attempts`) + `@nestjs/throttler` por IP** (opções 1 e 3)
- 2026-08-28 — Como montar a URL do link? → **Nova env var `PASSWORD_RESET_URL`**
- 2026-08-28 — Auditoria do fluxo? → **Log estruturado + eventos de domínio** *(revisto na rodada 3 — ver abaixo)*
- 2026-08-28 — Escopo? → **API + Frontend** (frontend simples, 2 telas; frontend fora deste ADR, pipeline separado)

### Rodada 2 (pós-validação Estágio 2)

- 2026-08-28 — GAP-1: lockout de LOG-006 após reset bem-sucedido? → **Limpar o lockout no redeem** (`LoginAttempt successful=true` na transação)
- 2026-08-28 — GAP-3: neutralidade de timing no `/auth/forgot-password`? → **Aceitar e documentar o resíduo** (sem mitigação completa agora)
- 2026-08-28 — GAP-4: race de emissão de token concorrente? → **Corrigir** (índice parcial `UNIQUE` + `ON CONFLICT DO NOTHING`)
- 2026-08-28 — GAP-5: item de teste da Regra de Dependência? → **Corrigir** (referência ao `/arch-guard` no plano de teste)
- 2026-08-28 — GAP-2 (revogação de sessões subespecificada) → corrigido sem necessidade de decisão: `findActiveByUserId` → `revokeAll` → contar + emitir `SessionRevoked('password_reset')` por sessão.

### Rodada 4 (guards — Etapa 7)

- 2026-08-29 — arch-guard: use cases importam `Logger` de `@nestjs/common` (framework na camada application)? → **Manter** — segue o precedente já estabelecido no módulo (`register-user.usecase.ts`); `login`/`logout` não usam logger, mas a inconsistência é do módulo, não desta feature. Aceito conscientemente.
- 2026-08-29 — security-guard: `NoopEmailService` logava o token em claro → **Corrigido** — link só é logado quando `NODE_ENV !== 'production'`.
- 2026-08-29 — security-guard (obs): `updated_at` não avançava no reset → **Corrigido** — `saveUserQuery` passa a usar `updated_at = NOW()` no `ON CONFLICT DO UPDATE`.
- 2026-08-29 — code-reviewer: `execute()` dos use cases > 30 linhas → **Corrigido** — extraídos métodos privados (`issueToken`, `applyReset`, etc.); constantes nomeadas (`RESET_TOKEN_BYTES`, `PASSWORD_RESET_THROTTLE`, `sha256Hex`).
- 2026-08-29 — test-reviewer: lacunas de cobertura → **Corrigido** — +testes de `UNIQUE(token_hash)`, `consumeAllActiveForUser` com token pré-consumido, asserção positiva de `uow.run`, "nova senha = atual permitida", metadata do `ThrottlerGuard`.

### Rodada 3 (durante a implementação — Etapa 5.1)

- 2026-08-29 — "Pra que eventos?" → **Descartar `PasswordResetRequested` e `PasswordResetCompleted`.** O projeto não tem event bus/handlers; eventos de domínio hoje só são retornados e logados. O fato do reset passa a ser registrado apenas por **log estruturado** (`password_reset.request.completed`, `password_reset.completed`, `password_reset.lockout_cleared`). `SessionRevoked('password_reset')` é **mantido** porque o tipo já existe e `RevokeAllSessions` também o emite (consistência).

---

## Validação (Estágio 2) — 2026-08-28

**Veredito:** 🔁 **REVISAR** — 3 gaps MÉDIO, 2 BAIXO. Nenhum CRÍTICO/ALTO. As correções são pequenas (2–4 parágrafos + ajuste no plano).

> **Amendo 2026-08-28 (rodada 2):** todos os 5 gaps endereçados no corpo do ADR — GAP-1 e GAP-2 no fluxo do redeem + plano; GAP-3 aceito e documentado em Consequências/Trade-offs; GAP-4 no Schema (índice parcial `UNIQUE`) + repositório; GAP-5 no plano de teste. Pendente re-validação (`/adr-validator`).

### Checklist

| Item | Resultado | Evidência |
|------|-----------|-----------|
| A. Regra de Dependência | OK | URL do link fica na impl de infra do `EmailService`; use cases recebem `generateToken`/`hashToken`/`hashPassword` como função. Domínio não importa infra. |
| B. Modelagem de Domínio | OK (com ressalva) | `PasswordResetToken`/`PasswordResetRequest` como aggregates próprios (lifecycle separado, igual a `Session`). `InvalidResetTokenError` tipado. Ver GAP-2 sobre eventos `SessionRevoked`. |
| C. Precisão monetária | N/A | Fluxo não toca valor monetário. |
| D. Atomicidade (ADR 0001) | OK (com ressalva) | `IdentityUnitOfWork` cobre redeem (3 tabelas) e rotação de token. Rollback herdado de `DatabaseService.runInTransaction` (`database.service.ts:19-35`). Ver GAP-4 (race sem garantia de schema). |
| E. Schema | OK (com ressalva) | Consistente com `users` (`1720800000000_create_users_table.sql`) e `sessions`. Índices declarados. Ver GAP-4. |
| F. Edge cases e erros | OK (com ressalva) | Tabela de edge cases cobre inexistente/expirado/consumido/duplicado/suspenso. Ver GAP-1 (interação com lockout de login). |
| G. Plano de teste | OK (com ressalva) | Cobre integração com banco real e e2e. Falta item explícito do template G ("use case sem import de infra" — coberto por `/arch-guard`). |
| H. Plano de implementação | OK | Ordem domain → application → infrastructure → presentation correta e verificável passo a passo. |

### Gaps

| # | Severidade | Gap | Evidência | Correção exigida |
|---|-----------|-----|-----------|------------------|
| 1 | MÉDIO | O bloqueio de login por tentativas (LOG-006) **não é limpo** por uma redefinição de senha bem-sucedida. `LoginLockoutPolicy.isLocked` conta falhas desde o último **sucesso de login** (`login.usecase.ts:48-52`); reset não grava `login_attempts`. Um usuário que esqueceu a senha **e** está bloqueado redefine a senha e ainda assim não consegue logar por até 15 min. O edge case "Conta bloqueada → Impedir login" da seção 2 colide com o fluxo de recuperação. | `login.usecase.ts:47-54`, `1785780460632_create_login_attempts_table.sql`, `docs/bussiness/02-identidade-e-acesso.md` §2 (LOG-006) | Decidir e documentar: (a) `ConfirmPasswordReset` grava um `LoginAttempt` sintético `successful=true` (ou novo método `LoginAttemptRepository.clearLockout(email)`) dentro da transação do redeem, zerando o contador; ou (b) aceitar explicitamente que o lockout persiste (usuário espera a janela). Registrar como decisão do usuário. |
| 2 | MÉDIO | A revogação de sessões no redeem está **subespecificada e inconsistente** com o padrão do módulo. O fluxo (passo 7) chama `sessionRepo.revokeAll(userId)` direto, mas: (a) `SessionRepository.revokeAll` retorna `void` (`session.repository.ts:9`) — não há como obter o `revokedSessionCount` que `PasswordResetCompleted` (passo 8) exige; (b) não são emitidos os eventos `SessionRevoked` com `reason: 'password_reset'` — motivo que o codebase modelou **explicitamente** para este fluxo (`session-revoked.event.ts:1-4`) e que o use case `RevokeAllSessions` produz (`revoke-all-sessions.usecase.ts:24-33`). | `session.repository.ts:9`, `session-revoked.event.ts:1-4`, `revoke-all-sessions.usecase.ts` | Especificar no fluxo do redeem: dentro do `uow.run`, `const active = await sessionRepo.findActiveByUserId(userId); await sessionRepo.revokeAll(userId); const revokedSessionCount = active.length;` e emitir um `SessionRevoked(sessionId, userId, 'password_reset')` por sessão ativa, além do `PasswordResetCompleted`. Alinhar o plano de implementação (item 2) e o plano de teste. |
| 3 | MÉDIO | O ADR afirma nas Forças em Jogo "responder de forma neutra **e com timing parecido**", mas o design não entrega nem documenta o resíduo. Caminho de conta elegível: `consumeAllActiveForUser` + `save` (2 escritas em transação) + `sendPasswordReset` fire-and-forget. Caminho de conta inexistente/suspensa: retorno imediato após 1 INSERT. Diferença de latência observável = oráculo de existência de conta (a mesma classe de problema que LOG-003 fecha). | Seção "Forças em Jogo"; fluxo `/auth/forgot-password` passos 5–7 | Escolher: (a) mitigar — mover a geração/persistência do token para fora do caminho de resposta (ex.: `void this.issueToken(...)` sem `await`, resposta 202 imediata em todos os ramos); ou (b) aceitar e **documentar explicitamente** em Consequências → Trade-offs o resíduo de timing, como já foi feito para o rate-limit in-memory. Ajustar a redação das Forças para não prometer o que não entrega. |
| 4 | BAIXO | Race: duas solicitações concorrentes de `/auth/forgot-password` para o mesmo usuário podem ambas rodar `consumeAllActiveForUser` e depois `save`, resultando em 2 tokens ativos — contradiz "no máximo 1 token ativo por usuário" (REC-002). O índice `idx_password_reset_tokens_active_by_user` é **não-único**, então o schema não impede. Rate-limit (3/15min) e TTL curto mitigam parcialmente. | Schema `password_reset_tokens`; fluxo `/auth/forgot-password` passo 6 | Aceitar como risco residual documentado, **ou** tornar o índice parcial `UNIQUE (user_id) WHERE consumed_at IS NULL` e tratar `unique_violation` no repositório como "já há token ativo — reusar/ignorar". |
| 5 | BAIXO | Plano de teste não tem o item do template G ("teste/checagem de que o use case não importa de `infrastructure/`"). | Template `adr-validator` checklist G | Adicionar linha no Plano de Teste referenciando `/arch-guard` como o gate dessa verificação (ou aceitar como coberto pelo guard da Etapa 7 da pipeline). |

### Cobertura

- **OK:** 5 itens plenos (A, C-N/A, H) + 4 com ressalva menor (B, D, E, F, G).
- **GAP:** 3 MÉDIO (1, 2, 3), 2 BAIXO (4, 5).
- **N/A:** C (precisão monetária — fluxo não financeiro).

### Próximo passo

Rode `/adr-architect` para amendar o ADR endereçando GAP-1, GAP-2 e GAP-3 (os MÉDIO exigem decisão do usuário para GAP-1 e GAP-3), depois re-valide. GAP-4 e GAP-5 podem ser aceitos com registro explícito.

---

## Re-validação (Estágio 2, Rodada 2) — 2026-08-28

**Veredito:** ✅ **APROVA** — todos os 5 gaps endereçados. Nenhum gap novo introduzido pelos amendos.

| # | Resolução verificada | Evidência no ADR |
|---|----------------------|------------------|
| 1 | Redeem grava `LoginAttempt.create({ successful: true })` dentro do `uow.run` (via `loginAttemptRepo` adicionado a `IdentityRepositories`), zerando o contador de `LoginLockoutPolicy`. Trade-off do registro sintético documentado. Teste e2e de lockout limpo adicionado. | Fluxo redeem passo 7; `IdentityRepositories`; Consequências → Trade-offs; Plano de Teste (e2e) |
| 2 | Fluxo redeem agora especifica `findActiveByUserId` → `revokeAll` → `revokedSessionCount = activeSessions.length` → 1 `SessionRevoked('password_reset')` por sessão. Nota explicando por que não reusa `RevokeAllSessions` (repo fora da transação). Output do use case tipado com `events: SessionRevoked[]`. Testes unit atualizados. *(rodada 3: `PasswordResetCompleted` removido — só `SessionRevoked` + log)* | Fluxo redeem passos 7–8 + nota; Plano item 2; Plano de Teste |
| 3 | Redação das "Forças em Jogo" não promete mais timing constante; resíduo aceito e documentado como Trade-off explícito, em paralelo ao rate-limit in-memory. | Fluxo `/auth/forgot-password` (nota pós-passo 9); Consequências → Trade-offs |
| 4 | Índice parcial promovido a `UNIQUE (user_id) WHERE consumed_at IS NULL`; `insert` usa `ON CONFLICT (user_id) WHERE consumed_at IS NULL DO NOTHING`; repo lança `ActiveResetTokenExistsError` (typed, interno) em `rowCount === 0`; `RequestPasswordReset` captura e responde `202` neutro sem e-mail. Edge case e teste unit adicionados. | Schema (índice); Plano itens 1/3; Edge Cases; Plano de Teste |
| 5 | Plano de Teste referencia `/arch-guard` (Etapa 7 da pipeline) como o gate da Regra de Dependência. | Plano de Teste (linha "Regra de Dependência (GAP-5)") |

**Checklist re-conferido:** A (OK), B (OK — eventos `SessionRevoked` agora emitidos), C (N/A), D (OK — 4 tabelas sob `IdentityUnitOfWork`, rollback coberto), E (OK — índice `UNIQUE` fecha a race no schema), F (OK — lockout, corrida e timing agora na tabela de edge cases), G (OK — cobre unit + integração + e2e + arch-guard), H (OK — ordem correta).

**Próximo passo:** ADR pronto para aprovação final (Etapa 3C) e depois implementação (`/adr-executor`).

---

## Referências

- ADR 0001 — UnitOfWork Pattern for Atomic Transactions
- ADR 0002 — Identity: Cadastro de Usuários (precedente do `EmailService` stub)
- ADR 0004 — Transporte de Sessão via Cookie httpOnly (`clearSessionCookies`, `SessionRepository.revokeAll`)
- ADR 0005 — Identity: Login e Logout (padrão `login_attempts` para LOG-006, `DomainErrorFilter`)
- `docs/bussiness/02-identidade-e-acesso.md` seção 4 (REC-001 a REC-006)
- `docs/architecture/02-clean-architecture-ddd-fundamentos.md` (UnitOfWork, erros tipados)
