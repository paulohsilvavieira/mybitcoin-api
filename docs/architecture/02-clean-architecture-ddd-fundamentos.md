# Fundamentos: Arquitetura Limpa + DDD para o mybitcoin-api

**Objetivo:** Estabelecer os princípios que guiam todas as decisões de código deste projeto.  
Este documento não prescreve estrutura de pastas — isso está em `03-estrutura-projeto.md`. Aqui estão os **porquês**.

---

## A premissa central

Arquitetura Limpa e DDD compartilham uma premissa: **o negócio muda por razões diferentes do que a tecnologia muda**.

- A regra "um saque só é liberado após 2 confirmações na blockchain" muda porque o produto decide mudar
- O banco de dados muda de PostgreSQL para CockroachDB porque o time de infra decide mudar
- A API de WebSocket muda de Socket.io para Server-Sent Events porque a equipe de frontend decide mudar

Se essas mudanças estão acopladas no mesmo código, uma mudança de tecnologia força você a tocar na regra de negócio. Isso é o problema central que tanto a Arquitetura Limpa quanto o DDD resolvem, cada um a seu modo.

---

## Regra de Dependência

A lei mais importante da Arquitetura Limpa:

> **Dependências de código-fonte só podem apontar para dentro.**

```
[ Frameworks / Drivers ]
        ↓
[ Interface Adapters ]
        ↓
[ Use Cases ]
        ↓
[ Entities / Domain ]
```

Entidades não sabem que use cases existem.  
Use cases não sabem que controllers existem.  
Controllers não sabem que Express existe.  
Express não sabe como o banco de dados funciona.

Na prática: qualquer `import` de uma camada interna que referencie uma camada externa é uma violação. O test mais simples: consegue rodar os use cases sem subir o NestJS? Se não, há uma violação.

---

## Os quatro componentes e o que pertence a cada um

### 1. Domínio (a camada mais interna)

O que mora aqui são as regras que existiriam independente de qualquer software — as leis do negócio de criptomoedas.

**Entidades** representam objetos com identidade e ciclo de vida:
- `Account` — uma conta tem CPF único, email único, e muda de estado (pending → active → suspended)
- `Transaction` — uma transação financeira tem estado imutável após confirmada
- `LedgerEntry` — um lançamento contábil nunca é alterado, apenas criado

**Value Objects** representam conceitos sem identidade própria — são definidos por seus valores:
- `Satoshi` — um valor em satoshis; `Satoshi(1000)` é idêntico a qualquer outro `Satoshi(1000)`
- `BitcoinAddress` — uma string que obedece ao formato de endereço Bitcoin
- `Email` — um string com validação de formato
- `KycStatus` — um enum com transições válidas

**Domain Events** representam fatos que ocorreram:
- `DepositConfirmed` — quando uma transação Bitcoin atinge N confirmações
- `WithdrawalBroadcast` — quando uma transação de saque é transmitida à rede
- `AccountApproved` — quando o KYC é aprovado

**Regra fundamental:** Nenhuma entidade, value object ou domain event importa nada de fora do domínio. Zero dependências de framework, banco, HTTP.

---

### 2. Use Cases (casos de uso da aplicação)

Use cases orquestram entidades para executar uma tarefa específica do sistema. Cada use case representa uma **intenção do usuário** ou **do sistema**:

- `RequestWithdrawal` — usuário solicita saque
- `ConfirmDeposit` — sistema processa confirmação da blockchain
- `SubmitKycProfile` — usuário envia dados de KYC
- `CreateAccount` — novo usuário se registra

**O que um use case faz:**
1. Recebe dados de entrada (um DTO de input)
2. Usa repositórios (via interfaces) para buscar entidades
3. Executa lógica de negócio nas entidades
4. Usa repositórios para persistir o estado alterado
5. Publica domain events se necessário
6. Retorna um DTO de output

**O que um use case NÃO faz:**
- Não chama HTTP
- Não formata JSON
- Não emite WebSocket (isso é reação a um evento, não a intenção)
- Não sabe que existe NestJS

**Contratos via interfaces:**  
Use cases dependem de interfaces de repositório, não de implementações. O use case `ConfirmDeposit` depende de `TransactionRepository` e `LedgerRepository` — não de `PostgresTransactionRepository`.

---

### 3. Interface Adapters (adaptadores de interface)

Aqui ficam os tradutores: convertem dados do formato que o mundo externo fala (HTTP, WebSocket, CLI) para o formato que os use cases entendem, e vice-versa.

**Controllers** recebem requests HTTP, extraem dados, chamam use cases, formatam responses.

**Presenters** transformam o output de um use case no formato que a interface precisa (JSON, HTML, mensagem de fila).

**Repositories (implementações)** traduzem entre entidades de domínio e linhas de banco de dados.

**Regra prática:** Um controller NestJS pode importar `@nestjs/common`. Um use case não pode.

---

### 4. Frameworks e Drivers (a camada mais externa)

NestJS, PostgreSQL, Bitcoin RPC, S3 — tudo isso mora aqui. São detalhes.

A filosofia: você deveria conseguir trocar o NestJS por Fastify sem alterar nenhum use case. Trocar PostgreSQL por CockroachDB sem alterar nenhuma entidade. Isso não é hipotético — é o teste de que a arquitetura está correta.

---

## DDD: o vocabulário do negócio no código

Domain-Driven Design complementa a Arquitetura Limpa definindo **como modelar** o domínio, não só onde ele mora.

### Linguagem Ubíqua (Ubiquitous Language)

O mesmo vocabulário que o negócio usa deve ser o vocabulário do código. Se o produto chama de "saque", o código tem `Withdrawal`, não `MoneyTransferOut`. Se o produto chama de "confirmação", o código tem `DepositConfirmed`, não `TransactionStatusUpdated`.

Para uma plataforma de criptomoedas, o glossário inclui termos precisos:

| Termo do negócio | Representação no código |
|-----------------|------------------------|
| Conta | `Account` |
| Saldo | calculado via `LedgerEntry` — nunca campo `balance` |
| Depósito | `Transaction` com type `deposit` + `DepositConfirmed` event |
| Saque | `Withdrawal` entity com estado próprio |
| Confirmação Bitcoin | `BitcoinTransaction.confirmations` |
| Satoshi | `Satoshi` value object |
| Endereço Bitcoin | `BitcoinAddress` value object |
| KYC | `KycProfile` aggregate |

### Aggregates e Aggregate Roots

Um aggregate é um cluster de objetos tratados como unidade para fins de consistência.

`Account` é um aggregate root. `KycProfile` e `KycDocument` pertencem ao aggregate de Account. Regra: você acessa `KycDocument` sempre através de `Account` — nunca diretamente.

Isso garante invariantes: você não pode ter um `KycDocument` sem um `KycProfile`, e não pode ter um `KycProfile` sem uma `Account`.

Para transações financeiras, `Transaction` é um aggregate root. `LedgerEntry` pertence ao aggregate de `Transaction`. Você nunca cria um `LedgerEntry` diretamente — apenas através do processo de confirmar uma `Transaction`.

### Bounded Contexts

Uma plataforma de criptomoedas tem múltiplos contextos com vocabulários distintos:

```
[ Identity & KYC ]     [ Financial Ledger ]     [ Bitcoin Network ]
  Account                 Transaction              BitcoinTransaction
  KycProfile              LedgerEntry              BitcoinAddress
  KycDocument             Withdrawal               Confirmation
```

Esses contextos interagem, mas são independentes. O contexto de "Bitcoin Network" não conhece `Account`. O contexto de "Financial Ledger" não conhece KYC. A comunicação entre eles acontece por eventos ou por um anti-corruption layer.

---

## Inversão de Dependência na prática

O padrão concreto que implementa a Regra de Dependência:

```typescript
// domain/repositories/transaction.repository.ts
// Abstract class de domínio — sem imports de infra.
// Abstract class em vez de interface: existe no runtime, funciona como token de injeção NestJS.
export abstract class TransactionRepository {
  abstract findById(id: string): Promise<Transaction | null>
  abstract save(transaction: Transaction): Promise<void>
  abstract findByAccountId(accountId: string): Promise<Transaction[]>
}

// infra/database/transaction.postgres.repository.ts
// Implementação — conhece PostgreSQL, mas não conhece use cases
@Injectable()
export class TransactionPostgresRepository extends TransactionRepository {
  constructor(private readonly db: DatabaseService) { super() }

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.db.query(FIND_TRANSACTION_BY_ID, [id])
    return row.rows[0] ? this.toDomain(row.rows[0]) : null
  }

  private toDomain(row: TransactionRow): Transaction {
    // Converte linha do banco → entidade de domínio
  }
}

// application/usecases/confirm-deposit.usecase.ts
// Use case — depende da abstract class, nunca da implementação concreta
export class ConfirmDepositUseCase {
  constructor(private readonly transactions: TransactionRepository) {}
}
```

O NestJS usa a abstract class como token de injeção. No módulo: `{ provide: TransactionRepository, useClass: TransactionPostgresRepository }`. O use case não sabe da diferença.

---

## Tratamento de erros como cidadão de primeira classe

Erros de domínio são parte do modelo, não exceções inesperadas.

```typescript
// domain/errors/domain.error.ts
export abstract class DomainError extends Error {
  abstract readonly code: string
}

export class InsufficientBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE'
  constructor(readonly available: bigint, readonly requested: bigint) {
    super(`Balance insufficient: available ${available}, requested ${requested}`)
  }
}

export class AccountSuspendedError extends DomainError {
  readonly code = 'ACCOUNT_SUSPENDED'
}

export class KycNotApprovedError extends DomainError {
  readonly code = 'KYC_NOT_APPROVED'
}
```

Use cases lançam erros tipados. Controllers os mapeiam para status HTTP:

```typescript
// interface-adapters/http/withdrawal.controller.ts
try {
  await this.requestWithdrawal.execute(input)
} catch (error) {
  if (error instanceof InsufficientBalanceError) return res.status(422)
  if (error instanceof KycNotApprovedError)      return res.status(403)
  if (error instanceof AccountSuspendedError)    return res.status(403)
  throw error // inesperado → vira 500
}
```

---

## Precisão monetária

Bitcoin opera em satoshis — inteiros, sem decimais. JavaScript tem `bigint` nativo desde ES2020.

**Regra:** Todo valor monetário é `bigint` no domínio. A conversão de/para representação humana (BTC com 8 casas decimais) acontece na camada de apresentação, não no domínio.

```typescript
// Value object Satoshi — sem float jamais
export class Satoshi {
  private constructor(private readonly value: bigint) {}

  static of(value: bigint): Satoshi {
    if (value < 0n) throw new InvalidSatoshiError(value)
    return new Satoshi(value)
  }

  add(other: Satoshi): Satoshi { return new Satoshi(this.value + other.value) }
  subtract(other: Satoshi): Satoshi {
    if (other.value > this.value) throw new InsufficientBalanceError()
    return new Satoshi(this.value - other.value)
  }

  toBigInt(): bigint { return this.value }
  toSatoshiString(): string { return this.value.toString() }
  toBtcString(): string { return (Number(this.value) / 1e8).toFixed(8) }
}
```

---

## Transações atômicas sem vazar detalhes de infra

O ADR 0001 define o padrão `DatabaseService` + `Transaction`. O desafio é: como os use cases usam transações sem importar PostgreSQL?

A solução: um contrato de unidade de trabalho (Unit of Work):

```typescript
// domain/unit-of-work.ts
// Abstract class — existe no runtime, usada como token de injeção NestJS
export abstract class UnitOfWork {
  abstract run<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T>
  abstract readonly transactionRepository: TransactionRepository
  abstract readonly ledgerRepository: LedgerRepository
}

// application/usecases/confirm-deposit.usecase.ts
export class ConfirmDepositUseCase {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: ConfirmDepositInput): Promise<void> {
    await this.uow.run(async (uow) => {
      const transaction = await uow.transactionRepository.findById(input.transactionId)
      transaction.confirm(input.confirmations)
      await uow.transactionRepository.save(transaction)
      
      const entry = LedgerEntry.credit(transaction.accountId, transaction.amount)
      await uow.ledgerRepository.save(entry)
    })
  }
}
```

O use case não sabe que existe `BEGIN`/`COMMIT`. A implementação `PostgresUnitOfWork` cuida disso internamente usando o `DatabaseService` do ADR 0001.

---

## Escalabilidade: o que a arquitetura viabiliza

A Arquitetura Limpa não garante escalabilidade por si só — mas ela **não a impede**. Quando o domínio é isolado:

1. **Extrair um microserviço** significa pegar um bounded context e colocar em outro repositório. A interface de repositório vira uma chamada gRPC ou HTTP. O use case não muda.

2. **Processar eventos assíncronos** significa publicar domain events em uma fila (Kafka, SQS). Os handlers existentes continuam iguais, agora chamados por um consumer de fila em vez de diretamente.

3. **Adicionar cache** significa decorar a implementação do repositório com uma camada de cache. O use case não sabe.

4. **Escalar leitura e escrita separadamente** (CQRS) significa ter repositórios de leitura separados dos de escrita. Os use cases de query usam read models. Os use cases de command escrevem no modelo de escrita.

O `mybitcoin-api` deve ser construído de forma que essas evoluções sejam possíveis sem reescritas.
