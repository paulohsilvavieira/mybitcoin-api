# ADR 0006 — Identity: Verificação de E-mail

**Status:** Proposto
**Data:** 2026-08-28
**Autores:** Time de Backend
**Contexto relacionado:** ADR 0002 (Identity: Cadastro de Usuários), ADR 0005 (Identity: Login e Logout)
**Gerado por:** skill `/adr-architect`

---

## Contexto

`docs/bussiness/02-identidade-e-acesso.md`, seção 6, define VER-001 a VER-004: toda conta deve confirmar a posse do e-mail informado no cadastro antes de ser considerada `ACTIVE`. Essa funcionalidade nunca foi implementada — o próprio ADR 0005 documentou o fato como "descoberta de código" que moldou seu escopo:

> "Verificação de e-mail não existe de fato. `RegisterUser` gera um `verificationToken` mas nunca o persiste, e `EmailService.sendVerification` é um stub no-op. Nenhum usuário jamais transita de `PENDING_EMAIL_VERIFICATION` para `ACTIVE` hoje."

Por isso o ADR 0005 relaxou conscientemente LOG-002 ("e-mail deve estar verificado" para logar), permitindo login tanto para `ACTIVE` quanto `PENDING_EMAIL_VERIFICATION`, com a nota explícita: *"precisa ser revisitada (endurecida de volta) quando Verificação de E-mail for implementada"*. Este ADR fecha essa dívida.

**Escopo desta pipeline:** API completa de verificação de e-mail (persistir o token já gerado no cadastro, endpoint de validação, endpoint de reenvio) + reversão do relaxamento de LOG-002 no Login + implementação real de `EmailService` (hoje stub no-op) via Resend + página simples no `mybitcoin-front` que consome o link do e-mail.

**Fora de escopo:** Recuperação de Senha (REC), KYC, MFA — permanecem não implementados, sem relação com esta decisão.

---

## Forças em Jogo

- VER-001 exige token único por solicitação; VER-004 exige que reenvio seja possível — as duas regras juntas implicam que um reenvio deve invalidar o token anterior (não pode haver dois tokens simultaneamente válidos para a mesma conta)
- Reverter LOG-002 sem oferecer um caminho de reenvio deixaria contas `PENDING_EMAIL_VERIFICATION` presas: não conseguem logar (LOG-002 endurecido) nem re-solicitar verificação autenticadas (não têm sessão) — o endpoint de reenvio precisa ser público (só e-mail, sem guard)
- Endpoint de reenvio público é superfície de enumeração de conta (LOG-003 já estabelece o precedente de resposta genérica) e de abuso (spam de e-mail) — precisa de resposta neutra e de um limite de frequência, seguindo o mesmo espírito de LOG-006 (mas sem reintroduzir a complexidade de uma tabela de auditoria dedicada, que não se justifica aqui)
- O projeto já tem um padrão estabelecido para token opaco: `sessions.token_hash` (SHA-256, nunca armazena o token em claro) — o token de verificação deve seguir o mesmo padrão por consistência e defesa em profundidade (um vazamento do banco não deveria permitir verificar contas arbitrárias)
- `EmailService` é uma interface abstrata pronta desde o ADR 0002, mas nunca implementada — este ADR precisa decidir o provedor concreto (Resend, decisão já tomada pelo usuário) sem reabrir a interface do domínio
- O e-mail de verificação leva a uma página do `mybitcoin-front`, não direto à API — evita que scanners de e-mail/antivírus que pré-carregam links (comportamento comum) consumam o token antes do clique real do usuário

---

## Decisão

### Backend — Schema

Três colunas novas em `users` (mesma tabela, sem tabela separada — só um token é válido por vez, não há necessidade de histórico auditável como em `login_attempts`):

```sql
ALTER TABLE users
  ADD COLUMN email_verification_token_hash    VARCHAR(64),
  ADD COLUMN email_verification_expires_at    TIMESTAMPTZ,
  ADD COLUMN email_verification_last_sent_at  TIMESTAMPTZ;

CREATE INDEX idx_users_email_verification_token_hash
  ON users (email_verification_token_hash);
```

Nenhuma das três é `NOT NULL`: contas que já verificaram via um token muito antigo (antes deste ADR não havia token algum) ou criadas antes desta migration começam com essas colunas `NULL` — tratado como "sem token pendente" (equivalente a token inválido se alguém tentar usar `NULL` como se fosse um token, o que a busca por hash já rejeita naturalmente).

**Por que não limpar o hash após verificação bem-sucedida:** ver Rationale.

### Backend — Entidade `User`

`domain/entities/user.entity.ts` ganha três campos privados (`_emailVerificationTokenHash: string | null`, `_emailVerificationExpiresAt: Date | null`, `_emailVerificationLastSentAt: Date | null`), getters correspondentes, e:

- `issueEmailVerificationToken(tokenHash: string, expiresAt: Date, sentAt: Date): void` — seta os três campos. Usado só pelo `RegisterUser` (linha nova, sem concorrência possível). O reenvio **não** usa este método em memória — usa o `UPDATE` atômico do repositório (ver "Backend — Repositório", Emenda gap 3) para evitar a corrida de duas requisições concorrentes
- `verifyEmail()` (`user.entity.ts:32-35`) — **alterado**: passa a ser um guard idempotente — `if (!this._status.isPendingEmailVerification()) return;` antes de qualquer mutação. Só transiciona `_status → ACTIVE` e `_emailVerified → true` quando o status atual é `PENDING_EMAIL_VERIFICATION`; para `ACTIVE` ou `SUSPENDED` é no-op silencioso. Protege o invariante "só conta pendente pode ativar por este caminho" no próprio aggregate, não só no use case (Emenda, gap 1). Continua **não** limpando os campos de token (ver Rationale)

### Backend — Política (`domain/services/email-verification-policy.ts`)

Mesmo padrão de `LoginLockoutPolicy`:

```typescript
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 segundos

export class EmailVerificationPolicy {
  static computeExpiry(now: Date): Date { return new Date(now.getTime() + TOKEN_TTL_MS); }
  static isCooldownActive(lastSentAt: Date | null, now: Date): boolean { ... }
}
```

### Backend — Repositório: `issueEmailVerificationTokenIfDue` (novo, atômico)

`UserRepository` ganha, além de `findByEmailVerificationTokenHash`, o método:

```typescript
abstract issueEmailVerificationTokenIfDue(params: {
  email: Email;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
  cooldownMs: number;
}): Promise<User | null>;
```

Implementado em `PgUserRepository` com um único `UPDATE ... WHERE ... RETURNING *`:

```sql
UPDATE users
SET email_verification_token_hash = $1,
    email_verification_expires_at = $2,
    email_verification_last_sent_at = $3,
    updated_at = $3
WHERE email = $4
  AND status = 'PENDING_EMAIL_VERIFICATION'
  AND (email_verification_last_sent_at IS NULL
       OR email_verification_last_sent_at <= $5)
RETURNING id, name, email, password_hash, status, email_verified,
          terms_accepted, registration_ip, created_at, updated_at,
          email_verification_token_hash, email_verification_expires_at,
          email_verification_last_sent_at
```

(`$5` = `now - cooldownMs`, calculado no repositório, não em SQL, para manter o `now` sob controle do caller/teste — mesmo padrão de injeção de tempo já usado em `LoginLockoutPolicy`.)

A condição inteira (existe + `PENDING_EMAIL_VERIFICATION` + cooldown elapsed) vive no `WHERE` de uma única instrução atômica do Postgres — não há leitura seguida de escrita em dois passos, então duas requisições concorrentes não podem ambas "vencer" a checagem de cooldown (Emenda, gap 3). `0` linhas afetadas → `RETURNING` vazio → o método retorna `null`, seguindo o padrão do projeto de `find*` retornar entidade ou `null` (nunca `boolean`). A mesma query, ao restringir `status = 'PENDING_EMAIL_VERIFICATION'`, também exclui contas `SUSPENDED` e `ACTIVE` do reenvio (Emenda, gap 1) sem precisar de um `if` separado no use case.

### Backend — `RegisterUser` (alteração)

Em vez de gerar o token e descartá-lo, `RegisterUser` agora:
1. Gera `token = randomBytes(32).toString('hex')` (inalterado) e `tokenHash = sha256(token)` (novo — mesmo padrão de `CreateSession`)
2. Chama `user.issueEmailVerificationToken(tokenHash, EmailVerificationPolicy.computeExpiry(now), now)` **antes** de `userRepo.save(user)` — o token já nasce persistido junto com o `INSERT` do usuário (mesma transação implícita de linha única, sem `UnitOfWork`)
3. Envia o e-mail com o **token em claro** (nunca o hash) via `EmailService.sendVerification` — comportamento de fire-and-forget mantido

### Backend — Use Case `VerifyEmail` (novo)

`application/verify-email.usecase.ts`, injeta `UserRepository` (escrita — mesma razão do `Login`: evitar lag de réplica logo após cadastro/reenvio, ADR 0003).

```
1. tokenHash = sha256(input.token)
2. user = userRepo.findByEmailVerificationTokenHash(tokenHash)
3. Se null → EmailVerificationTokenInvalidError
4. Se user.status.isActive() → retorna sucesso idempotente, SEM checar expiração
   (conta já verificada — VER edge case "retornar sucesso"; ver Rationale sobre não limpar o hash)
5. Se user.status.isSuspended() → EmailVerificationTokenInvalidError (mesmo erro genérico do
   passo 3 — NÃO revela que a conta está suspensa; ver Rationale, Emenda gap 1)
6. Se now > user.emailVerificationExpiresAt → EmailVerificationTokenExpiredError
7. user.verifyEmail() → userRepo.save(user)
8. Retorna { userId, email, status: 'ACTIVE' }
```

`User.verifyEmail()` (`user.entity.ts:32-35`) passa a ser um guard idempotente na própria entidade — só transiciona quando `_status.isPendingEmailVerification()` é verdadeiro; caso contrário é no-op (não lança, não muda nada). Isso é defesa em profundidade: mesmo que um caller futuro esqueça de checar `isSuspended()` antes de chamar `verifyEmail()`, o invariante "só `PENDING_EMAIL_VERIFICATION` pode virar `ACTIVE` por este caminho" é protegido pelo próprio aggregate, não só pelo use case (ver Emenda, gap 1).

### Backend — Use Case `ResendVerificationEmail` (novo)

`application/resend-verification-email.usecase.ts`, injeta `UserRepository`, `EmailService`.

```
1. email = Email.create(input.email)  // formato inválido → InvalidEmailError (422, já existe)
2. updatedUser = userRepo.issueEmailVerificationTokenIfDue(email, tokenHash, expiresAt, now, RESEND_COOLDOWN_MS)
3. Se updatedUser === null → não faz nada (email inexistente, OU status != PENDING_EMAIL_VERIFICATION
   — cobre tanto ACTIVE quanto SUSPENDED, OU cooldown ainda ativo — os 3 casos são indistinguíveis
   de propósito, ver Rationale) — NÃO revela qual dos 3 foi
4. Se updatedUser !== null → emailService.sendVerification(...) fire-and-forget, com o token em claro
   (não o hash) gerado no passo 2
5. SEMPRE retorna void — o controller sempre responde 202 com a mesma mensagem genérica,
   independente do que aconteceu
```

`issueEmailVerificationTokenIfDue` (novo método de `UserRepository`) substitui o padrão anterior de "ler, checar em memória, escrever" por um **`UPDATE` atômico condicional** (ver seção "Backend — Repositório", Emenda gaps 1 e 3): a checagem de existência, status `PENDING_EMAIL_VERIFICATION` e cooldown elapsed acontece **inteira dentro do `WHERE` da query**, então não há janela entre leitura e escrita para uma corrida vencer. Retorna o `User` atualizado (padrão `find*` → entidade ou `null`, nunca `boolean`) só quando a linha realmente foi atualizada.

**Nenhum erro de domínio é lançado por este use case** (exceto `InvalidEmailError` para formato malformado, que é validação de input, não vazamento sobre a conta) — os ramos (inexistente / não-pendente / cooldown / sucesso) são indistinguíveis de fora, mesmo racional de LOG-003/`TooManyLoginAttemptsError`.

### Backend — Login (reversão de LOG-002)

Em `login.usecase.ts`, após o check de `isSuspended()` e antes de registrar sucesso:

```typescript
if (user.status.isPendingEmailVerification()) {
  throw new EmailNotVerifiedError(user.id.toString());
}
```

**Não** passa por `loginAttemptRepo.record()` como falha — mesmo tratamento de `AccountSuspendedError` (credenciais já foram validadas corretamente; LOG-006 existe para deter força bruta de senha, não para punir quem digitou a senha certa numa conta com um problema de estado diferente).

### Backend — Erros de domínio novos

- `EmailVerificationTokenInvalidError` (`code: 'EMAIL_VERIFICATION_TOKEN_INVALID'`) — mensagem estática `'Invalid or already used verification token'`
- `EmailVerificationTokenExpiredError` (`code: 'EMAIL_VERIFICATION_TOKEN_EXPIRED'`) — mensagem estática `'Verification token has expired'`
- `EmailNotVerifiedError` (`code: 'EMAIL_NOT_VERIFIED'`) — construtor recebe `userId` só para log (mesmo padrão de `AccountSuspendedError`), mensagem estática `'Please verify your email before logging in'` sem o `userId`

`DomainErrorFilter` (`src/infrastructure/http/domain-error.filter.ts`) ganha 3 entradas: `EMAIL_VERIFICATION_TOKEN_INVALID` → 422, `EMAIL_VERIFICATION_TOKEN_EXPIRED` → 422, `EMAIL_NOT_VERIFIED` → 403 (mesmo status de `ACCOUNT_SUSPENDED` — bloqueio de estado de conta após credenciais corretas, não falha de autenticação).

### Backend — `EmailService` real via Resend

`infrastructure/services/resend-email.service.ts`:

```typescript
export class ResendEmailService extends EmailService {
  constructor(
    private readonly resend: Resend,       // SDK oficial `resend`
    private readonly fromAddress: string,  // env EMAIL_FROM
    private readonly frontendOrigin: string, // env FRONTEND_ORIGIN (já existe, usado hoje só no CORS)
  ) { super(); }

  async sendVerification(params: { to: string; name: string; token: string }): Promise<void> {
    const link = `${this.frontendOrigin}/verify-email?token=${params.token}`;
    await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: 'Confirme seu e-mail — MyBitcoin',
      html: `... link para ${link} ...`,
    });
  }
}
```

A interface do domínio (`EmailService.sendVerification({to, name, token})`) não muda — a montagem do link (URL do frontend) é decisão de infraestrutura, o domínio só conhece o token em si. Novas env vars: `RESEND_API_KEY`, `EMAIL_FROM`. `FRONTEND_ORIGIN` já existe (`main.ts`, CORS) e é reaproveitada.

**Fail-fast explícito (Emenda, gap 4):** em `identity.module.ts`, o `useFactory` do provider `EmailService` valida as env vars **antes** de instanciar o SDK:

```typescript
{
  provide: EmailService,
  useFactory: () => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    const frontendOrigin = process.env.FRONTEND_ORIGIN;
    if (!apiKey || !from || !frontendOrigin) {
      throw new Error(
        'RESEND_API_KEY, EMAIL_FROM e FRONTEND_ORIGIN são obrigatórias para o EmailService',
      );
    }
    return new ResendEmailService(new Resend(apiKey), from, frontendOrigin);
  },
},
```

O SDK `Resend` não lança na construção com chave `undefined`/vazia — a validação explícita é o que garante o fail-fast no bootstrap (não uma suposição sobre o comportamento do SDK).

### Backend — Presentation

- `POST /auth/verify-email` — `{ token }` → `VerifyEmail.execute()` → `200 { userId, email, status }`
- `POST /auth/resend-verification` — `{ email }` → `ResendVerificationEmail.execute()` → sempre `202`, corpo `{ message: 'If an account with this email exists and is not yet verified, a new verification email has been sent.' }`
- `identity.controller.ts` ganha os dois métodos; `logLoginFailure` ganha um branch para `EmailNotVerifiedError` (mesmo padrão dos existentes)

### Frontend — Página de verificação

- `src/pages/verify-email-page.tsx` — lê `token` de `useSearchParams()`, chama `authService.verifyEmail(token)` no mount; estados: carregando / sucesso (CTA para `/login`) / erro (token inválido ou expirado — mostra formulário de reenvio com campo de e-mail, chama `authService.resendVerificationEmail(email)`, mostra a mesma mensagem genérica sempre)
- `src/services/auth.service.ts` ganha `verifyEmail(token: string)` e `resendVerificationEmail(email: string)`
- `App.tsx` — rota pública `/verify-email`
- Sem store nova, sem mudança em `use-auth-store.ts`

### Rationale

**Por que não limpar `email_verification_token_hash` após verificação bem-sucedida?**
Um segundo clique no mesmo link (double-click, retry de rede, usuário abre o e-mail de novo dias depois) precisa continuar funcionando de forma idempotente (mesmo racional de OUT-001/003 para logout). Se o hash fosse limpo no sucesso, o segundo clique não encontraria o usuário por `findByEmailVerificationTokenHash` e receberia `EmailVerificationTokenInvalidError` — uma resposta de erro para uma ação que já teve sucesso, UX ruim e semanticamente errada. Deixar o hash como está faz o passo 4 do `VerifyEmail` (`isActive()` → sucesso, sem checar expiração) resolver a idempotência sem precisar de um estado adicional. Um reenvio subsequente sobrescreve o hash normalmente (VER-001), então o link antigo continua "morrendo" quando um novo é emitido — a idempotência vale para "o mesmo link clicado de novo", não para "qualquer link antigo".

**Por que resposta sempre neutra no reenvio, mesmo para conta já verificada e cooldown ativo?**
Se o reenvio respondesse diferente para "e-mail não existe" vs "já verificado" vs "cooldown", um atacante poderia usar o endpoint para descobrir contas existentes (LOG-003) ou até inferir se uma conta específica já concluiu o cadastro. A única forma de manter os quatro ramos indistinguíveis de fora é o use case nunca lançar erro de negócio e o controller sempre responder o mesmo `202`.

**Por que cooldown embutido na entidade em vez de uma tabela `email_verification_attempts` (paralelo a `login_attempts`)?**
LOG-006 precisa de histórico auditável (quantas tentativas, quando, de qual IP) porque é uma defesa contra força bruta de senha — cada tentativa é um evento de segurança relevante por si só. O cooldown de reenvio de verificação não tem esse requisito: é só "não mandar de novo antes de N segundos", suficientemente resolvido por uma única coluna `last_sent_at` na própria linha do usuário. Introduzir uma tabela nova para isso seria complexidade sem justificativa (mesmo critério do documento `04-quando-usar-clean-architecture.md`: custo da abstração deve ser proporcional à necessidade real).

**Por que `EmailNotVerifiedError` mapeia para 403 e não 401?**
Mesmo racional de `AccountSuspendedError` (ADR 0005): as credenciais já foram corretamente validadas — 401 sugeriria "prove sua identidade de novo", quando o problema real é um estado de conta que a identidade já provada ainda não desbloqueia. 403 (Forbidden) comunica melhor "eu sei quem você é, mas você ainda não pode entrar por este motivo".

**Por que o link do e-mail aponta para o frontend, e o frontend chama `POST` em vez de a API responder direto a um `GET`?**
Ferramentas de segurança de e-mail corporativo e alguns antivírus pré-carregam (fazem `GET` automático em) links recebidos por e-mail antes do usuário clicar, para escanear o destino. Se o `GET` já consumisse o token (verificasse a conta), o token seria queimado antes do clique real do usuário, que veria erro. Fazer o link apontar para uma página HTML (que só age quando o JavaScript da página, carregado por uma ação real do navegador do usuário, dispara o `POST`) evita esse problema — mesmo padrão usado por praticamente todo fluxo de verificação de e-mail em produção.

**Por que `ResendVerificationEmail` não checa `isSuspended()` separadamente, e por que `VerifyEmail` trata token de conta suspensa como token inválido em vez de um erro específico? (Emenda, gap 1)**
A validação adversarial (Estágio 2) encontrou que `User.verifyEmail()` ativava a conta incondicionalmente, e que nem `ResendVerificationEmail` nem `VerifyEmail` excluíam explicitamente contas `SUSPENDED` — uma conta suspensa poderia pedir reenvio, receber um token válido e se reativar sozinha ao verificá-lo, contornando `AccountSuspendedError` (ADR 0005) por uma porta lateral. A correção tem duas camadas: (1) o `WHERE status = 'PENDING_EMAIL_VERIFICATION'` do `UPDATE` atômico de `issueEmailVerificationTokenIfDue` já exclui `SUSPENDED` (e `ACTIVE`) do reenvio — nenhum token novo é emitido para essas contas; (2) mesmo que uma conta fosse suspensa **depois** de já ter um token pendente válido na mão (cenário: token emitido, depois a conta é suspensa antes do clique), `VerifyEmail` explicitamente checa `isSuspended()` e recusa com o **mesmo erro genérico** de token inválido — não um erro específico do tipo `AccountSuspendedError`, porque isso revelaria ao portador do token (que pode não ser o dono legítimo da conta) que aquela conta está suspensa, um vazamento de informação desnecessário sobre um estado de moderação. `User.verifyEmail()` ganhando o guard de invariante na própria entidade é a terceira camada — defesa em profundidade caso um caller futuro esqueça de checar o status antes de chamar o método.

**Por que a checagem de cooldown migrou de "ler → checar em memória → escrever" para um `UPDATE` atômico condicional? (Emenda, gap 3)**
A validação encontrou que o desenho original (`findByEmail` → `canRequestEmailVerification()` em memória → `issueEmailVerificationToken()` → `save()`) tinha uma janela entre a leitura e a escrita onde duas requisições de reenvio concorrentes podiam ambas ler o mesmo `last_sent_at` antigo, ambas passar no check, e ambas disparar e-mail — o cooldown de 60s não seria garantido sob concorrência. Colocar a condição inteira (status + cooldown) no `WHERE` de um único `UPDATE` elimina a janela: o Postgres serializa as duas `UPDATE`s na mesma linha: a primeira a chegar atualiza `last_sent_at` e casa a condição; a segunda, mesmo tendo sido enfileirada com base num estado "antigo" da linha, reavalia o `WHERE` contra o estado já atualizado pela primeira (MVCC padrão do Postgres para `UPDATE`) e não casa — `0` linhas afetadas, `null` de volta, nenhum e-mail duplicado.

---

## Impacto nos Bounded Contexts

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| identity | Novos use cases `VerifyEmail`, `ResendVerificationEmail`; `RegisterUser` e `Login` alterados; novos erros `EmailVerificationTokenInvalidError`, `EmailVerificationTokenExpiredError`, `EmailNotVerifiedError`; `EmailService` ganha implementação concreta (`ResendEmailService`) | Import direto (mesmo módulo) |
| financial | Nenhum | — |
| shared | `DomainError` reutilizado | Import |
| infrastructure (compartilhada) | `DomainErrorFilter` ganha 3 novas entradas no mapa código→status; novas env vars `RESEND_API_KEY`, `EMAIL_FROM` | Edição do arquivo existente |
| frontend (`mybitcoin-front`) | Nova página `verify-email-page`, nova rota pública, 2 métodos novos em `auth.service.ts` | Novo consumidor da API |

**Entidades de domínio afetadas:** `User` (3 campos novos, 2 métodos novos, `verifyEmail()` alterado para guard idempotente)
**Domain Events:** nenhum novo — segue o precedente já registrado (ADR 0004/0005) de não introduzir eventos sem mecanismo de publicação; `UserRegistered` (ADR 0002) já é código não conectado a um event bus
**Interfaces de repositório afetadas:** `UserRepository` ganha `findByEmailVerificationTokenHash(tokenHash: string): Promise<User | null>` e `issueEmailVerificationTokenIfDue(params): Promise<User | null>` (`UPDATE` atômico, Emenda gaps 1 e 3)
**Migrations necessárias:** sim — 3 colunas + 1 índice em `users`

---

## Checklist de Arquitetura

- [x] Nenhum arquivo em `identity/domain/` importa de `identity/infrastructure/` ou `identity/presentation/`
- [x] Valores monetários usam `BIGINT`/`bigint` — não aplicável (sem valores financeiros)
- [x] Erros de domínio são subclasses de `DomainError` (`EmailVerificationTokenInvalidError`, `EmailVerificationTokenExpiredError`, `EmailNotVerifiedError`)
- [x] Operações multi-tabela usam `UnitOfWork` — não aplicável (todo use case novo toca só a tabela `users`, uma linha por vez)
- [x] Entidades não recebem dependências de infraestrutura no construtor — `ResendEmailService` fica em `infrastructure/`, `User` só manipula campos primitivos/Date

---

## Plano de Implementação

### 1. Domínio (`src/modules/identity/domain/`)
- [ ] `entities/user.entity.ts` — 3 campos + getters + `issueEmailVerificationToken()`; **alterar `verifyEmail()` para guard idempotente** (`if (!this._status.isPendingEmailVerification()) return;` antes de mutar — Emenda gap 1)
- [ ] `services/email-verification-policy.ts` — `TOKEN_TTL_MS` (1h), `RESEND_COOLDOWN_MS` (60s), `computeExpiry()`, `isCooldownActive()`
- [ ] `errors/email-verification-token-invalid.error.ts`
- [ ] `errors/email-verification-token-expired.error.ts`
- [ ] `errors/email-not-verified.error.ts`
- [ ] `repositories/user.repository.ts` — adicionar `findByEmailVerificationTokenHash(tokenHash: string): Promise<User | null>` **e** `issueEmailVerificationTokenIfDue(params): Promise<User | null>` (Emenda gaps 1 e 3)

### 2. Aplicação (`src/modules/identity/application/`)
- [ ] `register-user.usecase.ts` — gerar `tokenHash`, chamar `issueEmailVerificationToken()` antes de `save()`
- [ ] `verify-email.usecase.ts` — novo, fluxo descrito na Decisão, **incluindo o branch `isSuspended()` → `EmailVerificationTokenInvalidError`** (Emenda gap 1)
- [ ] `resend-verification-email.usecase.ts` — novo, usa `issueEmailVerificationTokenIfDue` (não lê+escreve em dois passos — Emenda gap 3)
- [ ] `login.usecase.ts` — adicionar check `isPendingEmailVerification()` → `EmailNotVerifiedError`, sem passar por `loginAttemptRepo.record()`

### 3. Infraestrutura (`src/infrastructure/database/migrations/`, `src/modules/identity/infrastructure/`)
- [ ] Migration `<timestamp>_add_email_verification_fields_to_users.sql` — 3 colunas + índice (SQL na seção Decisão)
- [ ] `infrastructure/persistence/user.sql.ts`:
  - [ ] `findUserByEmailVerificationTokenHashQuery` (nova)
  - [ ] `issueEmailVerificationTokenIfDueQuery` (nova — `UPDATE ... WHERE ... RETURNING *`, SQL completo na seção Decisão)
  - [ ] `saveUserQuery` — incluir as 3 colunas novas no `INSERT`/`ON CONFLICT DO UPDATE`
  - [ ] **`findUserByIdQuery` e `findUserByEmailQuery` — adicionar as 3 colunas novas ao `SELECT`** (Emenda gap 2 — sem isso, `ResendVerificationEmail`/`Login`/`GetCurrentUser` leem esses campos como `undefined`, já que `PgUserRepository` e `PgUserReadRepository` reusam as mesmas duas queries)
- [ ] `infrastructure/persistence/user.mapper.ts` — mapear as 3 colunas novas (`UserRow` + `toDomain`/`toRow`) — campos `string | null`/`Date | null`
- [ ] `infrastructure/persistence/pg-user.repository.ts` — implementar `findByEmailVerificationTokenHash` e `issueEmailVerificationTokenIfDue`
- [ ] `infrastructure/services/resend-email.service.ts` — novo, `ResendEmailService extends EmailService`
- [ ] `package.json` — adicionar dependência `resend` (SDK oficial)
- [ ] `src/infrastructure/http/domain-error.filter.ts` — 3 entradas novas no mapa
- [ ] `.env.example` — `RESEND_API_KEY`, `EMAIL_FROM`

### 4. Presentation (`src/modules/identity/presentation/`)
- [ ] `dto/verify-email.dto.ts` — `{ token: string }`
- [ ] `dto/verify-email-response.dto.ts` — `{ userId, email, status }`
- [ ] `dto/resend-verification-email.dto.ts` — `{ email: string }`
- [ ] `identity.controller.ts`:
  - [ ] `POST /auth/verify-email` → `VerifyEmail` → `200`
  - [ ] `POST /auth/resend-verification` → `ResendVerificationEmail` → `202` sempre, mensagem genérica fixa
  - [ ] `logLoginFailure` — branch para `EmailNotVerifiedError`
  - [ ] Swagger (`@ApiOperation`/`@ApiOkResponse`/etc.) para os 2 endpoints novos, seguindo o padrão de `register`
- [ ] `identity.module.ts`:
  - [ ] `RegisterUser` — injeção inalterada (já recebe `EmailService`), lógica interna muda
  - [ ] `VerifyEmail` — `provide`/`useFactory` injetando `UserRepository`
  - [ ] `ResendVerificationEmail` — `provide`/`useFactory` injetando `UserRepository`, `EmailService`
  - [ ] `Login` — injeção inalterada (nenhuma dependência nova)
  - [ ] `EmailService` — trocar o `useFactory` stub pelo factory com validação fail-fast das 3 env vars (código completo na seção Decisão, Emenda gap 4)

### 5. Frontend (`mybitcoin-front/src/`)
- [ ] `services/auth.service.ts` — `verifyEmail(token)`, `resendVerificationEmail(email)`
- [ ] `pages/verify-email-page.tsx` — novo
- [ ] `App.tsx` — rota pública `/verify-email`

### 6. Documentação
- [ ] `docs/adr/0005-login-logout.md` — emenda registrando a reversão de LOG-002 (referenciando este ADR)
- [ ] `docs/bussiness/02-identidade-e-acesso.md` — seção 6 passa de "❌ Não implementado" para "✅ Implementado", com link para este ADR e PR

---

## Edge Cases & Erros de Domínio

| Caso | Erro de domínio | Comportamento decidido |
|------|----------------|----------------------|
| Token de verificação não encontrado (nunca existiu, digitado errado, ou já sobrescrito por um reenvio — VER-001) | `EmailVerificationTokenInvalidError` | `422` |
| Token encontrado mas expirado (> 1h) e conta ainda `PENDING_EMAIL_VERIFICATION` | `EmailVerificationTokenExpiredError` | `422` — usuário deve solicitar reenvio |
| Token encontrado e conta já `ACTIVE` (reclique no mesmo link) | — (nenhum erro) | `200` idempotente, sem checar expiração (ver Rationale) |
| Token válido, dentro do prazo, conta `PENDING_EMAIL_VERIFICATION` | — | `200`, `verifyEmail()` executado, status → `ACTIVE` |
| **Token de conta `SUSPENDED` (emitido antes da suspensão)** | `EmailVerificationTokenInvalidError` (mesmo erro genérico de token inválido, não `AccountSuspendedError`) | `422` — não revela ao portador do token que a conta está suspensa (Emenda gap 1, ver Rationale) |
| **Reenvio para conta `SUSPENDED`** | — (nunca lança) | `202` genérico — `issueEmailVerificationTokenIfDue` não atualiza (WHERE exige `PENDING_EMAIL_VERIFICATION`), nenhum token novo emitido, nenhum e-mail enviado (Emenda gap 1) |
| Reenvio para e-mail inexistente | — (nunca lança) | `202` genérico — não revela que a conta não existe |
| Reenvio para conta já `ACTIVE` | — (nunca lança) | `202` genérico — não revela que já estava verificada (VER edge case "conta já verificada → sucesso") |
| Reenvio dentro do cooldown (60s desde o último envio) | — (nunca lança) | `202` genérico, e-mail **não** reenviado silenciosamente; garantido atômico mesmo sob 2 requisições concorrentes (Emenda gap 3) |
| Reenvio com e-mail de formato inválido | `InvalidEmailError` (já existe, ADR 0002) | `422` — validação de formato, não vazamento (mesmo racional do login) |
| Login de conta `PENDING_EMAIL_VERIFICATION` (pós-reversão de LOG-002) | `EmailNotVerifiedError` | `403`, não conta para o contador de LOG-006 |
| Login de conta `ACTIVE` | — | Login permitido (inalterado) |
| Login de conta `SUSPENDED` | `AccountSuspendedError` (já existe, ADR 0005) | `403`, inalterado — checado antes do check de verificação de e-mail |
| Falha no envio do e-mail (Resend indisponível) | — (fire-and-forget, nunca lança) | Conta criada/token emitido normalmente; usuário pode pedir reenvio depois (mesmo padrão do cadastro, ADR 0002) |
| `RESEND_API_KEY`/`EMAIL_FROM`/`FRONTEND_ORIGIN` ausente no bootstrap | — (erro de configuração, não `DomainError`) | Aplicação não sobe — `Error` lançado no `useFactory` de `EmailService` (Emenda gap 4) |

---

## Plano de Teste

- [ ] Unit (entidade `User`): `issueEmailVerificationToken()` seta os 3 campos; `verifyEmail()` não limpa os campos de token; **`verifyEmail()` chamado numa conta `ACTIVE` ou `SUSPENDED` é no-op** (não muda status, não lança — Emenda gap 1)
- [ ] Unit (`EmailVerificationPolicy`): `computeExpiry()` soma 1h; `isCooldownActive()` nos limites (exatamente 60s, 59s, 61s)
- [ ] Unit (use case `RegisterUser`): token gerado é persistido via `issueEmailVerificationToken()` antes de `save()` (regressão direta do bug atual — token descartado)
- [ ] Unit (use case `VerifyEmail`): token válido → sucesso, status muda para `ACTIVE`; token não encontrado → `EmailVerificationTokenInvalidError`; token expirado + conta pendente → `EmailVerificationTokenExpiredError`; token de conta já `ACTIVE` → sucesso idempotente sem checar expiração; **token de conta `SUSPENDED` → `EmailVerificationTokenInvalidError` (não `AccountSuspendedError`) — Emenda gap 1**
- [ ] Unit (use case `ResendVerificationEmail`): `issueEmailVerificationTokenIfDue` retornando `null` (e-mail inexistente / conta `ACTIVE` / conta `SUSPENDED` / cooldown ativo) → não chama `emailService.sendVerification`; retornando `User` → chama `emailService.sendVerification` com o token em claro
- [ ] Unit (repositório `PgUserRepository.issueEmailVerificationTokenIfDue`, com mock de `QueryExecutor`): monta a query com os parâmetros corretos, mapeia `0` linhas → `null`, `1` linha → `User` (Emenda gaps 1 e 3)
- [ ] Unit (use case `Login`): conta `PENDING_EMAIL_VERIFICATION` → `EmailNotVerifiedError`; **regressão**: este é o teste que existia como "sucesso" no ADR 0005 e precisa ser invertido
- [ ] Unit (erros): mensagens estáticas, sem UUID/e-mail interpolado (mesmo teste de regressão do ADR 0005 para os erros novos)
- [ ] Unit (`DomainErrorFilter`): `EMAIL_VERIFICATION_TOKEN_INVALID`/`EMAIL_VERIFICATION_TOKEN_EXPIRED` → 422, `EMAIL_NOT_VERIFIED` → 403
- [ ] Unit (`identity.module.ts` factory de `EmailService`): ausência de `RESEND_API_KEY`/`EMAIL_FROM`/`FRONTEND_ORIGIN` lança erro síncrono no `useFactory` (Emenda gap 4)
- [ ] Integração (`identity.controller`, `POST /auth/verify-email`): fluxo completo com banco real — token do cadastro verifica a conta, segunda chamada com o mesmo token continua `200`
- [ ] Integração (`POST /auth/resend-verification`): resposta idêntica (status + corpo) para e-mail existente pendente, inexistente, já verificado, `SUSPENDED`, e em cooldown; **teste de concorrência**: duas chamadas simultâneas para a mesma conta pendente fora do cooldown → só uma persiste um `email_verification_last_sent_at` que "vence"; a segunda não sobrescreve dentro da janela de 60s (Emenda gap 3)
- [ ] Integração (`findUserByIdQuery`/`findUserByEmailQuery` via `PgUserRepository`/`PgUserReadRepository`): confirma que as 3 colunas novas vêm populadas no `User` reconstituído, não `undefined` (Emenda gap 2 — regressão direta do gap encontrado na validação)
- [ ] Integração (`POST /auth/login`): conta `PENDING_EMAIL_VERIFICATION` → `403 EMAIL_NOT_VERIFIED`; conta `ACTIVE` (após verificar) → sucesso
- [ ] Negativo: token de outra conta não verifica a conta errada; reenvio não vaza nenhuma das 5 distinções pelo corpo da resposta (inexistente/ativa/suspensa/cooldown/sucesso)

---

## Fluxos

```
1. POST /auth/register (inalterado do ADR 0002, exceto persistência do token)
   → RegisterUser cria User (PENDING_EMAIL_VERIFICATION), gera token,
     issueEmailVerificationToken(), save() — token JÁ persistido
   → EmailService.sendVerification (fire-and-forget) — link para
     https://<frontend>/verify-email?token=<token>

2. Usuário clica no link do e-mail
   → Página verify-email-page carrega, lê `token` da URL
   → POST /auth/verify-email { token }
   → VerifyEmail: hash do token → busca User → valida expiração →
     verifyEmail() → save()
   → 200 → página mostra sucesso, CTA para /login

3. (Se token expirado) usuário pede reenvio na mesma página
   → POST /auth/resend-verification { email }
   → ResendVerificationEmail: gera novo token, sobrescreve o anterior,
     envia novo e-mail — sempre 202, mensagem genérica

4. POST /auth/login (alterado — reversão de LOG-002)
   → Login: credenciais corretas + status PENDING_EMAIL_VERIFICATION
   → 403 EMAIL_NOT_VERIFIED (antes: sucesso)
```

---

## Consequências

**Positivas:**
- Fecha a dívida documentada explicitamente no ADR 0005 — LOG-002 volta a ser aplicado como a documentação de negócio original especifica
- `EmailService` deixa de ser um stub no-op — cadastro e verificação passam a funcionar de ponta a ponta com e-mail real
- Token segue o mesmo padrão de segurança já validado para sessões (hash SHA-256, nunca em claro no banco)
- Resposta neutra do reenvio fecha a mesma classe de vazamento de enumeração de conta que LOG-003 já fecha no login

**Negativas / Trade-offs:**
- Toda conta `PENDING_EMAIL_VERIFICATION` criada antes deste ADR (se houver alguma em ambiente de teste/dev) fica permanentemente impedida de logar até verificar — não há migração de dados retroativa, pois essas contas nunca tiveram um token persistido para reenviar automaticamente; usuário precisa acionar reenvio manualmente
- Cooldown de 60s é atômico por linha (`UPDATE` condicional, Emenda gap 3), mas continua sendo um limite por conta — não impede um atacante com múltiplos e-mails de disparar volume alto de envios reais via Resend (rate-limit de custo/abuso mais forte, por IP ou global, fica para um ADR futuro, mesma categoria de débito já aceita para LOG-006/Redis)
- `RESEND_API_KEY`/`EMAIL_FROM`/`FRONTEND_ORIGIN` ausentes derrubam o bootstrap da aplicação inteira (fail-fast explícito, Emenda gap 4) — aceitável para o estágio atual do projeto (sem ambiente de produção real ainda), mas precisa de um fallback/feature-flag se isso mudar
- Token de verificação de uma conta suspensa **depois** de emitido (mas antes do clique) é tratado como token inválido — não idempotente-sucesso nem erro específico; se a suspensão for revertida depois, o usuário precisa pedir reenvio de novo (o token antigo não "volta a funcionar" mesmo que a causa da rejeição não exista mais)

---

## Decisões do Usuário

> Confirmadas no grelhamento (Passo 2 da skill). Não são suposições do arquiteto.

- 2026-08-28 — Escopo → API + Frontend (página simples, sem store nova)
- 2026-08-28 — `EmailService` real → Implementar via Resend (SDK), substituindo o stub no-op
- 2026-08-28 — LOG-002 → Reverter: `Login` volta a bloquear contas `PENDING_EMAIL_VERIFICATION`, com atualização do ADR 0005 registrando a reversão
- 2026-08-28 — TTL do token de verificação → 1 hora
- 2026-08-28 — Rate-limit do reenvio → Sim, cooldown simples (sem tabela de auditoria dedicada)
- 2026-08-28 — Duração do cooldown → 60 segundos
- 2026-08-28 — Autenticação do endpoint de reenvio → Nenhuma (só e-mail, sem guard) — necessário porque, após a reversão de LOG-002, uma conta pendente não consegue logar para pedir reenvio autenticado
- 2026-08-28 — Erro de login para conta não verificada → Específico (`EmailNotVerifiedError`), não o genérico de credenciais — mesmo racional de `AccountSuspendedError`
- 2026-08-28 — Método HTTP de verificação → `POST /auth/verify-email` chamado pelo frontend (não `GET` direto na API), para evitar consumo do token por pré-carregamento de scanners de e-mail
- 2026-08-28 — Token único por vez → Sim, cada reenvio invalida o token anterior (VER-001)
- 2026-08-28 (emenda pós-validação) — Contas `SUSPENDED` → Excluídas do reenvio (WHERE do UPDATE atômico) e tratadas como token inválido genérico em `VerifyEmail` (não revela suspensão a quem porta o token)
- 2026-08-28 (emenda pós-validação) — Concorrência no cooldown de reenvio → Resolvida via `UPDATE` atômico condicional em vez de checagem em memória, sem introduzir `UnitOfWork` (tabela única)
- 2026-08-28 (emenda pós-validação) — Fail-fast de env vars do `EmailService` → Validação explícita no `useFactory`, não depende do comportamento do SDK `Resend`
- 2026-08-28 (emenda pós-validação) — Todos os 4 gaps do Estágio 2 (2 ALTO, 2 MÉDIO) → Corrigidos no ADR, nenhum aceito como trade-off pendente

---

## Referências

- ADR 0002 — Identity: Cadastro de Usuários
- ADR 0003 — Réplica de Leitura PostgreSQL
- ADR 0005 — Identity: Login e Logout
- `docs/bussiness/02-identidade-e-acesso.md` — Regras VER-001 a VER-004, LOG-002
- `docs/architecture/02-clean-architecture-ddd-fundamentos.md` — Princípios
- `docs/architecture/03-estrutura-projeto.md` — Estrutura de pastas

---

## Validação (Estágio 2) — 2026-08-28

### Veredito: 🔁 REVISAR

### Checklist

| Bloco | Item | Status | Evidência |
|---|---|---|---|
| A. Regra de Dependência | `VerifyEmail`/`ResendVerificationEmail` só dependem de interfaces de domínio | OK | Fluxos descritos usam apenas `UserRepository`, `EmailService` — mesmo padrão de `Login`/`RegisterUser` |
| A. Regra de Dependência | Repositórios acessados só via interface | OK | `UserRepository.findByEmailVerificationTokenHash` é a única adição, abstrata |
| B. Value Objects | Token tratado como string opaca, não VO | OK, consistente | Mesmo padrão de `Session.tokenHash` (`session.entity.ts:9`) — projeto não usa VO para token/hash |
| B. Erros tipados | 3 erros novos, mensagens estáticas | OK | Seção "Erros de domínio novos" especifica mensagem fixa para os 3, seguindo o padrão de `AccountSuspendedError`/`InvalidCredentialsError` (ADR 0005) |
| B. Domain Events | Nenhum evento novo | OK, justificado | Rationale registra explicitamente a decisão de não introduzir evento sem mecanismo de publicação (mesmo precedente do ADR 0004/0005) |
| **B. Invariante do aggregate — `User.verifyEmail()` não valida o status de origem** | — | **GAP — ALTO** | `user.entity.ts:32-35`: `verifyEmail()` seta `_status = UserStatus.active()` **incondicionalmente**, sem checar se o status atual é `PENDING_EMAIL_VERIFICATION`. O ADR introduz `ResendVerificationEmail`, que (conforme especificado) só pula o envio quando `user.status.isActive()` — **não checa `isSuspended()`**. Resultado: uma conta `SUSPENDED` pode solicitar reenvio, receber um token válido, chamar `POST /auth/verify-email` e ter seu status virado para `ACTIVE`, revertendo a suspensão sem passar por nenhuma regra de negócio que autorize isso — anula o propósito de `AccountSuspendedError`/status `SUSPENDED` (ADR 0005). Não coberto na tabela "Edge Cases" nem no "Plano de Teste" |
| **D. Atomicidade — race condition no cooldown de reenvio** | — | **GAP — MÉDIO** | O fluxo de `ResendVerificationEmail` (seção "Decisão") é um read-check-write não atômico sobre a mesma linha (`findByEmail` → `canRequestEmailVerification()` → `issueEmailVerificationToken()` → `save()`), sem `SELECT ... FOR UPDATE` nem `UPDATE` condicional. Duas requisições de reenvio concorrentes para o mesmo email podem ambas ler o mesmo `lastSentAt` antigo, ambas passarem no check de cooldown, e ambas disparar e-mail — o cooldown de 60s que o próprio ADR introduz para conter abuso não é garantido sob concorrência. Não mencionado em "Decisão", "Rationale" nem "Consequências" |
| **E. Schema — SELECTs existentes não atualizados para as 3 colunas novas** | — | **GAP — ALTO** | `user.sql.ts:1-25` (código atual): `findUserByIdQuery`/`findUserByEmailQuery` enumeram colunas explicitamente (sem `SELECT *`) e **não incluem** as 3 colunas novas. O "Plano de Implementação" (seção 3) só menciona atualizar `saveUserQuery` e adicionar a query nova (`findByEmailVerificationTokenHashQuery`) — não instrui atualizar essas duas SELECTs existentes. Consequência concreta: `PgUserRepository`/`PgUserReadRepository` (ambos reusam essas mesmas funções — `pg-user.repository.ts:1-13`, `pg-user-read.repository.ts:1-12`) reconstituiriam `User` com `email_verification_last_sent_at`/`token_hash`/`expires_at` ausentes do row, quebrando silenciosamente `ResendVerificationEmail.canRequestEmailVerification()` (usado logo após um `findByEmail`) e qualquer leitura de `Login`/`GetCurrentUser` que dependa desses campos |
| F. Edge cases — registro inexistente | `EmailVerificationTokenInvalidError` | OK | Tabela cobre token não encontrado |
| F. Edge cases — operação duplicada/idempotência | Reclique no mesmo link de verificação | OK | Decisão de não limpar o hash após sucesso resolve o caso, com Rationale explícito |
| F. Edge cases — falha de integração externa | Falha no envio via Resend | OK | Fire-and-forget, mesmo padrão do ADR 0002 |
| **F. Edge cases — conta `SUSPENDED` no fluxo de verificação** | — | **GAP — ALTO (mesmo gap acima, ângulo de edge case)** | Nenhuma linha na tabela cobre "conta suspensa solicita reenvio/verificação" — decorre diretamente do gap de invariante acima |
| **G. Plano de teste — RESEND_API_KEY fail-fast prometido mas não especificado como passo** | — | **GAP — MÉDIO** | A Rationale afirma "Falha ao instanciar sem `RESEND_API_KEY` — fail-fast no bootstrap", mas o Plano de Implementação (seção 3, `identity.module.ts`) só descreve `new ResendEmailService(new Resend(process.env.RESEND_API_KEY), ...)`, sem nenhum passo que valide a env var antes de construir o SDK. O construtor de `Resend` não necessariamente lança para uma chave `undefined`/vazia — a garantia da Rationale não vira comportamento garantido sem um passo explícito (`if (!apiKey) throw ...`) |
| H. Plano de implementação | Ordem domain → application → infra → presentation → frontend | OK | Seções 1-5 seguem a ordem; seção 6 (documentação) é adicional e não quebra a ordem |

### Gaps (ordenados por severidade)

| # | Severidade | Gap | Evidência | Correção exigida |
|---|---|---|---|---|
| 1 | ALTO | `User.verifyEmail()` não valida o status de origem; `ResendVerificationEmail` não trata contas `SUSPENDED` — uma conta suspensa pode se reativar sozinha via reenvio + verificação | `user.entity.ts:32-35`; seção "Decisão" do ADR (`ResendVerificationEmail`, passo 4, só checa `isActive()`) | Especificar no ADR: `ResendVerificationEmail` deve pular silenciosamente (mesmo tratamento neutro dos outros 3 ramos) quando `user.status.isSuspended()`; `VerifyEmail` deve rejeitar (ou ao menos não ativar) quando o status não for `PENDING_EMAIL_VERIFICATION` no momento da verificação — decidir explicitamente o erro/comportamento para esse caso e adicionar à tabela de Edge Cases e ao Plano de Teste |
| 2 | ALTO | SELECTs existentes (`findUserByIdQuery`, `findUserByEmailQuery`) não estão no escopo do Plano de Implementação para incluir as 3 colunas novas, quebrando silenciosamente a leitura desses campos (usados por `ResendVerificationEmail`, `Login`, `GetCurrentUser`) | `user.sql.ts:1-25` (SELECTs atuais enumeram colunas, sem as novas); Plano de Implementação seção 3 só cita `saveUserQuery` + query nova | Adicionar item explícito ao Plano de Implementação seção 3: atualizar `findUserByIdQuery` e `findUserByEmailQuery` para incluir as 3 colunas novas no `SELECT`, e confirmar que `UserRow`/`UserMapper.toDomain` as tratam como `string | null`/`Date | null` |
| 3 | MÉDIO | Race condition: cooldown de reenvio é read-check-write não atômico — duas requisições concorrentes podem ambas passar no check e disparar e-mail dentro da janela de 60s | Fluxo de `ResendVerificationEmail` na seção "Decisão", sem `SELECT ... FOR UPDATE`/`UPDATE` condicional | Decidir e documentar: aceitar o risco explicitamente como trade-off (mesma categoria de LOG-006/Redis já aceito) OU especificar um `UPDATE ... WHERE email_verification_last_sent_at IS NULL OR email_verification_last_sent_at < $cooldown_threshold` atômico (sem exigir `UnitOfWork`, é uma tabela só) |
| 4 | MÉDIO | Rationale promete fail-fast de `RESEND_API_KEY` ausente, mas o Plano de Implementação não especifica esse passo de validação | Seção "Rationale" vs. Plano de Implementação seção 3 | Adicionar passo explícito no Plano de Implementação: validar `RESEND_API_KEY`/`EMAIL_FROM` no bootstrap (`identity.module.ts` ou `main.ts`) e lançar erro claro se ausente, antes de instanciar `Resend` |

### Cobertura

- **OK:** Regra de Dependência, modelagem de erros tipados, ausência de Domain Events (justificada), idempotência de reclique no link de verificação, ordem do plano de implementação
- **GAP:** invariante de status em `verifyEmail()`/`ResendVerificationEmail` para contas suspensas (2× ALTO, mesma causa raiz), SELECTs existentes não atualizados para as colunas novas (1× ALTO), race condition no cooldown (1× MÉDIO), fail-fast de env var não especificado como passo (1× MÉDIO)
- **N/A:** precisão monetária, `UnitOfWork` (nenhuma operação multi-tabela)

### Próximo passo

Rode `/adr-architect` para amendar o ADR endereçando os 2 gaps ALTO (comportamento para conta `SUSPENDED` no fluxo de verificação; SELECTs existentes precisam das 3 colunas novas) — ambos são bloqueantes. Os 2 gaps MÉDIO (race condition do cooldown; especificação do fail-fast de `RESEND_API_KEY`) também devem ser resolvidos antes de `/adr-executor`, mas podem ser aceitos explicitamente pelo usuário como trade-off documentado em vez de corrigidos, se essa for a decisão. Depois, re-valide.

---

## Emenda (pós-Estágio 2) — 2026-08-28

Amenda aplicada pelo `/adr-architect` endereçando os 4 gaps do Estágio 2 (usuário optou por corrigir todos, nenhum aceito como trade-off pendente):

| Gap | Status | O que mudou |
|---|---|---|
| 1 (ALTO — `verifyEmail()` incondicional; `SUSPENDED` podia se reativar via reenvio+verificação) | Corrigido | `User.verifyEmail()` virou guard idempotente (só transiciona a partir de `PENDING_EMAIL_VERIFICATION`); `VerifyEmail` ganhou branch explícito `isSuspended()` → `EmailVerificationTokenInvalidError` (erro genérico, não revela suspensão); `issueEmailVerificationTokenIfDue` exclui `SUSPENDED`/`ACTIVE` via `WHERE status = 'PENDING_EMAIL_VERIFICATION'` |
| 2 (ALTO — `findUserByIdQuery`/`findUserByEmailQuery` não incluídos no plano para as 3 colunas novas) | Corrigido | Item explícito adicionado ao Plano de Implementação (seção 3) — ambas as queries passam a `SELECT` as 3 colunas novas; `UserRow`/`UserMapper` ajustados |
| 3 (MÉDIO — race condition no cooldown do reenvio) | Corrigido | `ResendVerificationEmail` passa a usar `UserRepository.issueEmailVerificationTokenIfDue()` — `UPDATE` atômico condicional (status + cooldown no `WHERE`) em vez de ler→checar em memória→escrever; substitui o uso de `canRequestEmailVerification()`/`issueEmailVerificationToken()` no caminho de reenvio (que continuam existindo para o caminho de cadastro, sem concorrência) |
| 4 (MÉDIO — fail-fast de `RESEND_API_KEY` prometido mas não especificado) | Corrigido | `useFactory` de `EmailService` em `identity.module.ts` valida `RESEND_API_KEY`/`EMAIL_FROM`/`FRONTEND_ORIGIN` explicitamente e lança `Error` síncrono antes de instanciar `Resend`/`ResendEmailService` |

**Próximo passo:** rode `/adr-validator` novamente sobre este ADR (`0006-email-verification.md`) para confirmar que os gaps foram endereçados antes de `/adr-executor`.

---

## Validação (Estágio 2, 2ª rodada) — 2026-08-28

### Veredito: ✅ **APROVA (com 1 gap BAIXO — código morto por decisão de design)**

Os 4 gaps da 1ª rodada foram confirmados corrigidos, com evidência re-derivada independentemente do código atual e do texto emendado:

| Gap da 1ª rodada | Status |
|---|---|
| 1 (ALTO — `SUSPENDED` podia se reativar) | **Confirmado corrigido** — `verifyEmail()` guard idempotente (seção "Backend — Entidade `User`"), `VerifyEmail` passo 5 (`isSuspended()` → erro genérico), `issueEmailVerificationTokenIfDue` com `WHERE status = 'PENDING_EMAIL_VERIFICATION'` (seção "Backend — Repositório") |
| 2 (ALTO — SELECTs existentes sem as 3 colunas) | **Confirmado corrigido** — item explícito no Plano de Implementação seção 3: `findUserByIdQuery`/`findUserByEmailQuery` — adicionar as 3 colunas ao `SELECT` |
| 3 (MÉDIO — race condition no cooldown) | **Confirmado corrigido** — `UPDATE ... WHERE ... RETURNING` atômico (seção "Backend — Repositório"); condição de cooldown inteira no `WHERE`, sem leitura prévia no caminho de reenvio |
| 4 (MÉDIO — fail-fast não especificado) | **Confirmado corrigido** — `useFactory` de `EmailService` com validação explícita das 3 env vars antes de instanciar `Resend` (seção "Backend — `EmailService` real via Resend") |

**Gap novo (não bloqueante, BAIXO):** a correção do gap 3 trocou o caminho de produção de `ResendVerificationEmail` de "ler `User` → chamar `user.canRequestEmailVerification()` → `issueEmailVerificationToken()`" para o `UPDATE` atômico `issueEmailVerificationTokenIfDue`. Isso deixou `User.canRequestEmailVerification(now)` (seção "Backend — Entidade `User`") **sem nenhum caller de produção** — o único lugar que ainda o menciona é uma linha isolada no Plano de Teste ("Unit (entidade `User`): ... `canRequestEmailVerification()` ..."), mantida só para ter algo a testar. Isso é código morto introduzido pelo próprio ADR, o que `CLAUDE.md` (seção "O que NÃO fazer") pede para evitar: "Não crie abstração antes de precisar" / não deixar código sem uso. A lógica de cooldown já está coberta por `EmailVerificationPolicy.isCooldownActive()` (que o `PgUserRepository` usa para montar o `WHERE` do `UPDATE`), então `canRequestEmailVerification()` é redundante, não complementar.

### Checklist (itens reavaliados)

| Bloco | Item | Status | Evidência |
|---|---|---|---|
| B. Invariante do aggregate | `verifyEmail()` protege a transição de status no próprio aggregate | OK | Seção "Backend — Entidade `User`": guard `isPendingEmailVerification()` antes de mutar |
| D. Atomicidade | Cooldown de reenvio sem race condition | OK | `UPDATE ... WHERE ... RETURNING` atômico, sem leitura prévia no caminho de produção |
| E. Schema | SELECTs existentes cobrem as colunas novas | OK | Plano de Implementação seção 3, item explícito adicionado |
| F. Edge cases | Conta `SUSPENDED` no fluxo de verificação/reenvio | OK | Tabela de Edge Cases tem 2 linhas novas cobrindo os dois ramos (verify e resend) |
| **B/H. Sem código morto** | `User.canRequestEmailVerification()` sem caller de produção | **GAP — BAIXO** | Ver acima |

### Gaps

| # | Severidade | Gap | Evidência | Correção exigida |
|---|---|---|---|---|
| 1 | BAIXO | `User.canRequestEmailVerification()` ficou sem caller de produção após a correção do gap 3 da 1ª rodada — código morto | Seção "Backend — Entidade `User`" (método mantido) vs. seção "Backend — Use Case `ResendVerificationEmail`" (não o chama mais); `EmailVerificationPolicy.isCooldownActive()` já cobre a mesma lógica | Não bloqueia aprovação. Recomendado: remover `canRequestEmailVerification()` de `User` e a linha correspondente do Plano de Teste, cobrindo o cooldown só via o teste unitário de `EmailVerificationPolicy.isCooldownActive()` (já listado) — decisão do usuário se corrige agora ou aceita como está |

### Cobertura

- **OK:** todos os 4 gaps da 1ª rodada (2 ALTO, 2 MÉDIO), Regra de Dependência, invariante de status protegida no aggregate, atomicidade do cooldown, schema, edge cases de conta suspensa
- **GAP:** 1 BAIXO, não bloqueante (código morto)
- **N/A:** precisão monetária, `UnitOfWork` (nenhuma operação multi-tabela)

### Próximo passo

Nenhum gap bloqueante. O gap BAIXO pode ser corrigido agora (remover o método morto, trivial) ou aceito explicitamente pelo usuário e registrado como decisão. **ADR pronto para implementação — rode `/adr-executor`** (ou, nesta pipeline, avance para a Etapa 3C de aprovação final).

---

## Correção aplicada — 2026-08-28

O gap BAIXO foi corrigido nesta mesma passada, por decisão do usuário: `canRequestEmailVerification()` removido de `User` (seção "Backend — Entidade `User`") e da linha correspondente do Plano de Implementação/Plano de Teste. O cooldown de reenvio é coberto exclusivamente por `EmailVerificationPolicy.isCooldownActive()` (usado por `PgUserRepository` para montar o `WHERE` do `UPDATE` atômico) e pelo teste de integração de concorrência já listado.

Nenhum gap pendente. **ADR pronto para `/adr-executor`.**
