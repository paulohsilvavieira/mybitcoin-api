# mybitcoin-api — Guia para Claude Code

## O que é este projeto

API de uma plataforma de criptomoedas real. Funcionalidades: autenticação/KYC, carteiras, ledger financeiro com dupla entrada, order book, matching engine, depósitos/saques Bitcoin on-chain.

**Repositório relacionado:** `/home/paulohenrique/Developer/mybitcoin/mybitcoin-api` — esta API.
**Frontend relacionado:** `/home/paulohenrique/Developer/mybitcoin/mybitcoin-front` — SPA React que consome esta API.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | NestJS 11 |
| Linguagem | TypeScript 5.7 |
| Banco | PostgreSQL (driver `pg` — sem ORM) |
| Testes | Jest 30 |
| Observabilidade | OpenTelemetry |
| Package manager | pnpm |

---

## Arquitetura

Este projeto usa **Clean Architecture + DDD**. A documentação de referência está em `docs/architecture/`:

- `01-analise-projeto-anterior.md` — análise de sistemas similares de matching: o que funcionou e o que evoluir
- `02-clean-architecture-ddd-fundamentos.md` — princípios: Regra de Dependência, 4 camadas, DDD, UnitOfWork, erros tipados, bigint
- `03-estrutura-projeto.md` — estrutura concreta de pastas e convenções de nomenclatura
- `04-quando-usar-clean-architecture.md` — critério para CA vs abordagem simples

### Estrutura de pastas

```
src/
├── infrastructure/              ← infraestrutura compartilhada (DatabaseService, migrations, telemetry)
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── database.service.ts
│   │   ├── unit-of-work.postgres.ts
│   │   └── migrations/
│   └── telemetry/
├── modules/                     ← módulos de negócio, cada um com suas próprias camadas CA
│   └── <contexto>/
│       ├── domain/              ← entidades, value objects, interfaces *Repository, erros
│       ├── application/         ← use cases
│       ├── infrastructure/      ← implementações de repositórios, SQL
│       │   └── persistence/
│       │       ├── pg-*.repository.ts
│       │       └── *.sql.ts
│       ├── presentation/        ← controllers, DTOs, módulos NestJS
│       └── <contexto>.module.ts
├── shared/                      ← artefatos de domínio compartilhados entre módulos
│   ├── domain.error.ts
│   └── unit-of-work.ts
└── app.module.ts
```

Cada módulo é autocontido. O detalhe completo está em `docs/architecture/03-estrutura-projeto.md`.

### Regra de Dependência

Dentro de cada módulo, dependências só apontam para dentro:

```
presentation → application → domain
infrastructure (do módulo) → domain
```

`<módulo>/domain/` nunca importa de `application/`, `infrastructure/` ou `presentation/`. Verifique com:

```bash
grep -r "from '.*application\|from '.*infrastructure\|from '.*presentation" src/modules/*/domain/
```

---

## Convenções críticas

### Valores monetários — sempre `bigint`

Toda unidade monetária é representada em **satoshi** como `bigint` no TypeScript e `BIGINT` no PostgreSQL. Nunca `number`, nunca `float`, nunca `BigNumber`.

```typescript
// Correto
const amount: bigint = 100_000n
// Errado
const amount: number = 100000
const amount = new BigNumber(100000)
```

Campos SQL devem ter sufixo `_satoshi`: `amount_satoshi BIGINT NOT NULL`.

### Erros de domínio — sempre tipados

Nunca retornar `boolean` ou `null` para indicar falha de regra de negócio. Sempre lançar subclasse de `DomainError`.

```typescript
// Correto
throw new InsufficientBalanceError(accountId, required, available)
// Errado
return false
return { success: false, error: 'Saldo insuficiente' }
```

### Atomicidade — UnitOfWork

Operações que escrevem em mais de uma tabela DEVEM usar `UnitOfWork`. Nunca queries manuais em transações sequenciais sem garantia de rollback.

```typescript
await this.uow.run(async ({ transactionRepo, ledgerRepo }) => {
  await transactionRepo.save(tx)
  await ledgerRepo.save(debit)
  await ledgerRepo.save(credit)
})
```

### SQL — nunca inline nos repositórios

SQL fica em `src/modules/<contexto>/infrastructure/persistence/*.sql.ts` como constantes nomeadas. Repositórios importam e usam essas constantes.

### Repositórios

- **Abstract class** em `src/modules/<contexto>/domain/<nome>.repository.ts` — sem prefixo: `TransactionRepository` (não `ITransactionRepository`)
- **Implementação** em `src/modules/<contexto>/infrastructure/persistence/pg-<nome>.repository.ts` — usa `extends`: `class PgTransactionRepository extends TransactionRepository`
- No módulo NestJS: `{ provide: TransactionRepository, useFactory: (db) => new PgTransactionRepository(db), inject: [DatabaseService] }`
- Métodos `find*` retornam entidade de domínio ou `null` — nunca `undefined`, nunca `boolean`
- Métodos `save`/`delete` retornam `void` — nunca `boolean`

---

## Documentação de negócio

Em `docs/bussiness/` — estes são os documentos que as skills leem como "lei":

| Arquivo | Conteúdo |
|---------|---------|
| `01-visao-geral-sistema.md` | Visão macro, bounded contexts |
| `02-identidade-e-acesso.md` | Regras CAD/LOG/OUT/REC/SES/VER/KYC/MFA |
| `03-modelo-de-dominio.md` | Entidades, aggregates, value objects |
| `04-carteiras-e-ledger-financeiro.md` | INV-001 a INV-014, dupla entrada, ledger |
| `05-mercados-de-negociacao.md` | Pares, order book |
| `06-order-book.md` | Estrutura do order book |
| `07-matching-engine.md` | Algoritmo de matching |
| `08-trades-maker-taker-taxas.md` | Maker/Taker/Charger, cálculo de taxas |
| `09-depositos-e-saques.md` | Fluxos on-chain |
| `10-eventos-de-dominio-e-auditoria.md` | Domain events, auditoria |
| `11-invariantes-globais.md` | Invariantes globais do sistema |
| `12-cenarios-bdd.md` | Cenários BDD (Gherkin) |

## ADRs

Em `docs/adr/` — decisões arquiteturais já tomadas (ADRs antigos em `docs/old-adrs/`):

| ADR | Decisão |
|-----|---------|
| `0001-unit-of-work-pattern.md` | Padrão UnitOfWork para atomicidade (UnitOfWork abstrato + implementação Postgres) |
| `0002-identity-registration.md` | Cadastro de usuários (CAD-001 a CAD-007) — bounded context `identity`, bcrypt, status `PENDING_EMAIL_VERIFICATION` |
| `0003-read-write-database-replication.md` | Réplica de leitura PostgreSQL — `WRITE_POOL_TOKEN`/`READ_POOL_TOKEN`, padrão `XRepository`/`XReadRepository` por módulo |
| `0004-session-token-transport.md` | Transporte de sessão via cookie `httpOnly` (`__Host-session`/`__Host-csrf`), CSRF double-submit, `DomainErrorFilter` |
| `0005-login-logout.md` | Login e Logout (LOG-001 a LOG-006, OUT-001 a OUT-003) — bloqueio por tentativas (LOG-006), `ValidationPipe` global |

---

## Skills disponíveis

Skills ficam em `.claude/skills/`. Invoque com `/nome-da-skill`.

### Pipeline de ADR

Use este fluxo sempre que uma decisão arquitetural for necessária (novo schema, novo bounded context, mudança de padrão).

| Skill | Comando | Quando usar |
|-------|---------|------------|
| `adr-architect` | `/adr-architect` | Iniciar a criação de um ADR — faz perguntas, monta o documento |
| `adr-validator` | `/adr-validator` | Revisar adversarialmente um ADR antes de implementar |
| `adr-executor` | `/adr-executor` | Implementar um ADR aceito na ordem correta (domain→application→infrastructure→adapters) |
| `adr-reviewer` | `/adr-reviewer` | Revisar o diff de implementação contra o ADR |
| `adr-pr` | `/adr-pr` | Abrir PR com título e body padronizados |

**Ordem do fluxo:** `architect` → `validator` → (humano aprova) → `executor` → `reviewer` → `pr`

### Guards — validadores de regras

Invoque após implementar código que toque os respectivos domínios.

| Skill | Comando | O que valida |
|-------|---------|-------------|
| `ledger-guard` | `/ledger-guard` | Invariantes INV-001 a INV-014, dupla entrada, bigint, UnitOfWork |
| `security-guard` | `/security-guard` | Regras CAD/LOG/OUT/REC/SES/VER/KYC/MFA, bcrypt, SQL parametrizado |
| `arch-guard` | `/arch-guard` | Regra de Dependência, placement de artefatos, DDD, nomenclatura |

Todos os guards: leem a documentação primeiro, depois analisam código, retornam CONFORME/ÍNTEGRO ou VIOLAÇÃO com evidência `arquivo:linha`.

### Qualidade de código

| Skill | Comando | O que faz |
|-------|---------|----------|
| `code-reviewer` | `/code-reviewer` | Avalia complexidade ciclomática/cognitiva, SRP, naming, DRY, valores mágicos — retorna PASS ou ISSUES |

### Testes

| Skill | Comando | O que faz |
|-------|---------|----------|
| `test-writer` | `/test-writer` | Escreve testes (unit para entidades/use cases, integração para repositórios) |
| `test-reviewer` | `/test-reviewer` | Revisa qualidade dos testes, retorna PASS ou ISSUES |

### Documentação da API

| Skill | Comando | O que faz |
|-------|---------|----------|
| `swagger-docs` | `/swagger-docs` | Documenta/atualiza anotações `@nestjs/swagger` de um controller — tags, exemplos de body de sucesso e de erro, usando `DomainErrorResponseDto` e as regras reais de status de `domain-error.filter.ts` |

### Planejamento e modelagem (use ANTES de codar)

| Skill | Comando | O que faz |
|-------|---------|----------|
| `task-planner` | `/task-planner` | Carrega docs relevantes, classifica CA vs simples, lista artefatos em ordem (API + Frontend), define guards a executar — PARA para aprovação antes de implementar |
| `domain-modeler` | `/domain-modeler` | Modela entidade/VO/aggregate/event em DDD: determina tipo, define invariantes, projeta interface de repositório e domain events — PARA para aprovação antes de implementar |

### Frontend (cross-project)

| Skill | Comando | O que faz |
|-------|---------|----------|
| `frontend-executor` | `/frontend-executor` | Implementa código React no mybitcoin-front: types → services → stores → hooks → components → pages |
| `frontend-guard` | `/frontend-guard` | Valida código frontend: invariantes (FIN-xxx, UI-xxx, DATA-xxx, SEC-xxx), padrões shadcn, a11y, mobile-first |

---

## Pipeline Unificada (API + Frontend)

A pipeline de desenvolvimento suporta implementação cross-project. Config em `.pipeline-config.json`.

Ao invocar `/dev-pipeline`, a API orquestra:

1. **Etapas 1-7:** Backend API (NestJS) — recepção, triagem, ADR, planner, implementação, testes, guards
2. **Etapas 8-10:** Frontend (React) — implementação, build/lint, guards frontend
3. **Etapa 11:** Um PR por repositório (API + Frontend)

Para desativar o frontend, responda "apenas API" na Etapa 1.

### Configuração

```json
// .pipeline-config.json
{
  "frontend": {
    "path": "/home/paulohenrique/Developer/mybitcoin/mybitcoin-front",
    "srcPath": "src",
    "packageManager": "pnpm",
    "commands": {
      "dev": "pnpm dev",
      "build": "pnpm build",
      "lint": "pnpm lint",
      "test": "pnpm test"
    }
  }
}
```

---

## Comandos principais

```bash
pnpm install                  # instalar dependências
pnpm start:dev                # servidor em modo watch
pnpm test                     # testes
pnpm test:cov                 # cobertura
pnpm migration:create         # criar arquivo de migration
pnpm migration:run            # aplicar migrations pendentes
pnpm migration:dry-run        # simular migrations sem aplicar
pnpm lint                     # linting
```

---

## Invariantes financeiros (resumo)

Nunca implemente código que toque ledger sem ler `docs/bussiness/04-carteiras-e-ledger-financeiro.md`. As regras críticas:

- **INV-001/002/003** — Saldos nunca negativos
- **INV-005** — Toda movimentação de saldo cria `ledger_entry`
- **INV-006** — Nenhum `ledger_entry` sem `transaction_id`
- **INV-007** — `Σ débitos = Σ créditos` por transação (dupla entrada)
- **INV-014** — `ledger_entries` são imutáveis — nunca UPDATE/DELETE

---

## O que NÃO fazer

- **Não use ORM** — só driver `pg` com SQL explícito
- **Não use `number` para valores financeiros** — apenas `bigint`
- **Não retorne `boolean` de repositório** — lance `DomainError` tipado
- **Não coloque SQL inline em repositórios de CA** — use `*.queries.ts`
- **Não importe infraestrutura em `src/modules/*/domain/`** — violação da Regra de Dependência
- **Não processe operação financeira sem verificar KYC** — veja `docs/bussiness/02-identidade-e-acesso.md`
- **Não faça múltiplos writes sem `UnitOfWork`** — risco de estado parcial
