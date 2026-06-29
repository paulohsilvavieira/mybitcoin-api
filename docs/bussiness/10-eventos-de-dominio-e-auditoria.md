# Eventos de Domínio, Event Sourcing e Auditoria

## 1. Visão Geral

A Exchange adota uma arquitetura orientada a eventos (Event-Driven Architecture) utilizando Event Sourcing como mecanismo principal de persistência de mudanças de estado.

Nesse modelo:

* O estado atual não é a fonte da verdade.
* A fonte da verdade é a sequência imutável de eventos de domínio.
* Toda alteração relevante gera um evento.
* O estado atual é derivado da reprodução desses eventos.

```text
Comando
   │
   ▼
Validação
   │
   ▼
Evento de Domínio
   │
   ▼
Event Store
   │
   ▼
Projeções
   │
   ▼
Read Models
```

---

# 2. Eventos de Domínio

## Conceito

Um Evento de Domínio representa algo que aconteceu no negócio e que não pode ser alterado após sua gravação.

Características:

| Característica | Descrição                           |
| -------------- | ----------------------------------- |
| Imutável       | Nunca é atualizado                  |
| Temporal       | Possui data e hora                  |
| Auditável      | Mantém histórico completo           |
| Reproduzível   | Permite reconstrução de estado      |
| Versionado     | Evolui sem perda de compatibilidade |

---

## Estrutura Base

Todos os eventos seguem um envelope padrão.

```json
{
  "eventId": "evt_01JXYZ",
  "eventType": "OrderCreated",
  "aggregateId": "ord_123",
  "aggregateType": "Order",
  "version": 5,
  "timestamp": "2026-05-30T12:00:00Z",
  "userId": "usr_456",
  "correlationId": "cmd_789",
  "payload": {}
}
```

---

# 3. Eventos Principais

## Usuários

### UserRegistered

```json
{
  "userId": "usr_123",
  "email": "user@email.com"
}
```

### UserVerified

```json
{
  "userId": "usr_123",
  "verificationLevel": "BASIC"
}
```

---

## Wallet

### WalletCreated

```json
{
  "walletId": "wal_001",
  "userId": "usr_123",
  "asset": "BTC"
}
```

---

### BalanceCredited

```json
{
  "walletId": "wal_001",
  "asset": "BTC",
  "amount": "0.50000000",
  "reason": "DEPOSIT"
}
```

---

### BalanceDebited

```json
{
  "walletId": "wal_001",
  "asset": "BTC",
  "amount": "0.10000000",
  "reason": "WITHDRAWAL"
}
```

---

### BalanceLocked

```json
{
  "walletId": "wal_001",
  "asset": "BRL",
  "amount": "50000.00",
  "orderId": "ord_001"
}
```

---

### BalanceUnlocked

```json
{
  "walletId": "wal_001",
  "asset": "BRL",
  "amount": "50000.00",
  "orderId": "ord_001"
}
```

---

## Ordens

### OrderCreated

```json
{
  "orderId": "ord_001",
  "userId": "usr_123",
  "symbol": "BTCBRL",
  "side": "BUY",
  "type": "LIMIT",
  "price": "500000",
  "quantity": "0.10000000"
}
```

---

### OrderAccepted

```json
{
  "orderId": "ord_001"
}
```

---

### OrderRejected

```json
{
  "orderId": "ord_001",
  "reason": "INSUFFICIENT_BALANCE"
}
```

---

### OrderCancelled

```json
{
  "orderId": "ord_001",
  "reason": "USER_REQUEST"
}
```

---

## Matching Engine

### TradeExecuted

```json
{
  "tradeId": "trd_001",
  "buyOrderId": "ord_buy",
  "sellOrderId": "ord_sell",
  "price": "500000",
  "quantity": "0.10000000"
}
```

---

### OrderPartiallyFilled

```json
{
  "orderId": "ord_001",
  "filledQuantity": "0.05000000",
  "remainingQuantity": "0.05000000"
}
```

---

### OrderFilled

```json
{
  "orderId": "ord_001"
}
```

---

## Liquidação

### SettlementCompleted

```json
{
  "tradeId": "trd_001",
  "buyerId": "usr_buy",
  "sellerId": "usr_sell"
}
```

---

## Administração

### AssetCreated

```json
{
  "asset": "BTC",
  "precision": 8
}
```

---

### TradingPairCreated

```json
{
  "symbol": "BTCBRL",
  "baseAsset": "BTC",
  "quoteAsset": "BRL"
}
```

---

# 4. Event Sourcing

## Conceito

Event Sourcing consiste em armazenar todos os eventos que causaram mudanças de estado ao invés de armazenar apenas o estado final.

### Modelo Tradicional

```text
Wallet
 ├─ Saldo BTC = 1.5
 └─ Saldo BRL = 10000
```

O histórico pode ser perdido.

---

### Modelo Event Sourcing

```text
BalanceCredited
BalanceCredited
BalanceDebited
BalanceLocked
BalanceUnlocked
TradeExecuted
SettlementCompleted
```

O estado atual pode ser reconstruído a qualquer momento.

---

## Benefícios

| Benefício          | Descrição                         |
| ------------------ | --------------------------------- |
| Auditoria Completa | Histórico integral                |
| Rastreabilidade    | Todas as ações são identificáveis |
| Replay             | Reconstrução de estado            |
| Debugging          | Investigação de incidentes        |
| Compliance         | Evidência regulatória             |
| Escalabilidade     | Separação entre escrita e leitura |

---

# 5. Event Store

## Conceito

O Event Store é o repositório oficial de eventos da plataforma.

Ele substitui o conceito tradicional de banco de dados transacional como fonte principal da verdade.

---

## Estrutura Lógica

```text
Event Store
│
├─ User Stream
├─ Wallet Stream
├─ Order Stream
├─ Trade Stream
└─ Market Stream
```

---

## Exemplo de Stream

### Stream da Ordem

```text
OrderCreated
OrderAccepted
OrderPartiallyFilled
OrderPartiallyFilled
OrderFilled
```

---

## Organização

| Campo         | Descrição                 |
| ------------- | ------------------------- |
| EventId       | Identificador único       |
| AggregateId   | Identificador do agregado |
| AggregateType | Tipo do agregado          |
| Version       | Controle de concorrência  |
| Timestamp     | Data do evento            |
| EventType     | Tipo do evento            |
| Payload       | Dados do evento           |

---

## Garantias do Event Store

### Imutabilidade

Eventos nunca podem ser alterados.

```text
INSERT → permitido
UPDATE → proibido
DELETE → proibido
```

---

### Ordenação

Eventos do mesmo Aggregate devem manter ordem estrita.

```text
OrderCreated
OrderAccepted
OrderFilled
```

---

### Persistência

Evento confirmado deve sobreviver a:

* Reinicialização do sistema
* Falha de serviço
* Falha de aplicação

---

### Idempotência

Eventos duplicados não devem produzir efeitos duplicados.

Exemplo:

```text
TradeExecuted
TradeExecuted
```

Resultado esperado:

```text
Trade aplicado apenas uma vez
```

---

# 6. Replay

## Conceito

Replay é o processo de reproduzir eventos históricos para reconstruir um agregado ou projeção.

---

## Reconstrução de Wallet

Eventos:

```text
WalletCreated
BalanceCredited(BTC 1.0)
BalanceCredited(BTC 0.5)
BalanceDebited(BTC 0.2)
```

Replay:

```text
0.0 BTC
+1.0 BTC
+0.5 BTC
-0.2 BTC
```

Resultado:

```text
1.3 BTC
```

---

## Reconstrução de Ordem

Eventos:

```text
OrderCreated
OrderAccepted
OrderPartiallyFilled
OrderPartiallyFilled
OrderFilled
```

Estado final:

```json
{
  "status": "FILLED",
  "filledQuantity": "0.10000000",
  "remainingQuantity": "0.00000000"
}
```

---

## Snapshot

Para evitar replay de milhões de eventos, snapshots periódicos podem ser utilizados.

Exemplo:

```text
Snapshot versão 50.000
+
Eventos 50.001 até 50.250
=
Estado Atual
```

---

# 7. Reconstrução de Estado

## Fonte da Verdade

A única fonte oficial de verdade é o Event Store.

Read Models podem ser descartados e recriados.

---

## Processo

```text
Event Store
     │
     ▼
Replay
     │
     ▼
Aggregate State
     │
     ▼
Read Model
```

---

## Exemplos de Estados Reconstruídos

### Wallet

```json
{
  "walletId": "wal_001",
  "asset": "BTC",
  "available": "1.30000000",
  "locked": "0.10000000"
}
```

---

### Ordem

```json
{
  "orderId": "ord_001",
  "status": "FILLED"
}
```

---

### Mercado

```json
{
  "symbol": "BTCBRL",
  "lastPrice": "500000"
}
```

---

# 8. Auditoria

## Objetivo

Garantir rastreabilidade completa das operações da exchange.

---

## Informações Auditáveis

| Categoria     | Exemplos                           |
| ------------- | ---------------------------------- |
| Usuário       | Login, logout, alteração cadastral |
| Wallet        | Créditos, débitos, bloqueios       |
| Ordem         | Criação, cancelamento, execução    |
| Trade         | Negociações executadas             |
| Administração | Cadastro de ativos e mercados      |
| Segurança     | Alteração de permissões            |

---

## Trilha de Auditoria

Exemplo:

```text
2026-05-30 10:00:00
UserRegistered

2026-05-30 10:05:00
WalletCreated

2026-05-30 10:10:00
BalanceCredited

2026-05-30 10:15:00
OrderCreated

2026-05-30 10:15:02
TradeExecuted

2026-05-30 10:15:03
SettlementCompleted
```

---

## Garantias de Auditoria

| Garantia          | Descrição                       |
| ----------------- | ------------------------------- |
| Imutabilidade     | Eventos não podem ser alterados |
| Integridade       | Nenhum evento pode ser removido |
| Temporalidade     | Ordem cronológica preservada    |
| Rastreabilidade   | Origem identificável            |
| Reprodutibilidade | Estado pode ser reconstruído    |
| Observabilidade   | Eventos consultáveis            |

---

## Correlação de Eventos

Operações distribuídas devem compartilhar um CorrelationId.

Exemplo:

```text
CorrelationId = corr_789

OrderCreated
BalanceLocked
TradeExecuted
SettlementCompleted
```

Isso permite reconstruir toda a jornada de uma operação de negociação ponta a ponta.
