# ADR 0007 — KYC Básico

**Status:** Aceito <!-- Rascunho | Proposto | Aceito | Em Progresso | Implementado | Substituído -->
**Data:** 2026-08-28 (revisado 2026-08-29 após Validação Estágio 2; aprovado pelo usuário 2026-08-29)
**Autores:** Time de Backend
**Contexto relacionado:** ADR 0001 (UnitOfWork), ADR 0002 (Identity: Cadastro), ADR 0003 (Réplica de leitura), ADR 0004 (Transporte de sessão)
**Gerado por:** skill `/adr-architect`

> **Nota de numeração:** o número 0006 já está em uso pela branch em progresso `feat/0006-wallet-balances`
> (`0006-financial-wallets-materialized-balance.md`, PR aberto). Este ADR usa **0007**.

---

## Contexto

O documento `docs/bussiness/02-identidade-e-acesso.md`, seção 7, define o **KYC Básico** (regras KYC-001 a
KYC-006): identificar minimamente o usuário para desbloquear funcionalidades da plataforma. Hoje nada disso
existe — o bounded context `identity` cobre cadastro, login/logout e sessões (ADRs 0002, 0004, 0005), mas não
há coleta de identidade civil (Nome Completo, CPF, Data de Nascimento, Nacionalidade) nem gate que impeça
operações financeiras sem KYC aprovado.

A regra **KYC-001** ("KYC é obrigatório para desbloqueio de funcionalidades") exige um mecanismo transversal:
um `Guard` que outros módulos (hoje `financial`; no futuro saques, ordens) possam aplicar para bloquear
operações de quem não tem KYC aprovado. Como não há operação financeira iniciada pelo usuário implementada
ainda (`financial` só tem `confirm-deposit`, que é operação de sistema/on-chain), o guard será **entregue e
testado, mas não aplicado a nenhuma rota** nesta entrega.

CPF é dado pessoal sensível sob a LGPD e precisa de unicidade na plataforma (KYC-003 + edge case "CPF duplicado
→ sinalizar possível fraude"). O armazenamento precisa permitir *lookup* determinístico (índice único) sem
manter o número em claro.

---

## Forças em Jogo

- **KYC-001 transversal** — o gate precisa ser consumível por qualquer módulo sem que esse módulo dependa do
  agregado de `kyc` (Regra de Dependência entre bounded contexts). Resolve-se com uma interface de domínio
  (`KycStatusReadRepository`) exportada pelo `KycModule`, lida da réplica (ADR 0003).
- **Aprovação automática síncrona** — o fluxo do doc não prevê fila nem revisão manual: validou → `APPROVED`
  na hora. Não deve haver estado `PENDING` persistido.
- **CPF é PII sensível (LGPD)** + precisa de unicidade → não pode ficar em claro, mas precisa de índice único
  determinístico e (decisão do usuário) precisa ser recuperável para auditoria/compliance.
- **Auditoria (KYC-006)** — toda submissão (aprovada **ou** rejeitada) precisa deixar rastro imutável com
  snapshot dos dados, IP e timestamp.
- **1 submissão efetiva por usuário** — reenvio só é permitido quando o estado atual é `REJECTED`; `APPROVED`
  é terminal.
- **Atomicidade (ADR 0001)** — `kyc_profiles` e `kyc_submissions` são gravadas na mesma operação → `UnitOfWork`.
  O `UnitOfWork` do projeto tem `Repositories` fixo; será estendido (ver Decisão).
- **Idade mínima fixa (18)** — decisão consciente de não tornar configurável agora (KYC-005 diz
  "configurável"; adiado).

---

## Decisão

Criar o bounded context **`kyc`** em `src/modules/kyc/`, com Clean Architecture completa, contendo o agregado
`KycProfile` e a entidade de auditoria `KycSubmission`. O status de KYC é lido diretamente de
`kyc_profiles.status` — da réplica quando a leitura tolera lag (guard KYC-001), do primary quando precisa de
consistência imediata (`GET /kyc/me` logo após submeter).

> **Simplificação pós-validação (2026-08-29):** a versão original previa uma tabela de projeção
> `kyc_status_projection` atualizada por um evento `KycApproved` via `@nestjs/event-emitter`. O validador
> (Estágio 2, GAP 4) apontou que `kyc_profiles.status` já é a fonte de verdade e que o guard depende de uma
> interface de domínio do módulo `kyc` de qualquer forma — o acoplamento entre contextos é idêntico com ou
> sem projeção. **Removidos:** a tabela de projeção, o evento `KycApproved`, o handler e a dependência
> `@nestjs/event-emitter`. O guard lê `kyc_profiles` na réplica via `KycStatusReadRepository`.

### Agregado e máquina de estados

**`KycProfile`** (um por usuário, criado na primeira submissão):

| Estado | Significado | Transições |
|--------|-------------|-----------|
| `NOT_SUBMITTED` | Estado lógico quando não existe linha para o usuário | → `APPROVED` / `REJECTED` na 1ª submissão |
| `REJECTED` | Última submissão falhou em validação de negócio | → `APPROVED` / `REJECTED` (reenvio permitido) |
| `APPROVED` | KYC aprovado | **terminal** — nova submissão lança `KycAlreadyApprovedError` |

Não há `PENDING` persistido — aprovação é síncrona.

### Schema

```sql
-- 1788048000000_create_kyc_profiles_table.sql

CREATE TABLE kyc_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  status            VARCHAR(20) NOT NULL,          -- APPROVED | REJECTED
  rejection_reason  VARCHAR(60),                   -- código do erro quando status = REJECTED
  full_name         VARCHAR(255) NOT NULL,
  cpf_hash          CHAR(64) NOT NULL,             -- SHA-256(cpf + pepper), hex
  cpf_encrypted     TEXT NOT NULL,                 -- AES-256-GCM(cpf), base64 (iv.tag.ciphertext)
  cpf_last_digits   CHAR(2) NOT NULL,              -- para máscara ***.***.**-XX na resposta
  birth_date        DATE NOT NULL,
  nationality       CHAR(2) NOT NULL,              -- ISO 3166-1 alpha-2
  approved_at       TIMESTAMPTZ,                   -- preenchido só quando status = APPROVED
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CPF único apenas entre perfis APROVADOS. Um CPF rejeitado não "queima" o número.
CREATE UNIQUE INDEX idx_kyc_profiles_cpf_hash_approved
  ON kyc_profiles (cpf_hash) WHERE status = 'APPROVED';

-- Guard KYC-001: SELECT status FROM kyc_profiles WHERE user_id = $1 — coberto pela PK.
```

```sql
-- 1788048000001_create_kyc_submissions_table.sql
-- Trilha de auditoria imutável — nunca UPDATE/DELETE. Uma linha por tentativa.

CREATE TABLE kyc_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  result            VARCHAR(20) NOT NULL,          -- APPROVED | REJECTED
  rejection_reason  VARCHAR(60),                   -- código do erro de domínio quando REJECTED
  full_name         VARCHAR(255) NOT NULL,
  cpf_hash          CHAR(64) NOT NULL,
  cpf_encrypted     TEXT NOT NULL,
  cpf_last_digits   CHAR(2) NOT NULL,
  birth_date        DATE NOT NULL,
  nationality       CHAR(2) NOT NULL,
  submitted_ip      INET NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kyc_submissions_user_id ON kyc_submissions (user_id, created_at DESC);
```

### Armazenamento do CPF

- **`cpf_hash`** = `sha256(cpfDigits + KYC_CPF_HASH_PEPPER)` em hex — usado no índice único e no lookup de
  duplicidade. Pepper via env var **obrigatória**.
- **`cpf_encrypted`** = `AES-256-GCM(cpfDigits)` com `KYC_CPF_ENC_KEY` (32 bytes) — permite recuperar o CPF
  para compliance. Formato armazenado: `base64(iv).base64(authTag).base64(ciphertext)`.
- **`cpf_last_digits`** — 2 últimos dígitos, para a máscara `***.***.**-XX` em `GET /kyc/me`.
- Ambas as chaves são lidas via um provider de configuração dedicado que **falha no boot** se qualquer uma
  estiver ausente ou com tamanho inválido (sem fallback de dev — ver GAP 3).
- A criptografia é **detalhe de infraestrutura**: o domínio trabalha com o objeto de valor `Cpf` (dígitos
  validados); hash e cifra acontecem na implementação de infra de `CpfCrypto`, nunca no domínio.

### `UnitOfWork` — extensão (resolve GAP 1)

O `UnitOfWork` do projeto (`src/shared/unit-of-work.ts`, ADR 0001) tem um `Repositories` fixo. Seguindo o que
o próprio ADR 0001 prescreve ("When new repositories are added, they are added to this interface"),
estende-se:

```typescript
// src/shared/unit-of-work.ts
export interface Repositories {
  transactionRepo: TransactionRepository;
  ledgerRepo: LedgerEntryRepository;
  kycProfileRepo: KycProfileRepository;       // novo
  kycSubmissionRepo: KycSubmissionRepository; // novo
}
```

```typescript
// src/infrastructure/database/unit-of-work-postgres.service.ts
const repositories: Repositories = {
  transactionRepo: new PgTransactionRepository(transactionDatabase),
  ledgerRepo: new PgLedgerEntryRepository(transactionDatabase),
  kycProfileRepo: new PgKycProfileRepository(transactionDatabase),       // novo
  kycSubmissionRepo: new PgKycSubmissionRepository(transactionDatabase), // novo
};
```

`shared/unit-of-work.ts` passa a importar `KycProfileRepository`/`KycSubmissionRepository` de
`modules/kyc/domain` — importações de **domínio** apenas, consistente com o que já ocorre com o módulo
`financial`. `PostgresUnitOfWork` (infra global) passa a instanciar os repositórios Pg de KYC — mesmo padrão
já usado para `financial`.

### Mapeamento HTTP dos erros (resolve GAP 2)

O `DomainErrorFilter` (`src/infrastructure/http/domain-error.filter.ts`) tem `STATUS_BY_CODE` fixo, com
default `422`. Adicionar:

```typescript
CPF_ALREADY_IN_USE: HttpStatus.CONFLICT,      // 409
KYC_ALREADY_APPROVED: HttpStatus.CONFLICT,    // 409
```

Os demais erros de KYC (`INVALID_CPF`, `UNDERAGE`, `INVALID_BIRTH_DATE`, `INVALID_NATIONALITY`,
`INVALID_FULL_NAME`) saem do default `422` — comportamento desejado, nenhuma entrada nova necessária.

### Configuração das chaves de cripto (resolve GAP 3)

Provider `KycCryptoConfig` em `src/modules/kyc/infrastructure/config/kyc-crypto.config.ts`:

```typescript
@Injectable()
export class KycCryptoConfig {
  readonly hashPepper: string;
  readonly encKey: Buffer; // 32 bytes

  constructor(config: ConfigService) {
    const pepper = config.get<string>('KYC_CPF_HASH_PEPPER');
    const keyRaw = config.get<string>('KYC_CPF_ENC_KEY'); // hex ou base64, 32 bytes
    if (!pepper || pepper.length < 16) {
      throw new Error('KYC_CPF_HASH_PEPPER ausente ou muito curto (mín. 16 chars)');
    }
    const key = decodeKey(keyRaw);
    if (key.length !== 32) {
      throw new Error('KYC_CPF_ENC_KEY deve ter 32 bytes (AES-256)');
    }
    this.hashPepper = pepper;
    this.encKey = key;
  }
}
```

Instanciado pelo `KycModule` — o NestJS resolve no bootstrap, então chave ausente **derruba o boot**.
Documentar as duas vars em `.env.example` e `.env.test` (valores fake válidos no `.env.test`).

### Guard transversal (KYC-001)

- `KycRequiredGuard` em `src/modules/kyc/presentation/guards/kyc-required.guard.ts`.
- Depende de `KycStatusReadRepository` (porta de domínio do módulo `kyc`) →
  `findStatusByUserId(userId): 'APPROVED' | 'REJECTED' | null` lendo `kyc_profiles.status` da **réplica**
  (`ReadQueryExecutor`, padrão ADR 0003).
- Lê `request.user.userId` (populado pelo `SessionAuthGuard`); lança `ForbiddenException` quando o status
  não é `APPROVED` (inclui `null` / `REJECTED`). **Fail-closed.**
- Exportado pelo `KycModule` (junto com `KycStatusReadRepository`) para consumo por outros módulos.
- **Não aplicado a nenhuma rota nesta entrega** — `confirm-deposit` é operação de sistema/on-chain e fica de
  fora. Fica pronto para saque/ordens.
- Lag de replicação: um usuário aprovado há < 1s poderia receber `403` numa operação financeira até a
  réplica alcançar. Aceitável — fail-closed é o lado seguro, e a janela é sub-segundo.

### Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/kyc` | `SessionAuthGuard` + CSRF | Submete/reenvia KYC. `201` com status resultante |
| `GET` | `/kyc/me` | `SessionAuthGuard` | Status + dados mascarados (CPF `***.***.**-XX`) do usuário atual |

`GET /kyc/me` com usuário sem perfil retorna `200` com `{ status: "NOT_SUBMITTED" }`.
Reenvio é o mesmo `POST /kyc` — só aceito quando o estado atual é `REJECTED` ou `NOT_SUBMITTED`.

`GET /kyc/me` lê via **`KycProfileRepository` (primary)** — read-your-writes: logo após `POST /kyc` o
frontend consulta o status, e a réplica poderia devolver `NOT_SUBMITTED` obsoleto. Mesmo racional do
provider `Login` no `identity.module.ts`, que usa o repo de escrita "para evitar falso resultado por lag de
replicação". (Resolve GAP 5.)

`/auth/me` **não muda** — decisão do usuário (menor acoplamento; frontend faz 2 chamadas).

### Validações de negócio (no domínio)

| Regra | Validação |
|-------|-----------|
| KYC-002 | `full_name` não-vazio, ≥ 2 palavras, ≤ 255 chars |
| KYC-003 | CPF: 11 dígitos + dígitos verificadores válidos (algoritmo módulo 11); rejeita sequências triviais (`000...`, `111...`) |
| KYC-004 | `birth_date` é data válida, **não-futura**, e idade resultante ≤ 120 anos |
| KYC-005 | idade ≥ **18** anos (constante `MINIMUM_KYC_AGE = 18` no domínio) |
| — | `nationality` ∈ lista fechada ISO 3166-1 alpha-2 |
| KYC-003 (fraude) | `cpf_hash` já existe em perfil `APPROVED` de **outro** usuário → `CpfAlreadyInUseError` + log estruturado de segurança (`operation: 'kyc.submit.fraud.cpf_reuse'`) |
| KYC-006 | toda submissão grava linha em `kyc_submissions` (aprovada ou rejeitada) |

### Fluxo de submissão (atômico — `UnitOfWork`)

```
POST /kyc  { fullName, cpf, birthDate, nationality }
  → SessionAuthGuard valida sessão + CSRF, injeta userId
  → KycController valida DTO (formato)
  → SubmitKyc.execute({ userId, fullName, cpf, birthDate, nationality, ip })

SubmitKyc.execute:
  1. uow.run(async ({ kycProfileRepo, kycSubmissionRepo }) => {
  2.   profile = await kycProfileRepo.findByUserId(userId)   // null | REJECTED | APPROVED
       - se APPROVED → throw KycAlreadyApprovedError  (rollback — nada gravado)
  3.   Monta VOs: FullName, Cpf, BirthDate, Nationality
       - VO inválido → grava kycSubmissionRepo.save(REJECTED, reason=<código>);
         upsert kycProfileRepo (status REJECTED); throw <ErroDominio>
         (a submissão REJECTED É persistida — o throw acontece após o save, o commit ocorre;
          alternativamente o use case captura, persiste em uow separado e re-lança — ver Plano)
  4.   cpfHash = cpfCrypto.hash(cpf.digits)
       exists = await kycProfileRepo.existsApprovedByCpfHash(cpfHash, exceptUserId=userId)
       - true → grava submissão REJECTED('CPF_ALREADY_IN_USE'); log de fraude; throw CpfAlreadyInUseError
  5.   profile.approve(...) ; approved_at = now
       kycProfileRepo.upsert(profile APPROVED)
       kycSubmissionRepo.save(submission APPROVED)
     })  // commit
  6. Logger.log('kyc.submit.approved', { userId })
  → 201 { status: 'APPROVED', approvedAt }
```

**Nota de implementação (GAP 3.x do fluxo):** para garantir que a submissão `REJECTED` seja persistida
mesmo quando o caminho lança, o `SubmitKyc` executa em **dois passos**: (1) validação + montagem de VOs e
checagem de duplicidade fora da transação; (2) `uow.run` que grava `kyc_submissions` + faz upsert de
`kyc_profiles` com o resultado (APPROVED ou REJECTED) e **depois** o use case lança o erro de domínio se o
resultado foi REJECTED. Assim o commit sempre acontece e a auditoria (KYC-006) nunca se perde.

### Rationale

**Por que módulo `kyc` separado e não dentro de `identity`?**
KYC tem agregado, ciclo de vida e vocabulário próprios. Mantê-lo separado evita inflar `identity` e deixa a
fronteira de contexto explícita. `identity` continua responsável só por autenticação/sessão.

**Por que o guard lê `kyc_profiles` na réplica e não uma projeção dedicada?**
`kyc_profiles.status` já é a fonte de verdade. O guard depende de `KycStatusReadRepository` — uma interface
de domínio do módulo `kyc` — então o acoplamento entre `financial` (futuro) e `kyc` é o mesmo com ou sem
projeção. Uma projeção + barramento de eventos adicionaria uma tabela, um handler, consistência eventual e
uma dependência nova (`@nestjs/event-emitter`) sem benefício real neste momento. (Decisão do usuário,
2026-08-29.)

**Por que CPF hash + cifrado, e não só hash?**
Compliance/auditoria pode exigir exibir o CPF real de uma conta sob investigação. Só-hash tornaria isso
impossível. O hash com pepper dá o índice único determinístico; a cifra AES-GCM dá recuperabilidade sem
expor o número em claro no banco.

**Por que índice único parcial (`WHERE status = 'APPROVED'`)?**
Um CPF que foi rejeitado (ex.: erro de digitação que casou com CPF de outro) não deve bloquear
permanentemente aquele número. Só perfis aprovados reservam o CPF.

**Por que idade mínima fixa?**
KYC-005 diz "configurável", mas não há caso de uso para variar agora. Constante de domínio
(`MINIMUM_KYC_AGE`) — promover a env var é trivial depois e não muda o schema.

---

## Impacto nos Bounded Contexts (OBRIGATÓRIO)

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| `kyc` (novo) | Bounded context criado do zero — agregado `KycProfile`, entidade `KycSubmission`, guard `KycRequiredGuard`, config de cripto | — |
| `identity` | **Nenhuma alteração de código.** `kyc_profiles.user_id` / `kyc_submissions.user_id` referenciam `users(id)`. `KycRequiredGuard` reusa o `request.user` populado pelo `SessionAuthGuard` | FK no banco + contrato do `AuthenticatedRequest` |
| `financial` | **Nenhuma alteração nesta entrega.** Passa a poder importar `KycRequiredGuard` do `KycModule` quando houver operação de usuário para proteger | Import do guard (futuro) |
| `shared` | **`src/shared/unit-of-work.ts` alterado** — `Repositories` ganha `kycProfileRepo` e `kycSubmissionRepo` (importa `modules/kyc/domain`) | Import de domínio |
| infra global | **`src/infrastructure/database/unit-of-work-postgres.service.ts`** — instancia os 2 repos Pg de KYC na transação. **`src/infrastructure/http/domain-error.filter.ts`** — 2 códigos novos → 409. 2 env vars novas (`KYC_CPF_HASH_PEPPER`, `KYC_CPF_ENC_KEY`) | — |

**Entidades de domínio afetadas:** `KycProfile` (nova, aggregate root), `KycSubmission` (nova)
**Value Objects novos:** `Cpf`, `FullName`, `BirthDate`, `Nationality`, `KycStatus`
**Domain Events novos:** nenhum despachado (sem barramento). `KycApproved` fica como classe de evento
definida no domínio para uso futuro, **não despachada** — mesmo estado da `UserRegistered` existente
(opcional; pode ser omitida na implementação).
**Interfaces de repositório afetadas:** `KycProfileRepository` (write — via UoW e direto),
`KycSubmissionRepository` (write — via UoW), `KycStatusReadRepository` (read/réplica — guard)
**Migrations necessárias:** sim — `kyc_profiles`, `kyc_submissions`

---

## Checklist de Arquitetura (OBRIGATÓRIO)

- [x] Nenhum arquivo em `kyc/domain/` importa de `kyc/infrastructure/` ou `kyc/presentation/` — hash/cifra
  do CPF ficam na impl de infra de `CpfCrypto`; o domínio só conhece o VO `Cpf` e a porta abstrata `CpfCrypto`
- [x] Valores monetários usam `BIGINT`/`bigint` — **não aplicável** (KYC não toca valores financeiros)
- [x] Erros de domínio são subclasses de `DomainError` (`src/shared/domain.error.ts`) — `InvalidCpfError`,
  `UnderageError`, `InvalidBirthDateError`, `InvalidNationalityError`, `InvalidFullNameError`,
  `CpfAlreadyInUseError`, `KycAlreadyApprovedError`
- [x] Operações multi-tabela usam `UnitOfWork` (ADR 0001) — `kyc_profiles` + `kyc_submissions` no mesmo
  `uow.run`; `Repositories` estendido conforme ADR 0001 prescreve
- [x] Entidades não recebem dependências de infraestrutura no construtor — `KycProfile` recebe VOs

---

## Plano de Implementação (OBRIGATÓRIO — na ordem)

### 1. Domínio (`src/modules/kyc/domain/`)
- [ ] VO `Cpf` — `value-objects/cpf.vo.ts` (11 dígitos, dígitos verificadores, rejeita triviais; expõe
  `digits`, `lastTwoDigits`)
- [ ] VO `FullName` — `value-objects/full-name.vo.ts`
- [ ] VO `BirthDate` — `value-objects/birth-date.vo.ts` (não-futura, idade ≤ 120, `ageInYears(reference)`)
- [ ] VO `Nationality` — `value-objects/nationality.vo.ts` (ISO 3166-1 alpha-2, lista fechada)
- [ ] VO `KycStatus` — `value-objects/kyc-status.vo.ts` (`NOT_SUBMITTED` | `APPROVED` | `REJECTED`)
- [ ] Constante `MINIMUM_KYC_AGE = 18` — `domain/kyc-policy.ts`
- [ ] Entidade `KycProfile` — `entities/kyc-profile.entity.ts` (`create`/`reconstitute`;
  `assertCanSubmit()` lança `KycAlreadyApprovedError` se `APPROVED`; `approve(data, at)` aplica regras)
- [ ] Entidade `KycSubmission` — `entities/kyc-submission.entity.ts` (imutável; `approved(...)` /
  `rejected(reason, ...)`)
- [ ] Erros — `errors/*.error.ts`: `InvalidCpfError`, `InvalidFullNameError`, `InvalidBirthDateError`,
  `UnderageError`, `InvalidNationalityError`, `CpfAlreadyInUseError`, `KycAlreadyApprovedError`
- [ ] Porta `CpfCrypto` — `domain/services/cpf-crypto.ts` (abstract: `hash(digits): string`,
  `encrypt(digits): string`, `decrypt(payload): string`)
- [ ] Interface `KycProfileRepository` — `repositories/kyc-profile.repository.ts`
  (`findByUserId`, `existsApprovedByCpfHash(cpfHash, exceptUserId)`, `upsert`)
- [ ] Interface `KycSubmissionRepository` — `repositories/kyc-submission.repository.ts` (`save`)
- [ ] Interface `KycStatusReadRepository` — `repositories/kyc-status-read.repository.ts`
  (`findStatusByUserId(userId): 'APPROVED' | 'REJECTED' | null`)
- [ ] (Opcional) Domain Event `KycApproved` — `events/kyc-approved.event.ts` (não despachado)

### 2. Aplicação (`src/modules/kyc/application/`)
- [ ] `SubmitKyc` use case — `submit-kyc.usecase.ts` (fluxo de 2 passos acima; usa `UnitOfWork`, `CpfCrypto`,
  `KycProfileRepository` para a checagem de duplicidade fora da transação, `Logger`)
- [ ] `GetMyKycStatus` use case — `get-my-kyc-status.usecase.ts` (usa `KycProfileRepository` (primary);
  retorna status + CPF mascarado a partir de `cpf_last_digits`)
- [ ] DTOs de use case — `dtos/*.ts`

### 3. Infraestrutura (`src/modules/kyc/infrastructure/`)
- [ ] Migration `create_kyc_profiles_table` — `1788048000000_*.sql`
- [ ] Migration `create_kyc_submissions_table` — `1788048000001_*.sql`
- [ ] SQL — `persistence/kyc-profile.sql.ts`, `kyc-submission.sql.ts`
- [ ] `PgKycProfileRepository` — `persistence/pg-kyc-profile.repository.ts` (write, `QueryExecutor`;
  `upsert` via `INSERT ... ON CONFLICT (user_id) DO UPDATE`)
- [ ] `PgKycSubmissionRepository` — `persistence/pg-kyc-submission.repository.ts` (write)
- [ ] `PgKycStatusReadRepository` — `persistence/pg-kyc-status-read.repository.ts` (read, `ReadQueryExecutor`)
- [ ] Mappers — `persistence/kyc-profile.mapper.ts`, `kyc-submission.mapper.ts`
- [ ] `NodeCpfCrypto` — `crypto/node-cpf-crypto.ts` (implementa `CpfCrypto` com `node:crypto`; recebe
  `KycCryptoConfig` no construtor)
- [ ] `KycCryptoConfig` — `config/kyc-crypto.config.ts` (fail-fast no boot — ver Decisão)
- [ ] `.env.example` + `.env.test` — `KYC_CPF_HASH_PEPPER`, `KYC_CPF_ENC_KEY` (fake válidos no `.env.test`)

### 4. Infra compartilhada / global (alterações)
- [ ] `src/shared/unit-of-work.ts` — adicionar `kycProfileRepo` e `kycSubmissionRepo` a `Repositories`
- [ ] `src/infrastructure/database/unit-of-work-postgres.service.ts` — instanciar os 2 repos Pg de KYC
- [ ] `src/infrastructure/http/domain-error.filter.ts` — `CPF_ALREADY_IN_USE: 409`, `KYC_ALREADY_APPROVED: 409`
- [ ] **Deletar `src/infrastructure/database/unit-of-work.postgres.ts`** (código morto que também referencia
  `Repositories` com literal fixo — quebraria a compilação ao estender a interface; remoção já sancionada
  por `03-estrutura-projeto.md` e ADR 0001) — Validação Estágio 2, obs. A
- [ ] Criar `src/infrastructure/database/unit-of-work-postgres.service.spec.ts` cobrindo a construção dos 4
  repos dentro da transação (não existe spec hoje) — Validação Estágio 2, obs. B

### 5. Presentation (`src/modules/kyc/presentation/`)
- [ ] DTO `SubmitKycDto` — `dto/submit-kyc.dto.ts` (`class-validator`: fullName, cpf, birthDate ISO date,
  nationality alpha-2)
- [ ] DTO de resposta `KycStatusResponseDto` — `dto/kyc-status-response.dto.ts`
- [ ] `KycController` — `kyc.controller.ts` (`POST /kyc`, `GET /kyc/me`, ambos sob `SessionAuthGuard`;
  tags Swagger)
- [ ] `KycRequiredGuard` — `guards/kyc-required.guard.ts` (exportado pelo módulo)
- [ ] `KycModule` — `kyc.module.ts` (providers via `useFactory`; `KycCryptoConfig`, `NodeCpfCrypto`,
  repos, use cases; exporta `KycRequiredGuard` e `KycStatusReadRepository`)
- [ ] Registrar `KycModule` em `src/app.module.ts`

---

## Edge Cases & Erros de Domínio (OBRIGATÓRIO)

| Caso | Erro de domínio | Comportamento decidido |
|------|----------------|----------------------|
| CPF com dígitos verificadores inválidos / sequência trivial | `InvalidCpfError` | `422`; grava `KycSubmission` REJECTED (`INVALID_CPF`), perfil → `REJECTED` |
| Nome vazio / 1 palavra | `InvalidFullNameError` | `422`; submissão REJECTED (`INVALID_FULL_NAME`) |
| Data de nascimento no futuro ou idade > 120 | `InvalidBirthDateError` | `422`; submissão REJECTED (`INVALID_BIRTH_DATE`) |
| Idade < 18 | `UnderageError` | `422`; submissão REJECTED (`UNDERAGE`) |
| Nacionalidade fora da lista ISO | `InvalidNationalityError` | `422`; submissão REJECTED (`INVALID_NATIONALITY`) |
| CPF já aprovado em outra conta | `CpfAlreadyInUseError` | `409`; submissão REJECTED (`CPF_ALREADY_IN_USE`); log estruturado de segurança |
| Usuário já tem KYC `APPROVED` e tenta de novo | `KycAlreadyApprovedError` | `409`; **nada é gravado** (rollback) |
| Reenvio quando estado é `REJECTED` | — | Aceito; segue fluxo normal |
| `GET /kyc/me` sem perfil | — | `200 { status: "NOT_SUBMITTED" }` |
| `POST /kyc` sem sessão / sem CSRF | — | `401` / `403` (via `SessionAuthGuard`, comportamento já existente) |
| Corrida: 2 submissões `APPROVED` concorrentes, mesmo CPF | `CpfAlreadyInUseError` | 2º commit viola `idx_kyc_profiles_cpf_hash_approved`; repo traduz erro de constraint → `CpfAlreadyInUseError` (`409`) |
| Chaves de cripto ausentes/inválidas no boot | — | App não sobe (fail-fast no `KycCryptoConfig`) |
| `KycRequiredGuard` com status ≠ `APPROVED` (inclui `null`) | `ForbiddenException` | `403` (quando o guard for aplicado a alguma rota, no futuro). Fail-closed |

---

## Plano de Teste (OBRIGATÓRIO)

- [ ] Unit (VOs): `Cpf` (válidos conhecidos, inválidos, triviais, máscara/últimos dígitos); `BirthDate`
  (futura, > 120, limite exato de 18 anos com data de referência fixa); `Nationality` (BR ok, `XX`
  rejeitado); `FullName`; `KycStatus` transições
- [ ] Unit (entidade `KycProfile`): `assertCanSubmit` em perfil `APPROVED` → `KycAlreadyApprovedError`;
  `approve` com dados válidos; reenvio após `REJECTED` permitido
- [ ] Unit (entidade `KycSubmission`): imutabilidade; fábricas `approved`/`rejected`
- [ ] Unit (use case `SubmitKyc`, repositórios + UoW mockados): sucesso; cada erro de validação grava
  submissão REJECTED e propaga; CPF duplicado → `CpfAlreadyInUseError` + log; idempotência de reenvio
- [ ] Unit (`GetMyKycStatus`): perfil ausente → `NOT_SUBMITTED`; `APPROVED` → CPF mascarado `***.***.**-XX`
- [ ] Unit (`KycRequiredGuard`): status `APPROVED` → passa; `REJECTED`/`null` → `ForbiddenException`;
  sem `request.user` → `ForbiddenException`
- [ ] Unit (`NodeCpfCrypto`): `hash` determinístico com mesmo pepper; `encrypt`→`decrypt` round-trip;
  hashes diferentes para pepper diferente
- [ ] Unit (`KycCryptoConfig`): pepper ausente → throw; key ≠ 32 bytes → throw; config válida → ok
- [ ] Integração (banco real): `POST /kyc` → linha em `kyc_profiles` (APPROVED) + `kyc_submissions`;
  reenvio após REJECTED; índice único parcial bloqueia 2º CPF aprovado e permite CPF de perfil rejeitado;
  `GET /kyc/me` reflete o estado imediatamente (primary)
- [ ] Integração: rollback — `KycAlreadyApprovedError` não deixa linha nova em `kyc_submissions`
- [ ] Integração (`PgKycStatusReadRepository`): lê status correto da réplica
- [ ] Negativo (e2e controller): `401` sem sessão, `403` sem CSRF, `422` dados inválidos, `409` CPF
  duplicado, `409` reenvio de perfil aprovado
- [ ] Arquitetura: teste que `kyc/domain/` não importa de `kyc/infrastructure/` nem `kyc/presentation/`
- [ ] `PostgresUnitOfWork` (spec novo): `run()` instancia os 4 repos (`transactionRepo`, `ledgerRepo`,
  `kycProfileRepo`, `kycSubmissionRepo`) dentro da transação; `pnpm build` e `pnpm test` verdes após
  estender `Repositories`

---

## Fluxos

```
Submissão (feliz):
POST /kyc {fullName, cpf, birthDate, nationality}
  → SessionAuthGuard (sessão + CSRF) → userId
  → SubmitKyc: valida VOs (ok) → cpfHash → existsApprovedByCpfHash (livre)
    → uow.run: upsert KycProfile(APPROVED) + save KycSubmission(APPROVED)
  → 201 { status: APPROVED, approvedAt }

Rejeição (CPF inválido):
POST /kyc → SubmitKyc: Cpf.create lança InvalidCpfError (capturado)
  → uow.run: save KycSubmission(REJECTED, 'INVALID_CPF') + upsert KycProfile(REJECTED)
  → use case re-lança InvalidCpfError → DomainErrorFilter → 422 { code: INVALID_CPF }

Gate (futuro, quando aplicado a uma rota):
POST /algum-saque → SessionAuthGuard → KycRequiredGuard
  → KycStatusReadRepository.findStatusByUserId(userId) (réplica)
  → ≠ APPROVED → 403 ForbiddenException
```

---

## Consequências

**Positivas:**
- Bounded context `kyc` isolado, CA completa, fronteira explícita com `identity`/`financial`.
- Gate KYC-001 pronto e testado, desacoplado via `KycStatusReadRepository` — módulos futuros o aplicam com
  1 linha.
- CPF nunca em claro no banco; unicidade só entre aprovados; auditoria imutável de todas as tentativas (KYC-006).
- `identity` intocado — zero risco de regressão em auth.
- Sem tabela de projeção, sem barramento de eventos, sem dependência nova, sem consistência eventual —
  o status vem sempre de `kyc_profiles`.

**Negativas / Trade-offs:**
- `src/shared/unit-of-work.ts` e o `PostgresUnitOfWork` global passam a conhecer o módulo `kyc` — o
  `Repositories` fixo cresce a cada módulo que precisa de transação multi-tabela (limitação conhecida e
  aceita no ADR 0001). Toda a suíte que usa UoW precisa continuar verde.
- `KYC_CPF_ENC_KEY` sem estratégia de rotação — trocar a chave exige recriptografar `cpf_encrypted`. Fora
  de escopo; dívida anotada.
- Guard lê da réplica → janela sub-segundo de lag em que um usuário recém-aprovado recebe `403`. Fail-closed,
  aceitável.
- `GET /kyc/me` lê do primary — leve carga extra no primary, aceitável (endpoint de baixa frequência).

---

## Decisões do Usuário (rastreabilidade)

> Confirmadas no grelhamento (Passo 2 da skill) e na revisão pós-validação. Não são suposições do arquiteto.

- 2026-08-28 — Escopo → API + Frontend (este ADR cobre a API; frontend planejado pelo `/task-planner`)
- 2026-08-28 — Aprovação → automática e síncrona; sem estado `PENDING` persistido
- 2026-08-28 — Máquina de estados → `NOT_SUBMITTED` / `APPROVED` (terminal) / `REJECTED` (permite reenvio)
- 2026-08-28 — 1 submissão efetiva por usuário; reenvio só quando `REJECTED`
- 2026-08-28 — CPF único na plataforma → único apenas entre perfis `APPROVED` (índice parcial)
- 2026-08-28 — CPF duplicado → `CpfAlreadyInUseError` + log estruturado de segurança (evento dedicado
  descartado na revisão — sem barramento)
- 2026-08-28 — Armazenamento de CPF → `cpf_hash` (SHA-256 + pepper) para unicidade **e** `cpf_encrypted`
  (AES-256-GCM) para recuperação
- 2026-08-28 — Chaves de cripto → env vars **obrigatórias** (`KYC_CPF_HASH_PEPPER`, `KYC_CPF_ENC_KEY`),
  fail-fast no boot, sem fallback de dev
- 2026-08-28 — Idade mínima → constante fixa `18` (não configurável agora)
- 2026-08-28 — Data de nascimento → não-futura + idade ≤ 120
- 2026-08-28 — Nacionalidade → ISO 3166-1 alpha-2, lista fechada (frontend usa `<select>`)
- 2026-08-28 — Bounded context → novo módulo `src/modules/kyc/`
- 2026-08-28 — Auditoria → tabela `kyc_submissions` (uma linha imutável por tentativa, aprovada ou rejeitada)
- 2026-08-28 — `KycRequiredGuard` → entregue e testado, **não aplicado** a nenhuma rota nesta entrega
- 2026-08-28 — `/auth/me` → não muda; status de KYC só em `GET /kyc/me`
- 2026-08-28 — Endpoints → `POST /kyc` (submete/reenvia), `GET /kyc/me` (status + CPF mascarado)
- **2026-08-29 (GAP 1)** — Atomicidade → **estender o `UnitOfWork` global** (`Repositories` +
  `PostgresUnitOfWork`) com `kycProfileRepo`/`kycSubmissionRepo`, conforme ADR 0001
- **2026-08-29 (GAP 4)** — **Simplificar** → remover `kyc_status_projection`, evento `KycApproved` (como
  fato despachado), handler e a dependência `@nestjs/event-emitter`. Guard lê `kyc_profiles` na réplica
- **2026-08-29 (GAP 2)** — `DomainErrorFilter` ganha `CPF_ALREADY_IN_USE: 409` e `KYC_ALREADY_APPROVED: 409`
- **2026-08-29 (GAP 3)** — Provider `KycCryptoConfig` com validação fail-fast no construtor
- **2026-08-29 (GAP 5)** — `GET /kyc/me` lê do primary (`KycProfileRepository`), read-your-writes

---

## Referências

- ADR 0001 — UnitOfWork Pattern
- ADR 0002 — Identity: Cadastro de Usuários
- ADR 0003 — Réplica de leitura PostgreSQL (`XRepository` / `XReadRepository`)
- ADR 0004 — Transporte de sessão via cookie (`SessionAuthGuard`, CSRF, `DomainErrorFilter`)
- `docs/bussiness/02-identidade-e-acesso.md` — seção 7 (KYC-001 a KYC-006), Critérios CA-KYC-01 a CA-KYC-03
- `docs/architecture/02-clean-architecture-ddd-fundamentos.md`
- `docs/architecture/03-estrutura-projeto.md`
- `docs/architecture/04-quando-usar-clean-architecture.md` — "Submeter KYC → Clean Architecture"

---

## Validação (Estágio 2) — 2026-08-28 → revisão 2026-08-29

**Veredito da 1ª rodada:** 🔁 REVISAR — 1 gap ALTO (atomicidade / `UnitOfWork` fixo) + 3 MÉDIO
(mapeamento HTTP 409, config fail-fast inexistente, projeção possivelmente desnecessária) + 2 BAIXO
(read repo do `/kyc/me`, isolamento de falha do handler de evento).

**Amendas aplicadas (2026-08-29):**

| Gap | Resolução |
|-----|-----------|
| 1 (ALTO) | `Repositories` do `UnitOfWork` estendido com `kycProfileRepo`/`kycSubmissionRepo`; `PostgresUnitOfWork` instancia os repos Pg de KYC. Arquivos no Plano §4. Impacto em `shared` e infra global registrado. |
| 2 (MÉDIO) | `domain-error.filter.ts` ganha `CPF_ALREADY_IN_USE: 409`, `KYC_ALREADY_APPROVED: 409`. Plano §4. |
| 3 (MÉDIO) | Provider `KycCryptoConfig` (`kyc/infrastructure/config/`) com validação no construtor → derruba o boot. Plano §3, teste unitário adicionado. |
| 4 (MÉDIO) | **Projeção, evento e `@nestjs/event-emitter` removidos.** Guard lê `kyc_profiles.status` na réplica via `KycStatusReadRepository`. |
| 5 (BAIXO) | `GET /kyc/me` lê do primary (`KycProfileRepository`), read-your-writes — mesmo racional do provider `Login`. Registrado na Decisão. |
| 6 (BAIXO) | Sem efeito — não há mais handler de evento. |

**Pendente de re-validação:** rodar `/adr-validator` novamente para confirmar que as amendas fecham os gaps
e não introduzem novos (especialmente a regressão potencial na suíte de `PostgresUnitOfWork`).

---

## Validação (Estágio 2) — 2ª rodada — 2026-08-29

**Veredito:** ✅ **APROVA** — os 6 gaps da 1ª rodada estão fechados. 1 observação MÉDIA a executar
(abaixo), registrada e aceita.

### Verificação das amendas (re-derivada do código)

| Gap 1ª rodada | Status | Evidência |
|---|---|---|
| 1 — `UnitOfWork` fixo | ✅ Fechado | `src/shared/unit-of-work.ts:6-9` tem `Repositories` fixo; ADR agora estende com os 2 repos de KYC e lista os arquivos no Plano §4. Único consumidor de `uow.run` é `src/modules/financial/application/confirm-deposit-with-uow.usecase.ts:10` (`{ transactionRepo, ledgerRepo }`) — adicionar campos é retrocompatível. `PgTransactionRepository` recebe `QueryExecutor` (`pg-transaction.repository.ts:18-20`) e `runInTransaction` passa `tx: QueryExecutor` (`database.service.ts:19`) → `PgKycProfileRepository(db: QueryExecutor)` encaixa. |
| 2 — HTTP 409 | ✅ Fechado | `src/infrastructure/http/domain-error.filter.ts:9-22` confirma `STATUS_BY_CODE` fixo + default 422; ADR §"Mapeamento HTTP" + Plano §4 adicionam os 2 códigos. |
| 3 — config fail-fast | ✅ Fechado | `src/infrastructure/` não tem `config/` (só `database http telemetry`); ADR agora define `KycCryptoConfig` no módulo `kyc/infrastructure/config/` com throw no construtor + teste unitário no plano. |
| 4 — projeção desnecessária | ✅ Fechado | Projeção, evento e `@nestjs/event-emitter` removidos; guard lê `kyc_profiles` na réplica via `KycStatusReadRepository`. Schema caiu para 2 tabelas. |
| 5 — read repo `/kyc/me` | ✅ Fechado | ADR define leitura pelo primary (`KycProfileRepository`), com precedente citado (`identity.module.ts`, provider `Login`). |
| 6 — falha do handler | ✅ N/A | Sem handler de evento. |

### Checklist

| Item | Resultado |
|------|-----------|
| A. Regra de Dependência | OK — `SubmitKyc` usa só interfaces + `CpfCrypto` (porta); `Logger` no use case tem precedente (`register-user.usecase.ts:12`); HTTP status no filtro (presentation) |
| B. Modelagem DDD | OK — `KycProfile` aggregate root, `KycSubmission` filha imutável, VOs completos, erros tipados |
| C. Precisão monetária | N/A |
| D. Atomicidade (ADR 0001) | OK — `uow.run` para as 2 tabelas; rollback coberto (`KycAlreadyApprovedError` antes de qualquer save); fluxo de 2 passos garante persistência da submissão REJECTED |
| E. Schema | OK — 2 tabelas, FKs para `users(id)`, índice único parcial, PK cobre o lookup do guard; `NOT NULL`/nullable com intenção clara (`approved_at`/`rejection_reason` nullable = só quando aplicável) |
| F. Edge cases | OK — inexistente, inválido, duplicado, idempotência, corrida (índice parcial + tradução de `23505`), boot sem chaves |
| G. Plano de teste | OK — cobre edge cases, integração com banco real, réplica, teste de Regra de Dependência |
| H. Ordem de implementação | OK — domain → application → infra → (infra global) → presentation |

### Observação a executar (MÉDIA — aceita, registrada)

| # | Severidade | Item | Evidência | Ação |
|---|-----------|------|-----------|------|
| A | MÉDIO | Existe código morto `src/infrastructure/database/unit-of-work.postgres.ts` (2º `PostgresUnitOfWork`, não conectado ao DI) que também referencia `Repositories` com literal fixo (`unit-of-work.postgres.ts:15`). Estender `Repositories` **quebra a compilação** desse arquivo (faltarão `kycProfileRepo`/`kycSubmissionRepo` no objeto). | `unit-of-work.postgres.ts:8,15`; `docs/architecture/03-estrutura-projeto.md:400` e ADR 0001 já mandam removê-lo | O executor **deve deletar `src/infrastructure/database/unit-of-work.postgres.ts`** ao estender `Repositories` (remoção já sancionada pela doc de arquitetura e pelo ADR 0001 — não é decisão nova). Adicionar ao Plano §4. |
| B | BAIXO | O Plano de Teste cita "specs de `PostgresUnitOfWork` continuam verdes" mas **não existe** spec para `PostgresUnitOfWork` (`ls src/infrastructure/database/*.spec.ts` → só `database.service`, `read-database.service`, `replication`). | — | Ajustar a linha para "criar spec de `PostgresUnitOfWork` cobrindo a construção dos 4 repos na transação" **ou** remover a expectativa. Não bloqueante. |

### Cobertura

- **OK:** 7 dos 8 grupos (A, B, D, E, F, G, H). **N/A:** C (precisão monetária).
- **GAP:** nenhum bloqueante. 1 MÉDIO (código morto quebra build — ação trivial e já sancionada) + 1 BAIXO
  (texto do plano de teste).

### Próximo passo

ADR pronto para implementação. Rode `/adr-executor`. O executor **deve**, além do plano: (1) deletar
`src/infrastructure/database/unit-of-work.postgres.ts`; (2) tratar o texto do plano de teste sobre
`PostgresUnitOfWork`.

---

## Ajustes durante a implementação (2026-08-29)

Refinamentos aplicados na implementação (dentro do escopo aprovado):

- **`kyc_profiles` sempre tem uma linha após a 1ª submissão** — APPROVED **ou** REJECTED. Coluna
  `rejection_reason VARCHAR(60)` adicionada. `GET /kyc/me` serve status + motivo de uma tabela só; o
  guard lê `status` da mesma tabela na réplica. Elimina a necessidade de cruzar com `kyc_submissions`.
- **`birth_date` ficou `DATE`** (não `TEXT`) — o `SubmitKycDto` força `^\d{4}-\d{2}-\d{2}$` via
  `@Matches`, então o valor que chega ao use case é sempre uma data limpa, inclusive nos caminhos de
  rejeição (o formato é checado no DTO, antes das regras de negócio).
- **`IdentityModule` passou a exportar `SessionAuthGuard`** — o `KycController` o aplica via
  `@UseGuards(SessionAuthGuard)`; `KycModule` importa `IdentityModule`. Nenhuma mudança de comportamento
  no `identity`.
- **`SubmitKyc` recebe `KycProfileRepository`** (além de `UnitOfWork` e `CpfCrypto`) para as leituras de
  pré-checagem fora da transação (`findByUserId`, `existsApprovedByCpfHash`).
