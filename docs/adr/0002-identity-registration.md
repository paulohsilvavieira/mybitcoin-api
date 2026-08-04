# ADR 0002 — Identity: Cadastro de Usuários

**Status:** Implementado
**PR:** https://github.com/paulohsilvavieira/mybitcoin-api/pull/2 (mergeado)
**Data:** 2026-07-12
**Autores:** Time de Backend
**Contexto relacionado:** ADR 0001 (UnitOfWork)
**Gerado por:** skill `/adr-architect`

---

## Contexto

O bounded context `identity` não existe ainda. A plataforma precisa de cadastro de usuários como base para todo o sistema de autenticação e autorização. O documento `docs/bussiness/02-identidade-e-acesso.md` define as regras CAD-001 a CAD-007 que devem ser implementadas.

Esta é a primeira feature do bounded context `identity` — ele será criado do zero seguindo Clean Architecture.

---

## Forças em Jogo

- Unicidade de e-mail é crítica — cadastro duplicado pode comprometer todo o fluxo de auth
- Senha deve ter política forte (8+ chars, maiúscula, minúscula, número, especial)
- Status inicial `PENDING_EMAIL_VERIFICATION` — conta só fica ativa após verificação
- IP e data de cadastro devem ser registrados para auditoria
- Envio de e-mail de verificação é assíncrono — falha não pode bloquear o cadastro
- Observabilidade (logs, traces, métricas) é obrigatória para monitoramento

---

## Decisão

Criar o bounded context `identity` com a entidade `User`, following Clean Architecture completa.

### Schema

```sql
CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  status           VARCHAR(30) NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  terms_accepted   BOOLEAN NOT NULL DEFAULT FALSE,
  registration_ip  INET NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users (email);
```

### Status possíveis

- `PENDING_EMAIL_VERIFICATION` — status inicial após cadastro
- `ACTIVE` — após verificação de e-mail
- `SUSPENDED` — bloqueio temporário (futuro)

### Hash de senha

Bcrypt com 12 rounds. A conversão acontece na camada de application (use case), não no domínio.

### Envio de e-mail

Interface abstrata `EmailService` no domínio. Implementação concreta será definida em ADR futuro. Por enquanto, a interface existe e o use case a chama — implementação pode ser mock ou stub.

### Rationale

**Por que Bcrypt e não Argon2?**
Bcrypt tem suporte nativo em virtually todas as linguagens e frameworks. Argon2 é mais moderno mas requer libs externas. Para um projeto NestJS/TypeScript, bcrypt é a escolha pragmática.

**Por que interface abstrata para email?**
Permite testes unitários sem dependência externa. A implementação concreta (SendGrid, SES, etc.) será definida em ADR separado quando o time decidir o provider.

---

## Impacto nos Bounded Contexts

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| identity | Novo bounded context criado | — |
| financial | Nenhum (futuro: Account referencia User) | Evento futuro |
| shared | DomainError base usado | Import |

**Entidades de domínio afetadas:** `User` (nova)
**Domain Events:** `UserRegistered` — publicado após persistência bem-sucedida. Outros contextos podem reagir (ex: criar conta financeira inicial no futuro)
**Interfaces de repositório afetadas:** `UserRepository` (nova)
**Migrations necessárias:** sim — tabela `users`

---

## Checklist de Arquitetura

- [x] Nenhum arquivo em `identity/domain/` importa de `identity/infrastructure/` ou `identity/presentation/`
- [x] Valores monetários usam `BIGINT` no banco e `bigint` no TypeScript (não aplicável — sem valores financeiros)
- [x] Erros de domínio são subclasses de `DomainError` (nunca boolean de retorno)
- [x] Operações multi-tabela usam `UnitOfWork` (ADR 0001) — não aplicável (tabela única)
- [x] Entidades não recebem dependências de infraestrutura no construtor

---

## Plano de Implementação

### 1. Domínio (`src/modules/identity/domain/`)

- [ ] Value Object `Email` — `email.vo.ts`
- [ ] Value Object `Password` — `password.vo.ts` (validação de política)
- [ ] Value Object `UserId` — `user-id.vo.ts`
- [ ] Entidade `User` — `user.entity.ts`
- [ ] Value Object `UserStatus` — `user-status.vo.ts` (enum: PENDING_EMAIL_VERIFICATION, ACTIVE, SUSPENDED)
- [ ] Domain Event `UserRegistered` — `events/user-registered.event.ts`
- [ ] Erro `EmailAlreadyExistsError` — `email-already-exists.error.ts`
- [ ] Erro `InvalidEmailError` — `invalid-email.error.ts`
- [ ] Erro `WeakPasswordError` — `weak-password.error.ts`
- [ ] Erro `TermsNotAcceptedError` — `terms-not-accepted.error.ts`
- [ ] Interface `UserRepository` — `user.repository.ts`
- [ ] Interface `EmailService` — `email.service.ts`

**Invariantes da entidade User:**
- Email é imutável após criação (não pode ser alterado)
- Status só transita: PENDING_EMAIL_VERIFICATION → ACTIVE (após verificação) → SUSPENDED (futuro)
- `email_verified` e `status` são consistentes: se `email_verified = true`, então `status = ACTIVE`

### 2. Aplicação (`src/modules/identity/application/`)

- [ ] Use Case `RegisterUser` — `register-user.usecase.ts`
  - Valida email (formato + unicidade)
  - Valida senha (política)
  - Valida aceite de termos
  - Hash da senha (bcrypt 12 rounds)
  - Cria User com status PENDING_EMAIL_VERIFICATION
  - Persiste via UserRepository
  - Envia email de verificação via EmailService (fire-and-forget)
  - Retorna `UserRegistered` event (o controller/presentation cuida da observabilidade)

### 3. Infraestrutura (`src/modules/identity/infrastructure/`)

- [ ] Migration `CreateUsersTable` — `migrations/xxx-create-users-table.ts`
- [ ] SQL queries — `persistence/user.sql.ts`
- [ ] Repository `PgUserRepository` — `persistence/pg-user.repository.ts`
- [ ] Mapper `UserMapper` — `persistence/user.mapper.ts`

### 4. Presentation (`src/modules/identity/presentation/`)

- [ ] DTO `RegisterUserDto` — `dto/register-user.dto.ts`
- [ ] Controller `IdentityController` — `identity.controller.ts`
- [ ] Module `IdentityModule` — `identity.module.ts`
- [ ] Endpoint `POST /auth/register`
- [ ] Observabilidade (log estruturado, trace, métrica) — via middleware/decorator no controller, NÃO no use case

---

## Edge Cases & Erros de Domínio

| Caso | Erro de domínio | Comportamento decidido |
|------|----------------|----------------------|
| E-mail já cadastrado | `EmailAlreadyExistsError` | Retornar erro 409 Conflict |
| E-mail formato inválido | `InvalidEmailError` | Retornar erro 422 Unprocessable Entity |
| Senha fraca (< 8 chars, sem maiúscula, etc.) | `WeakPasswordError` | Retornar erro 422 Unprocessable Entity |
| Termos não aceitos | `TermsNotAcceptedError` | Retornar erro 422 Unprocessable Entity |
| Falha no envio de email | (nenhum — fire-and-forget) | Conta criada, reenvio disponível depois |
| Tentativa simultânea com mesmo email | `EmailAlreadyExistsError` | Constraint UNIQUE garante atomicidade |

---

## Plano de Teste

- [ ] Unit (entidade): criação de User com todos os status, validação de invariantes
- [ ] Unit (value objects): Email validation, Password policy, UserId generation
- [ ] Unit (use case): RegisterUser com repositório mockado — cenários de sucesso e falha
- [ ] Integração: fluxo completo com banco real — persistência e leitura
- [ ] Negativo: email duplicado, senha fraca, termos não aceitos
- [ ] Arquitetura: teste que verifica que `identity/domain/` não importa de `identity/infrastructure/` ou `identity/presentation/`

---

## Fluxos

```
1. Usuário envia POST /auth/register
   → Controller valida DTO
   → Chama RegisterUser.execute()

2. RegisterUser.execute()
   → Valida formato do email (Email VO)
   → Valida política da senha (Password VO)
   → Valida aceite de termos
   → Verifica unicidade do email (UserRepository.findByEmail)
   → Hash da senha (bcrypt 12 rounds)
   → Cria User entity (status: PENDING_EMAIL_VERIFICATION)
   → Persiste (UserRepository.save)
   → Envia email de verificação (EmailService.sendVerification — fire-and-forget)
   → Registra log + trace + metric
   → Retorna { userId, email }

3. Resposta HTTP 201 Created
```

---

## Consequências

**Positivas:**
- Bounded context identity criado com Clean Architecture completa
- Senhas armazenadas com bcrypt (padrão da indústria)
- Testabilidade: EmailService abstrato permite testes sem dependência externa
- Observabilidade integrada desde o início
- Unicidade de email garantida pelo banco (constraint UNIQUE)

**Negativas / Trade-offs:**
- Email de verificação é fire-and-forget — se o provider falhar, o usuário precisa solicitar reenvio
- Bcrypt 12 rounds tem custo computacional (~250ms por hash) — aceitável para cadastro
- Interface abstrata de email precisa de implementação concreta antes de ir para produção

---

## Decisões do Usuário

> Confirmadas no grelhamento (Passo 2 da skill). Não são suposições do arquiteto.

- 2026-07-12 — Hash de senha → Bcrypt com 12 rounds
- 2026-07-12 — Envio de email → Interface abstrata (implementação futura)
- 2026-07-12 — Campos da tabela → id, name, email, password_hash, status, email_verified, terms_accepted, registration_ip, created_at, updated_at
- 2026-07-12 — Observabilidade → Logs estruturados + Traces OpenTelemetry + Métricas counter

---

## Referências

- ADR 0001 — UnitOfWork Pattern
- `docs/bussiness/02-identidade-e-acesso.md` — Regras CAD-001 a CAD-007
- `docs/architecture/02-clean-architecture-ddd-fundamentos.md` — Princípios
- `docs/architecture/03-estrutura-projeto.md` — Estrutura de pastas
