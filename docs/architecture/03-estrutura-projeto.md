# Estrutura do Projeto: mybitcoin-api

**Objetivo:** Definir como o código deve ser organizado — onde cada coisa mora e por quê.

Este documento parte dos princípios de `02-clean-architecture-ddd-fundamentos.md` e os traduz em estrutura de pastas e convenções concretas.

---

## Visão Geral

O projeto é organizado em **dois eixos**:

1. **Por camada** (a regra de dependência da Arquitetura Limpa)
2. **Por domínio** (a separação de contextos do DDD)

Nenhum dos dois eixos sozinho é suficiente. Organizar só por camada cria pastas enormes e genéricas. Organizar só por domínio dificulta enxergar onde as fronteiras arquiteturais estão.

---

## Estrutura de Pastas

```
src/
├── domain/                         ← Núcleo do negócio. Zero dependências externas.
│   ├── account/
│   │   ├── account.entity.ts       ← Aggregate root
│   │   ├── account.events.ts       ← Domain events: AccountCreated, AccountApproved
│   │   ├── account.errors.ts       ← AccountNotFoundError, AccountSuspendedError
│   │   ├── account.repository.ts   ← Interface AccountRepository
│   │   └── kyc/
│   │       ├── kyc-profile.entity.ts
│   │       ├── kyc-document.entity.ts
│   │       └── kyc.errors.ts
│   │
│   ├── financial/
│   │   ├── transaction.entity.ts   ← Aggregate root
│   │   ├── ledger-entry.entity.ts
│   │   ├── withdrawal.entity.ts    ← Aggregate root
│   │   ├── financial.events.ts     ← DepositConfirmed, WithdrawalBroadcast
│   │   ├── financial.errors.ts     ← InsufficientBalanceError, WithdrawalPendingError
│   │   ├── transaction.repository.ts
│   │   ├── ledger-entry.repository.ts
│   │   └── withdrawal.repository.ts
│   │
│   ├── bitcoin/
│   │   ├── bitcoin-transaction.entity.ts
│   │   ├── bitcoin-address.value-object.ts
│   │   ├── satoshi.value-object.ts
│   │   ├── bitcoin.events.ts       ← OnChainTxDetected, OnChainTxConfirmed
│   │   ├── bitcoin.errors.ts
│   │   └── bitcoin-transaction.repository.ts
│   │
│   └── shared/
│       ├── domain.error.ts         ← Classe base para todos os erros de domínio
│       ├── domain.event.ts         ← Interface base para domain events
│       └── unit-of-work.interface.ts
│
├── application/                    ← Orquestração. Depende só do domínio.
│   ├── account/
│   │   ├── create-account.usecase.ts
│   │   ├── submit-kyc.usecase.ts
│   │   └── approve-kyc.usecase.ts
│   │
│   ├── financial/
│   │   ├── request-withdrawal.usecase.ts
│   │   ├── confirm-deposit.usecase.ts
│   │   └── get-balance.usecase.ts  ← Calcula saldo via ledger
│   │
│   ├── bitcoin/
│   │   ├── process-inbound-tx.usecase.ts
│   │   └── broadcast-withdrawal.usecase.ts
│   │
│   └── shared/
│       └── event-dispatcher.interface.ts
│
├── infrastructure/                 ← Implementações. Depende do domínio e de libs externas.
│   ├── database/
│   │   ├── database.module.ts      ← Já implementado (ADR 0001)
│   │   ├── database.service.ts
│   │   ├── database.token.ts
│   │   ├── transaction.ts
│   │   ├── unit-of-work.postgres.ts ← Implementa UnitOfWork com DatabaseService
│   │   ├── migrations/
│   │   ├── queries/                 ← SQL nomeado, um arquivo por domínio
│   │   │   ├── account.queries.ts
│   │   │   ├── financial.queries.ts
│   │   │   └── bitcoin.queries.ts
│   │   └── repositories/
│   │       ├── account.postgres.repository.ts
│   │       ├── transaction.postgres.repository.ts
│   │       ├── ledger-entry.postgres.repository.ts
│   │       ├── withdrawal.postgres.repository.ts
│   │       └── bitcoin-transaction.postgres.repository.ts
│   │
│   ├── bitcoin-rpc/
│   │   ├── bitcoin-rpc.client.ts   ← Wrapper sobre chamadas ao nó Bitcoin
│   │   └── bitcoin-rpc.module.ts
│   │
│   ├── storage/
│   │   ├── s3.storage.client.ts    ← Upload de documentos KYC
│   │   └── storage.module.ts
│   │
│   └── telemetry/                  ← Já implementado (OpenTelemetry + Winston)
│       ├── opentelemetry.config.ts
│       ├── telemetry.logger.config.ts
│       ├── telemetry.metric.service.ts
│       └── telemetry.tracer.service.ts
│
├── interface-adapters/             ← Tradutores. Depende de application e domínio.
│   ├── http/
│   │   ├── account/
│   │   │   ├── account.controller.ts
│   │   │   ├── account.dto.ts      ← Request/Response DTOs
│   │   │   └── account.module.ts
│   │   │
│   │   ├── financial/
│   │   │   ├── financial.controller.ts
│   │   │   ├── financial.dto.ts
│   │   │   └── financial.module.ts
│   │   │
│   │   └── shared/
│   │       ├── error-filter.ts     ← Mapeia DomainError → HTTP status
│   │       └── auth.guard.ts
│   │
│   └── events/
│       └── deposit-confirmed.handler.ts  ← Reage a domain events
│
└── app.module.ts                   ← Composição global de módulos
```

---

## Por que essa divisão funciona

### `domain/` — O coração

Nenhum arquivo dentro de `domain/` pode importar de fora de `domain/`. Se você precisar checar: `grep -r "from '.*infrastructure\|.*application\|.*interface-adapters" src/domain/` deve retornar vazio.

A subdivisão por contexto (`account/`, `financial/`, `bitcoin/`) reflete os Bounded Contexts do DDD. Cada contexto tem:
- Entidades (com métodos de negócio)
- Value Objects
- Domain Events
- Erros tipados
- Interface de repositório

### `application/` — A orquestração

Use cases moram aqui. Eles importam apenas de `domain/`. Nenhum use case importa de `infrastructure/` ou de `interface-adapters/`.

Um use case tem no máximo:
- Um construtor com interfaces de repositório e/ou event dispatcher
- Um método `execute(input)` que retorna um output tipado
- Lógica de orquestração sem regras de negócio (regras ficam nas entidades)

### `infrastructure/` — Os detalhes

Aqui mora PostgreSQL, Bitcoin RPC, S3. Esta camada **implementa** as interfaces definidas em `domain/`. O NestJS faz a injeção: onde `AccountRepository` é esperado, injeta `AccountPostgresRepository`.

**queries/** merece atenção especial: SQL nomeado, não SQL inline no repositório. Isso facilita análise de performance, auditoria de queries e mudanças de schema — você sabe exatamente onde cada query mora.

### `interface-adapters/` — Os tradutores

Controllers NestJS ficam aqui. Eles:
1. Recebem o request HTTP
2. Validam o DTO de entrada (`class-validator`)
3. Chamam o use case
4. Retornam o resultado formatado

O **error filter** é crítico: um `@Catch(DomainError)` global que inspeciona o tipo do erro e retorna o status HTTP correto. Isso centraliza o mapeamento de erros e remove `try/catch` dos controllers.

---

## Convenções de Nomenclatura

### Arquivos

| Tipo | Sufixo | Exemplo |
|------|--------|---------|
| Entidade de domínio | `.entity.ts` | `account.entity.ts` |
| Value Object | `.value-object.ts` | `satoshi.value-object.ts` |
| Domain Event | `.events.ts` | `account.events.ts` |
| Erros de domínio | `.errors.ts` | `financial.errors.ts` |
| Abstract class de repositório | `.repository.ts` | `account.repository.ts` |
| Implementação de repositório | `.postgres.repository.ts` | `account.postgres.repository.ts` |
| Use Case | `.usecase.ts` | `create-account.usecase.ts` |
| Controller | `.controller.ts` | `account.controller.ts` |
| DTO | `.dto.ts` | `account.dto.ts` |
| NestJS Module | `.module.ts` | `account.module.ts` |

### Classes

- Abstract classes de repositório: `AccountRepository`, `TransactionRepository`
- Implementações: `AccountPostgresRepository`
- Use Cases: `CreateAccountUseCase`, `ConfirmDepositUseCase`
- Erros de domínio: `AccountNotFoundError`, `InsufficientBalanceError`
- Domain Events: `AccountCreated`, `DepositConfirmed` (substantivo no passado)
- Value Objects: `Satoshi`, `BitcoinAddress`, `Email`
- Entidades: `Account`, `Transaction`, `LedgerEntry`

---

## Módulos NestJS e Responsabilidade

O NestJS é um detalhe de infraestrutura — ele cuida de injeção de dependências e ciclo de vida dos módulos. A estrutura de módulos espelha a estrutura de domínio:

```typescript
// src/interface-adapters/http/account/account.module.ts
@Module({
  imports: [DatabaseModule],
  controllers: [AccountController],
  providers: [
    // Use case recebe a interface — NestJS injeta a implementação
    {
      provide: CreateAccountUseCase,
      useFactory: (repo: AccountRepository) => new CreateAccountUseCase(repo),
      inject: [AccountPostgresRepository],
    },
    AccountPostgresRepository,
  ],
})
export class AccountModule {}
```

O `DatabaseModule` (já implementado) é `@Global()` — disponível em todos os módulos sem reimportar.

---

## Fluxo de uma Requisição

Para tornar concreto, o caminho de um depósito sendo confirmado:

```
Bitcoin RPC detecta transação
         ↓
BitcoinRpcClient (infrastructure/bitcoin-rpc/)
  → notificação recebida via HTTP callback
         ↓
FinancialController (interface-adapters/http/financial/)
  → valida DTO de entrada
         ↓
ProcessInboundTxUseCase (application/bitcoin/)
  → busca BitcoinTransaction via IBitcoinTransactionRepository
  → cria Transaction com status 'pending'
  → persiste Transaction via TransactionRepository
  → publica OnChainTxDetected event
         ↓
(quando N confirmações atingidas)
ConfirmDepositUseCase (application/financial/)
  → UnitOfWork.run():
      → busca Transaction
      → transaction.confirm(confirmations)
      → persiste Transaction (status: completed)
      → cria LedgerEntry credit
      → persiste LedgerEntry
  → publica DepositConfirmed event
         ↓
DepositConfirmedHandler (interface-adapters/events/)
  → envia notificação push ao usuário
  → (futuro) emite WebSocket
```

Cada seta é uma fronteira. O use case não sabe que existe NestJS. A entidade não sabe que existe PostgreSQL. O controller não sabe como o depósito é confirmado.

---

## O que fazer com o código atual

O projeto já tem boa base em:
- `database/` — DatabaseModule, DatabaseService, Transaction (ADR 0001 implementado)
- `telemetry/` — OpenTelemetry completo
- ADRs documentando decisões de schema (0001, 0002, 0003)

O próximo passo é criar a estrutura de `domain/` para os três contextos identificados nos ADRs, depois `application/` com os use cases primários, depois `infrastructure/repositories/` implementando os contratos do domínio.

A estrutura de pastas deve ser criada com base nas necessidades reais — não antecipadamente. Crie `domain/account/` quando for implementar a feature de Account. Não antes.
