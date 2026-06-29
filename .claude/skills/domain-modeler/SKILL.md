---
name: domain-modeler
description: Modela um novo conceito de domínio (entidade, value object, aggregate, domain event) ANTES de implementar. Faz as perguntas certas de DDD, determina o tipo de artefato, define invariantes, projeta a interface do repositório e os domain events. Gatilhos válidos — (1) slash command /domain-modeler; (2) usuário pede "modelar um domínio", "como modelar X em DDD", "é entidade ou value object?", "projetar o aggregate de Y", "quais invariantes para Z". Produz um documento de modelagem e PARA para aprovação antes de qualquer código. NÃO escreve código de produção. NÃO invocar automaticamente.
---

# Domain Modeler — mybitcoin-api

Você projeta conceitos de domínio antes do código. A modelagem errada cria débito difícil de reverter — uma entidade que deveria ser Value Object, um aggregate que deveria ser separado, invariantes que ficaram de fora.

**Princípio:** o modelo deve falar a linguagem do negócio, não da implementação.

---

## Passo 0 — Identificar o conceito

**Alvo de `$ARGUMENTS`:** nome ou descrição do conceito a modelar (ex: "Ordem de compra", "Endereço Bitcoin", "Taxa de transação").

Antes de qualquer análise, leia:
1. `docs/bussiness/03-modelo-de-dominio.md` — conceitos já modelados, linguagem ubíqua
2. O documento de negócio relevante ao contexto do conceito
3. ADRs relacionados (especialmente schema se já houver tabela)

**Extraia a linguagem ubíqua usada nos documentos** — use os mesmos termos, nunca invente sinônimos.

---

## Passo 1 — Perguntas de modelagem

Faça estas perguntas ao usuário (agrupe em uma só mensagem, não uma por vez):

### 1.1 — Identidade

- O conceito existe independentemente ou é sempre parte de outro? (ex: uma "linha de item de pedido" só existe dentro de um "pedido")
- Se dois exemplos deste conceito tiverem exatamente os mesmos valores, são o mesmo conceito ou dois diferentes? (ex: dois endereços Bitcoin iguais são o mesmo? dois usuários com o mesmo e-mail são o mesmo?)
- O conceito é identificado por um ID gerado pelo sistema, ou é definido pelos seus próprios valores?

**Resposta guia:**
- Identificado por ID + existe independentemente → **Entidade**
- Definido pelos seus valores + intercambiável → **Value Object**
- Raiz de um cluster de objetos relacionados → **Aggregate Root**

### 1.2 — Ciclo de vida e estado

- O conceito muda de estado ao longo do tempo? Se sim, quais estados existem?
- Quais transições são válidas? (ex: PENDING → ACTIVE → CANCELLED, mas não CANCELLED → ACTIVE)
- O que dispara cada transição?
- O conceito pode ser deletado, ou é imutável após criação?

### 1.3 — Invariantes

- O que nunca pode ser verdade neste conceito? (ex: "saldo nunca pode ser negativo", "ordem cancelada não pode ser executada")
- Quais campos são obrigatórios na criação?
- Há validações de formato ou valor? (ex: "endereço Bitcoin deve ser um formato válido", "amount > 0")
- Quais combinações de campos são inválidas? (ex: "se type = LIMIT, price é obrigatório")

### 1.4 — Relacionamentos

- De quais outros conceitos este depende?
- Quais conceitos dependem dele?
- Ele pertence a um Aggregate? Se sim, quem é o Aggregate Root?
- Como ele se comunica com outros bounded contexts? (direto? via evento?)

### 1.5 — Comportamentos

- Quais operações fazem sentido neste conceito?
- Quais operações NÃO fazem sentido? (ex: não faz sentido "calcular taxa" dentro de "Wallet" — isso pertence a "Trade")
- Alguma operação produz efeito colateral observável por outros bounded contexts?

---

## Passo 2 — Decisão de tipo

Com base nas respostas, determine o tipo:

### Entidade
- Tem identidade própria (`id: string | UUID`)
- Pode mudar de estado ao longo do tempo
- Dois objetos com os mesmos valores ainda são diferentes se tiverem IDs diferentes
- **Exemplos neste projeto:** `Account`, `Transaction`, `Order`, `Trade`

```typescript
// Estrutura de entidade
class Account {
  private constructor(
    readonly id: string,
    readonly email: Email,        // VO
    private _status: AccountStatus,
    readonly createdAt: Date,
  ) {}

  static create(props: CreateAccountProps): Account { ... }  // factory com invariantes

  activate(): Account { ... }    // retorna nova instância — imutabilidade
  suspend(): Account { ... }
}
```

### Value Object
- Sem identidade — definido pelos seus valores
- Imutável — métodos retornam nova instância
- Intercambiável — `Satoshi.of(100n)` === `Satoshi.of(100n)`
- **Exemplos neste projeto:** `Satoshi`, `Email`, `BitcoinAddress`, `KycStatus`

```typescript
// Estrutura de Value Object
class Satoshi {
  private constructor(private readonly value: bigint) {
    if (value < 0n) throw new InvalidSatoshiError(value)
  }

  static of(value: bigint): Satoshi { return new Satoshi(value) }

  add(other: Satoshi): Satoshi { return new Satoshi(this.value + other.value) }
  subtract(other: Satoshi): Satoshi {
    if (other.value > this.value) throw new InsufficientAmountError(this.value, other.value)
    return new Satoshi(this.value - other.value)
  }
  toBigInt(): bigint { return this.value }
  equals(other: Satoshi): boolean { return this.value === other.value }
}
```

### Aggregate
- Cluster de entidades e VOs tratados como unidade
- Aggregate Root é a única entrada — nada de fora acessa os internos diretamente
- Invariantes do cluster são garantidas pelo Root
- **Exemplos neste projeto:** `Order` (root) + `OrderFill` (entidade interna); `Account` (root) + `KycProfile` (entidade interna)

### Domain Event
- Fato ocorrido no passado — nome no passado
- Imutável, sem comportamento
- **Exemplos neste projeto:** `DepositConfirmed`, `OrderMatched`, `AccountSuspended`

```typescript
// Estrutura de Domain Event
class DepositConfirmed {
  readonly occurredAt: Date

  constructor(
    readonly transactionId: string,
    readonly accountId: string,
    readonly amountSatoshi: bigint,
    readonly confirmations: number,
  ) {
    this.occurredAt = new Date()
  }
}
```

---

## Passo 3 — Projetar os invariantes

Liste cada invariante como:
1. Nome (`INV-LOCAL-001`)
2. Descrição em linguagem de negócio
3. Onde é verificada (construtor, factory, método de transição)
4. O que lança quando violada (`DomainError` tipado)

```
Invariantes do conceito Order:
  INV-ORD-001: amount > 0
    Verificada em: Order.create()
    Erro: InvalidOrderAmountError

  INV-ORD-002: tipo LIMIT exige price; tipo MARKET não aceita price
    Verificada em: Order.create()
    Erro: InvalidOrderTypeError

  INV-ORD-003: ordem CANCELLED não pode ser executada
    Verificada em: Order.execute()
    Erro: OrderAlreadyCancelledError
```

---

## Passo 4 — Projetar o repositório (abstract class)

**Apenas se o conceito for Entidade ou Aggregate Root** (VOs não têm repositório próprio).

```typescript
// Regras:
// - Abstract class, sem prefixo: OrderRepository (nunca IOrderRepository)
// - Existe no runtime → NestJS usa como token de injeção diretamente
// - Métodos find* retornam entidade ou null — nunca undefined, nunca boolean
// - Métodos save/delete retornam void — nunca boolean
// - Fica em src/domain/<contexto>/<nome>.repository.ts
//
// No módulo NestJS:
//   { provide: OrderRepository, useClass: OrderPostgresRepository }
// No use case:
//   constructor(private readonly orders: OrderRepository) {}
// Na implementação:
//   @Injectable()
//   export class OrderPostgresRepository extends OrderRepository { ... }

export abstract class OrderRepository {
  abstract findById(id: string): Promise<Order | null>
  abstract findByAccountId(accountId: string, pagination: Pagination): Promise<Order[]>
  abstract findOpenByMarket(marketId: string): Promise<Order[]>
  abstract save(order: Order): Promise<void>
  abstract delete(orderId: string): Promise<void>
}
```

---

## Passo 5 — Projetar os domain events

Liste os eventos emitidos pelo conceito e quando:

```
Eventos de Order:
  OrderPlaced        — emitido em Order.create()
  OrderCancelled     — emitido em Order.cancel()
  OrderPartiallyFilled — emitido em Order.fill() quando quantidade parcial
  OrderFullyFilled   — emitido em Order.fill() quando quantidade total
```

---

## Passo 6 — Identificar erros tipados necessários

```typescript
// src/domain/<contexto>/<nome>.errors.ts
export class InvalidOrderAmountError extends DomainError { ... }
export class OrderAlreadyCancelledError extends DomainError { ... }
export class InsufficientLockedBalanceError extends DomainError { ... }
```

---

## Formato de entrega

```markdown
## Modelo de domínio: <NomeDoConceito>

### Tipo: <Entidade | Value Object | Aggregate Root | Domain Event>
**Motivo:** <por que este tipo e não outro>

### Bounded Context: <contexto>

### Linguagem ubíqua adotada
- <termo usado no projeto e o que significa>

### Invariantes
| ID | Regra | Verificada em | Erro tipado |
|----|-------|--------------|------------|
| INV-<CTX>-001 | ... | Order.create() | InvalidOrderAmountError |

### Repositório (abstract class)
```typescript
export abstract class <Nome>Repository {
  abstract findById(id: string): Promise<<Nome> | null>
  abstract save(<nome>: <Nome>): Promise<void>
}
```

### Domain Events emitidos
| Evento | Quando |
|--------|--------|
| <NomeNoPassado> | Em qual método |

### Erros tipados a criar
- `<Nome>Error extends DomainError`

### Estrutura sugerida de arquivos
```
src/domain/<contexto>/
├── <nome>.entity.ts        (ou .value-object.ts)
├── <nome>.repository.ts    (se entidade/aggregate)
├── <nome>.errors.ts
└── <nome>.events.ts        (se emite eventos)
```

### Decisões e trade-offs
- <decisão tomada e por que>
- <alternativa considerada e por que foi descartada>

### Perguntas não respondidas
- [ ] <algo que precisa de confirmação antes de implementar>
```

---

## Gate humano

Após exibir o modelo, **PARE**. Não implemente.

Diga: "Modelo pronto. Confirme para prosseguir, ou ajuste o que for necessário. Para implementar, use `/task-planner` para montar o plano de arquivos e ordem de criação."

**Sinal para criar ADR primeiro:** se o modelo introduz novo schema SQL, novo bounded context ou muda a forma como dois contextos se comunicam → sugira `/adr-architect` antes de implementar.
