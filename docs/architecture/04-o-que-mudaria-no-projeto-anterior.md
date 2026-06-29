# Padrões a Evoluir em Sistemas de Matching

**Objetivo:** Responder à pergunta "como deveria ter sido feito?" com exemplos concretos, baseados em lições aprendidas com sistemas similares de matching engine.

Este documento não é uma crítica ao que foi construído — é um mapa de evolução. O objetivo aqui é identificar o que adotar no `mybitcoin-api` e o que evitar.

---

## 1. Entidades sem dependência de infraestrutura

**O que existe hoje:**

```typescript
// domain/entities/order.ts — atual
class Order {
  constructor(
    private readonly math: MathAdapter,  // ← dependência de infra
    private readonly precision: number,  // ← detalhe de armazenamento
  ) {}

  getTotal(): number {
    return this.math.multiply(this.quantity, this.price).dividedBy(this.precision)
  }
}
```

**O que deveria ser:**

A entidade expressa regras de negócio em termos do domínio. Satoshi é inteiro — não existe "converter por precisão" no nível da entidade.

```typescript
// domain/order/order.entity.ts — como deveria ser
export class Order {
  private constructor(
    readonly id: string,
    readonly quantity: Satoshi,
    readonly price: Satoshi,
    readonly side: OrderSide,
    readonly status: OrderStatus,
    readonly remainingQuantity: Satoshi,
  ) {}

  get total(): Satoshi {
    // Regra de negócio pura: total = quantity × price
    // Satoshi encapsula a aritmética sem floats
    return this.quantity.multiplyBy(this.price)
  }

  canBeMatchedWith(other: Order): boolean {
    if (this.side === other.side) return false
    if (this.side === OrderSide.BID) return this.price.gte(other.price)
    return other.price.gte(this.price)
  }

  execute(executedQuantity: Satoshi): Order {
    const newRemaining = this.remainingQuantity.subtract(executedQuantity)
    const newStatus = newRemaining.isZero() ? OrderStatus.CLOSED : OrderStatus.OPEN
    return new Order(this.id, this.quantity, this.price, this.side, newStatus, newRemaining)
  }
}
```

A conversão de bigint do banco para `Satoshi` acontece no repositório, na fronteira com o banco. A entidade nunca vê SQL nem BigNumber.

---

## 2. Domain Events em vez de side effects no use case

**O que existe hoje:**

`ExecuteOrderUseCase` orquestra diretamente: atualiza ordens, atualiza saldos, registra histórico, calcula fees, debita fees, emite WebSocket. Qualquer nova consequência de uma execução exige alterar esse use case.

**O que deveria ser:**

O use case faz o essencial — executa a lógica central — e publica um evento. Handlers independentes reagem:

```typescript
// application/order/execute-order.usecase.ts
export class ExecuteOrderUseCase {
  constructor(
    private readonly orders: IOrderRepository,
    private readonly events: EventDispatcher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: ExecuteOrderInput): Promise<ExecuteOrderOutput> {
    return this.uow.run(async (uow) => {
      const takerOrder = await uow.orders.findById(input.takerOrderId)
      const makerOrder = await uow.orders.findBestMatch(takerOrder)

      if (!makerOrder) {
        return { matched: false }
      }

      const match = takerOrder.match(makerOrder)
      
      await uow.orders.save(match.updatedTaker)
      await uow.orders.save(match.updatedMaker)

      // Use case termina aqui. Consequências são responsabilidade dos handlers.
      await this.events.dispatch(new OrderMatched({
        matchId: match.id,
        takerOrder: match.updatedTaker,
        makerOrder: match.updatedMaker,
        executedQuantity: match.executedQuantity,
        executedPrice: match.executedPrice,
      }))

      return { matched: true, matchId: match.id }
    })
  }
}

// Handlers independentes — cada um com uma responsabilidade
class BalanceSettlementHandler {
  async handle(event: OrderMatched) {
    // Credita/debita saldos de maker e taker
  }
}

class FeeCollectionHandler {
  async handle(event: OrderMatched) {
    // Calcula e registra fees
  }
}

class OrderBookBroadcastHandler {
  async handle(event: OrderMatched) {
    // Emite evento WebSocket para atualizar o livro
  }
}
```

Adicionar um novo efeito (ex: webhook externo, notificação push) = criar um novo handler. Zero alterações no use case.

---

## 3. Retornos consistentes dos repositórios

**O que existe hoje:**

O mesmo sistema tem repositórios retornando entidades, interfaces de dados e primitivos misturados sem padrão.

**O que deveria ser:**

Repositórios de leitura retornam entidades de domínio (ou `null`). Repositórios de escrita retornam `void` (ou lançam exceção em caso de falha).

```typescript
export interface IOrderRepository {
  // Leitura → entidade ou null
  findById(id: string): Promise<Order | null>
  findBestMatch(order: Order): Promise<Order | null>
  findByMarket(marketId: string, filters: OrderFilters): Promise<PagedResult<Order>>

  // Escrita → void (ou exceção)
  save(order: Order, uow?: UnitOfWork): Promise<void>
  cancel(orderId: string, userId: string, uow?: UnitOfWork): Promise<void>
}
```

`PagedResult<T>` é um type genérico que encapsula o padrão de paginação:

```typescript
export interface PagedResult<T> {
  items: T[]
  totalItems: number
  currentPage: number
  totalPages: number
}
```

Definido uma vez, usado em todos os repositórios que paginam.

---

## 4. Erros tipados em vez de booleanos

**O que existe hoje:**

```typescript
// Repositório retorna boolean
async lockBalance(...): Promise<boolean>

// Use case recebe boolean sem contexto
const locked = await this.balanceRepo.lock(params)
if (!locked) {
  // Por que falhou? Saldo insuficiente? Usuário inexistente? Deadlock de banco?
  return { error: 'Lock failed' }
}
```

**O que deveria ser:**

```typescript
// Repositório lança exceção tipada
async lock(userId: string, amount: Satoshi, uow: UnitOfWork): Promise<void> {
  const balance = await this.findByUserId(userId)
  if (!balance) throw new AccountNotFoundError(userId)
  if (!balance.hasSufficientFree(amount)) {
    throw new InsufficientBalanceError(balance.free, amount)
  }
  await uow.query(QUERIES.lockBalance, [userId, amount.toBigInt()])
}

// Use case pode capturar o que faz sentido capturar
async execute(input: CreateOrderInput): Promise<void> {
  try {
    await this.balance.lock(input.userId, input.quantity)
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      throw new OrderRejectedError('Insufficient balance', { cause: error })
    }
    throw error  // Outros erros propagam
  }
}

// Controller mapeia para HTTP
if (error instanceof OrderRejectedError) return { status: 422, body: error.toResponse() }
```

---

## 5. WebSocket como reação, não como injeção

**O que existe hoje:**

`CreateOrderUseCase` recebe `WebSocketAdapter` no construtor e emite eventos diretamente.

**O que deveria ser:**

O use case publica `OrderCreated` event. Um handler de infraestrutura emite o WebSocket:

```typescript
// interface-adapters/events/order-book-broadcast.handler.ts
@Injectable()
export class OrderBookBroadcastHandler {
  constructor(
    private readonly socket: WebSocketGateway,
    private readonly orders: IOrderRepository,
  ) {}

  @OnEvent(OrderCreated.name)
  async handle(event: OrderCreated): Promise<void> {
    const orderBook = await this.orders.getOrderBook(event.marketId)
    this.socket.emit('orderBook', event.marketId, orderBook)
  }
}
```

O use case de criação de ordem não tem nenhuma referência a WebSocket.

---

## 6. SQL centralizado em vez de inline

**O que existe hoje:**

SQL construído inline dentro dos métodos dos repositórios TypeORM. Para operações complexas (como `getInfo24hrs` com múltiplos agregados), o SQL fica misturado com lógica de transformação de dados.

**O que o mybitcoin-api já estabeleceu:**

A pasta `src/modules/<ctx>/infrastructure/persistence/*.sql.ts` foi criada exatamente para isso — SQL nomeado, separado da lógica de repositório.

```typescript
// modules/financial/infrastructure/persistence/transaction.sql.ts
export const TRANSACTION_QUERIES = {
  findTransactionById: `
    SELECT id, account_id, type, amount_satoshi, status, bitcoin_transaction_id, created_at
    FROM transactions
    WHERE id = $1
  `,
  
  findLedgerBalance: `
    SELECT
      SUM(CASE WHEN direction = 'credit' THEN amount_satoshi ELSE 0 END) -
      SUM(CASE WHEN direction = 'debit'  THEN amount_satoshi ELSE 0 END) AS balance_satoshi
    FROM ledger_entries
    WHERE account_id = $1
  `,
  
  insertLedgerEntry: `
    INSERT INTO ledger_entries (transaction_id, account_id, amount_satoshi, direction)
    VALUES ($1, $2, $3, $4)
    RETURNING id, created_at
  `,
} as const
```

Repositórios importam as queries por nome. DBA pode auditar todo SQL sem ler código TypeScript.

---

## Padrões a adotar do sistema de referência

| Padrão | Adotar? | Nota |
|--------|-----------|------|
| Domínio isolado (entities, protocols, usecases) | Sim | Estrutura correta, refinar nomenclatura |
| Interfaces de repositório por domínio | Sim | Manter contrato claro |
| Factory como raiz de composição | Adaptar | NestJS substitui factories manuais com injeção de dependências |
| MathAdapter abstraindo BigNumber | Não | No mybitcoin-api usar `bigint` nativo do TS + value object `Satoshi` |
| Precisão 1e12 nas entidades | Não | Precisão pertence à infraestrutura, não às entidades |
| WebSocket dentro do use case | Não | WebSocket é efeito colateral de apresentação |
| Boolean como retorno de erro | Não | Exceções tipadas com `DomainError` |
| Paginação duplicada por repositório | Não | `PagedResult<T>` genérico, uma implementação |
| Typos em nomes | Não | `usecases` (sem o 's' extra), `subtract`, etc. |
| Conceito de Charger/Fee account | Sim | Conta especial da plataforma é válida no modelo de domínio |

---

## Síntese

Sistemas similares de matching engine provaram que a separação por camadas funciona — o produto entregou, a lógica está isolável. O que falta é consistência nos detalhes: retornos padronizados, erros que comunicam contexto, entidades que não carregam detalhes de persistência.

O `mybitcoin-api` tem a oportunidade de começar com esses refinamentos desde o início, sem o peso de refatorar um sistema em produção.
