# Análise Arquitetural de Sistemas Similares de Matching

**Objetivo deste documento:** Analisar motor de matching real de outra plataforma (projeto externo de estudo, não cópia), identificar o que funcionou bem e o que deveria ter sido feito de outra forma, para aplicar esses aprendizados no `mybitcoin-api`.

---

## O que o serviço faz

O projeto analisado é um motor de matching engine real de uma plataforma similar. Ele recebe ordens de compra (BID) e venda (ASK) de usuários, encontra pares compatíveis no livro de ordens e liquida as negociações, atualizando saldos e coletando taxas em tempo real.

O ciclo de vida completo de uma negociação:

```
Usuário coloca ordem
  → Saldo é bloqueado (free → lock)
  → Ordem entra no livro
  → Motor busca contraparte compatível
  → Execução: saldos são liquidados, taxas debitadas
  → WebSocket notifica todos os clientes do novo estado do livro
```

Seis domínios compõem o serviço: **User, Currency, Market, Order, Balance, Fees**.

---

## O que foi aplicado corretamente

### 1. A separação em camadas existe e é respeitada

O serviço segue a divisão em quatro camadas da Arquitetura Limpa:

```
domain/       → regras de negócio, entidades, contratos
infra/        → implementações concretas (TypeORM, BigNumber, Socket.io)
presenters/   → controllers HTTP
main/         → composição de dependências (factories)
```

O código de domínio não importa nada de `infra/`. Os repositórios são acessados por interfaces (`protocols/repositories/`), nunca diretamente. Isso é a base de tudo — está correta.

### 2. O padrão de repositórios com interfaces funciona

Cada domínio define sua interface de repositório em `domain/protocols/repositories/`. A implementação TypeORM fica em `infra/postgres/repositories/`. Os use cases recebem apenas a interface, nunca a implementação concreta.

Isso permite:
- Trocar PostgreSQL por outro banco sem alterar nenhuma linha de lógica de negócio
- Testar use cases com mocks triviais
- Raciocinar sobre o domínio sem pensar em SQL

### 3. Factories como raiz de composição

O diretório `main/factories/` é a única parte do sistema que sabe quais implementações concretas existem. Ele monta a cadeia:

```
makeAddBalanceController()
  → makeAddBalanceUsecase()
    → makeBalanceRepository()     ← implementação TypeORM
    → makeCurrencyRepository()    ← implementação TypeORM
    → makeLogTrackerGateway()     ← cliente HTTP externo
```

Nenhuma camada de negócio conhece essa montagem. É correto e é o que viabiliza o restante.

### 4. Precisão matemática via adapter

Valores monetários são inteiros multiplicados por `1e12`. Toda aritmética passa pelo `MathAdapter` (wrapper sobre BigNumber.js), definido como interface em `domain/protocols/math/`. O código de negócio nunca opera com floats nativos do JavaScript.

Isso evita a categoria inteira de bugs de arredondamento que derrubou sistemas financeiros reais.

### 5. O conceito de Charger é um Value Object implícito

O usuário especial `charger` que acumula todas as taxas da plataforma é tratado de forma distinta pelo repositório (`getCharger()`). É uma decisão de domínio válida — a exchange em si é uma entidade participante de todas as ordens como coletora de fees.

---

## O que deveria ter sido feito de outra forma

### Problema 1: Entidades de domínio acopladas à infraestrutura

**O que acontece hoje:**  
As entidades `Order` e `Balance` recebem o `MathAdapter` no construtor e usam a constante `PRECISION = 1_000_000_000_000` internamente.

```typescript
// domain/entities/order.ts — como está
class Order {
  constructor(private readonly math: MathAdapter, private readonly precision: number) {}

  total() {
    return this.math.multiply(this.quantity, this.price).dividedBy(this.precision)
  }
}
```

**Por que é um problema:**  
A entidade de domínio deveria expressar regras de negócio em termos do próprio domínio — "o total de uma ordem é preço × quantidade". Como ela converte para inteiros de precisão é um detalhe de infraestrutura. Ao injetar `MathAdapter` e `PRECISION` na entidade, o domínio passa a conhecer a decisão de como os valores são armazenados no banco.

**Como deveria ser:**  
A entidade opera com valores já convertidos. A responsabilidade de converter `float → int × 1e12` pertence à camada de infra (repositório), na fronteira entre persistência e domínio.

```
Repository.findOrder() → converte BigInt do banco → entidade recebe valor limpo
Repository.save(order) → converte valor da entidade → BigInt para o banco
```

A entidade só precisa saber que `total = price × quantity`. Nada mais.

---

### Problema 2: WebSocket dentro do Use Case

**O que acontece hoje:**  
`CreateOrderUseCase` recebe um `WebSocketAdapter` e emite eventos diretamente após criar a ordem.

**Por que é um problema:**  
Use cases são casos de uso de negócio puro. "Notificar clientes em tempo real" é um efeito colateral de apresentação, não uma regra de negócio. Se você quiser usar o mesmo use case para uma API REST sem WebSocket (testes, CLI, batch), ele carrega um adaptador WebSocket desnecessário.

**Como deveria ser:**  
O use case retorna o resultado. O controller (ou um event dispatcher na camada de apresentação) decide como reagir — incluindo emitir o evento WebSocket.

```
CreateOrderUseCase.execute() → retorna { order, orderBook }
Controller.handle()          → chama use case → emite WebSocket → responde HTTP
```

---

### Problema 3: Retornos inconsistentes dos repositórios

**O que acontece hoje:**  
- `CurrencyRepository.get()` retorna uma instância da classe `Currency` (entidade)
- `MarketRepository.getByName()` retorna `MarketParams` (interface de dados)
- `BalanceRepository.get()` retorna `BalanceData` (interface de dados)
- `OrderRepository.getFirstOrderMarket()` retorna `Order` (entidade com métodos)

Quem consome o repositório nunca sabe ao certo o que vai receber.

**Como deveria ser:**  
Repositórios sempre retornam o mesmo tipo para o mesmo domínio. Se a entidade de domínio é `Order`, o repositório retorna `Order`. Se é uma interface `OrderData`, sempre retorna `OrderData`. A escolha entre os dois é válida; o que não é válido é misturar.

O padrão mais robusto para Clean Architecture: repositórios retornam entidades de domínio (ou `null` quando não encontrado). As entidades encapsulam comportamento. Interfaces de dados são usadas apenas para parâmetros de entrada.

---

### Problema 4: Lógica de paginação duplicada em repositórios

**O que acontece hoje:**  
`BalanceRepository`, `OrderRepository`, `FeesPaidRepository` e outros repetem o mesmo cálculo de paginação — offset = (page - 1) × pageSize, total de páginas = ceil(count / pageSize).

**Como deveria ser:**  
Um único utilitário ou value object `Pagination` com os parâmetros `page` e `pageSize` e os métodos `offset()` e `totalPages(count)`. Cada repositório recebe um `Pagination` e o usa, sem reimplementar a lógica.

---

### Problema 5: Tratamento de erro inexistente

**O que acontece hoje:**  
- `LogTrackerGateway` captura exceções com `try/catch` vazio — falhas são silenciadas
- Repositórios retornam `boolean` para sucesso/erro sem context algum
- Controllers capturam tudo e retornam 500

**Consequência prática:**  
Quando um repositório retorna `false`, o use case não sabe se foi "saldo insuficiente", "usuário não encontrado" ou "falha de banco". Isso impede respostas de erro úteis para o cliente.

**Como deveria ser:**  
Exceções de domínio tipadas para cada caso de falha esperado:

```typescript
class InsufficientBalanceError extends DomainError {}
class OrderNotFoundError extends DomainError {}
class MarketClosedError extends DomainError {}
```

Use cases lançam exceções tipadas. Controllers as mapeiam para status HTTP adequados (400, 404, 422). Erros inesperados viram 500.

---

### Problema 6: Typos e inconsistências de nomenclatura

- Pasta `usescases/` em vez de `usecases/` (excesso de `s`)
- `substract` em vez de `subtract`
- `requriedFields` em vez de `requiredFields`
- `FeesPaid` model com dois `@JoinColumn({ name: 'user_id' })` — o segundo deveria ser `charger_id`

Não são críticos, mas num sistema financeiro a nomenclatura precisa ser precisa. Quem vai manter o código lida com conceitos como "maker", "taker", "charger" — termos que têm significado específico. Inconsistências aumentam carga cognitiva.

---

### Problema 7: Ausência de domain events

**O que acontece hoje:**  
Quando uma ordem é executada (`ExecuteOrderUseCase`), o use case diretamente:
1. Atualiza as ordens
2. Atualiza saldos
3. Registra histórico
4. Calcula e debita fees
5. Registra fees pagas

Isso cria um use case com muitas responsabilidades. Qualquer nova consequência de uma execução (notificação push, evento de auditoria, webhook externo) exige alterar esse use case.

**Como deveria ser:**  
O use case publica um domain event `OrderExecuted` e retorna. Handlers independentes reagem ao evento:

```
OrderExecuted
  → BalanceSettlementHandler  → atualiza saldos
  → FeeCollectionHandler      → calcula e debita fees
  → OrderHistoryHandler       → registra histórico
  → WebSocketHandler          → emite evento para o livro
```

Cada handler tem uma responsabilidade única. Adicionar um novo efeito não toca o use case.

---

## Resumo das forças e fraquezas

| Aspecto | Avaliação | Detalhe |
|--------|-----------|---------|
| Separação em camadas | Boa | Domain, infra, presenters e main bem delimitados |
| Inversão de dependência | Boa | Repositórios atrás de interfaces |
| Composição via factories | Boa | Raiz de composição centralizada em `main/` |
| Precisão matemática | Boa | MathAdapter abstrai BigNumber corretamente |
| Entidades de domínio | Regular | Acopladas à precisão/math adapter |
| Retornos de repositórios | Ruim | Inconsistentes entre domínios |
| Tratamento de erros | Ruim | Booleanos sem contexto, falhas silenciosas |
| Domain events | Ausente | Use cases acumulam responsabilidades de reação |
| WebSocket no use case | Problema | Efeito colateral de apresentação no coração do negócio |
| Nomenclatura | Regular | Typos e inconsistências existem |

---

Sistemas similares de matching engine entregam um produto funcional com a estrutura correta de Arquitetura Limpa. As violações são incrementais — nenhuma invalida o design, mas cada uma reduz a capacidade de evoluir o sistema sem risco.
