# Modelo de Domínio

## Visão Geral

O modelo de domínio representa os principais conceitos de negócio da Exchange Spot, suas responsabilidades, relacionamentos e regras invariantes.

```text
User
 ├── Wallet
 │     ├── Balance
 │     └── LedgerEntry
 │
 ├── Order
 │     └── Trade
 │
 ├── Deposit
 │
 └── Withdrawal

Market
 ├── Order
 └── Trade
```

---

# User

## Responsabilidade

Representa um participante da exchange responsável por realizar operações de depósito, negociação e retirada de ativos.

## Campos

| Campo     | Tipo      | Descrição           |
| --------- | --------- | ------------------- |
| id        | UUID      | Identificador único |
| email     | String    | E-mail do usuário   |
| username  | String    | Nome de usuário     |
| status    | Enum      | Status da conta     |
| createdAt | Timestamp | Data de criação     |
| updatedAt | Timestamp | Data de atualização |

### Status

| Valor     |
| --------- |
| ACTIVE    |
| SUSPENDED |
| BLOCKED   |

## Relacionamentos

| Relacionamento    | Cardinalidade |
| ----------------- | ------------- |
| User → Wallet     | 1 : 1         |
| User → Order      | 1 : N         |
| User → Deposit    | 1 : N         |
| User → Withdrawal | 1 : N         |

## Invariantes

| Regra                                 |
| ------------------------------------- |
| E-mail deve ser único                 |
| Username deve ser único               |
| Usuário bloqueado não pode negociar   |
| Usuário deve possuir Wallet associada |

---

# Wallet

## Responsabilidade

Representa a carteira de ativos pertencente ao usuário.

## Campos

| Campo     | Tipo      | Descrição |
| --------- | --------- | --------- |
| id        | UUID      |           |
| userId    | UUID      |           |
| createdAt | Timestamp |           |
| updatedAt | Timestamp |           |

## Relacionamentos

| Relacionamento       | Cardinalidade |
| -------------------- | ------------- |
| Wallet → User        | N : 1         |
| Wallet → Balance     | 1 : N         |
| Wallet → LedgerEntry | 1 : N         |

## Invariantes

| Regra                                    |
| ---------------------------------------- |
| Cada usuário possui apenas uma Wallet    |
| Wallet não pode existir sem User         |
| Toda movimentação deve gerar LedgerEntry |

---

# Balance

## Responsabilidade

Representa o saldo de um determinado ativo dentro da carteira.

## Campos

| Campo           | Tipo           | Descrição |
| --------------- | -------------- | --------- |
| id              | UUID           |           |
| walletId        | UUID           |           |
| asset           | String         |           |
| availableAmount | Decimal(38,18) |           |
| lockedAmount    | Decimal(38,18) |           |
| updatedAt       | Timestamp      |           |

## Relacionamentos

| Relacionamento   | Cardinalidade |
| ---------------- | ------------- |
| Balance → Wallet | N : 1         |

## Invariantes

| Regra                                                         |
| ------------------------------------------------------------- |
| availableAmount >= 0                                          |
| lockedAmount >= 0                                             |
| asset deve existir no catálogo de ativos                      |
| Total = availableAmount + lockedAmount                        |
| Não pode existir mais de um Balance por ativo na mesma Wallet |

## Exemplo

| Ativo | Disponível | Bloqueado |
| ----- | ---------- | --------- |
| BTC   | 0.5        | 0.1       |

Total BTC:

```text
0.6 BTC
```

---

# Market

## Responsabilidade

Representa um par de negociação disponível na exchange.

## Campos

| Campo             | Tipo      |
| ----------------- | --------- |
| id                | UUID      |
| symbol            | String    |
| baseAsset         | String    |
| quoteAsset        | String    |
| status            | Enum      |
| pricePrecision    | Integer   |
| quantityPrecision | Integer   |
| createdAt         | Timestamp |

## Relacionamentos

| Relacionamento | Cardinalidade |
| -------------- | ------------- |
| Market → Order | 1 : N         |
| Market → Trade | 1 : N         |

## Invariantes

| Regra                                   |
| --------------------------------------- |
| baseAsset ≠ quoteAsset                  |
| Symbol deve ser único                   |
| Mercado inativo não aceita novas ordens |

### Exemplo

| Symbol   |
| -------- |
| BTC/BRL  |
| BTC/USDT |
| ETH/BRL  |

---

# Order

## Responsabilidade

Representa uma intenção de compra ou venda enviada ao mercado.

## Campos

| Campo             | Tipo      |
| ----------------- | --------- |
| id                | UUID      |
| userId            | UUID      |
| marketId          | UUID      |
| side              | Enum      |
| type              | Enum      |
| status            | Enum      |
| price             | Decimal   |
| quantity          | Decimal   |
| filledQuantity    | Decimal   |
| remainingQuantity | Decimal   |
| createdAt         | Timestamp |
| updatedAt         | Timestamp |

### Side

| Valor |
| ----- |
| BUY   |
| SELL  |

### Type

| Valor  |
| ------ |
| MARKET |
| LIMIT  |

### Status

| Valor            |
| ---------------- |
| OPEN             |
| PARTIALLY_FILLED |
| FILLED           |
| CANCELLED        |

## Relacionamentos

| Relacionamento | Cardinalidade |
| -------------- | ------------- |
| Order → User   | N : 1         |
| Order → Market | N : 1         |
| Order → Trade  | 1 : N         |

## Invariantes

| Regra                                         |
| --------------------------------------------- |
| quantity > 0                                  |
| filledQuantity >= 0                           |
| remainingQuantity >= 0                        |
| filledQuantity ≤ quantity                     |
| quantity = filledQuantity + remainingQuantity |
| Ordem FILLED não pode ser alterada            |
| Ordem CANCELLED não pode voltar para OPEN     |

---

# Trade

## Responsabilidade

Representa uma execução realizada pelo Matching Engine.

## Campos

| Campo       | Tipo      |
| ----------- | --------- |
| id          | UUID      |
| marketId    | UUID      |
| buyOrderId  | UUID      |
| sellOrderId | UUID      |
| price       | Decimal   |
| quantity    | Decimal   |
| executedAt  | Timestamp |

## Relacionamentos

| Relacionamento | Cardinalidade |
| -------------- | ------------- |
| Trade → Market | N : 1         |
| Trade → Order  | N : 1         |

## Invariantes

| Regra                         |
| ----------------------------- |
| quantity > 0                  |
| price > 0                     |
| buyOrderId ≠ sellOrderId      |
| Trade é imutável após criação |

## Exemplo

| Campo      | Valor   |
| ---------- | ------- |
| Mercado    | BTC/BRL |
| Quantidade | 0.25    |
| Preço      | 500.000 |

---

# Deposit

## Responsabilidade

Representa uma entrada de recursos na conta do usuário.

## Campos

| Campo       | Tipo      |
| ----------- | --------- |
| id          | UUID      |
| userId      | UUID      |
| asset       | String    |
| amount      | Decimal   |
| status      | Enum      |
| createdAt   | Timestamp |
| completedAt | Timestamp |

### Status

| Valor     |
| --------- |
| PENDING   |
| COMPLETED |
| FAILED    |
| CANCELLED |

## Relacionamentos

| Relacionamento | Cardinalidade |
| -------------- | ------------- |
| Deposit → User | N : 1         |

## Invariantes

| Regra                                     |
| ----------------------------------------- |
| amount > 0                                |
| Depósito COMPLETED não pode ser alterado  |
| Depósito COMPLETED deve gerar LedgerEntry |
| Asset deve ser suportado pela exchange    |

---

# Withdrawal

## Responsabilidade

Representa uma saída de recursos da conta do usuário.

## Campos

| Campo       | Tipo      |
| ----------- | --------- |
| id          | UUID      |
| userId      | UUID      |
| asset       | String    |
| amount      | Decimal   |
| fee         | Decimal   |
| status      | Enum      |
| createdAt   | Timestamp |
| completedAt | Timestamp |

### Status

| Valor      |
| ---------- |
| PENDING    |
| PROCESSING |
| COMPLETED  |
| FAILED     |
| CANCELLED  |

## Relacionamentos

| Relacionamento    | Cardinalidade |
| ----------------- | ------------- |
| Withdrawal → User | N : 1         |

## Invariantes

| Regra                                       |
| ------------------------------------------- |
| amount > 0                                  |
| fee >= 0                                    |
| Usuário deve possuir saldo suficiente       |
| Withdrawal COMPLETED é imutável             |
| Withdrawal COMPLETED deve gerar LedgerEntry |

---

# LedgerEntry

## Responsabilidade

Representa o registro contábil imutável de todas as movimentações financeiras da plataforma.

O Ledger é a fonte oficial da verdade financeira da Exchange.

## Campos

| Campo         | Tipo      |
| ------------- | --------- |
| id            | UUID      |
| walletId      | UUID      |
| asset         | String    |
| entryType     | Enum      |
| amount        | Decimal   |
| balanceBefore | Decimal   |
| balanceAfter  | Decimal   |
| referenceType | Enum      |
| referenceId   | UUID      |
| createdAt     | Timestamp |

### EntryType

| Valor  |
| ------ |
| CREDIT |
| DEBIT  |
| LOCK   |
| UNLOCK |

### ReferenceType

| Valor      |
| ---------- |
| DEPOSIT    |
| WITHDRAWAL |
| ORDER      |
| TRADE      |
| ADJUSTMENT |

## Relacionamentos

| Relacionamento       | Cardinalidade |
| -------------------- | ------------- |
| LedgerEntry → Wallet | N : 1         |

## Invariantes

| Regra                                          |
| ---------------------------------------------- |
| LedgerEntry nunca pode ser alterado            |
| LedgerEntry nunca pode ser removido            |
| amount > 0                                     |
| Deve possuir referência de origem              |
| Toda alteração de saldo deve gerar LedgerEntry |

## Exemplo

| Campo        | Valor  |
| ------------ | ------ |
| Tipo         | CREDIT |
| Ativo        | BTC    |
| Valor        | 0.10   |
| Saldo Antes  | 0.40   |
| Saldo Depois | 0.50   |

---

# Regras Gerais do Domínio

| Regra                                          |
| ---------------------------------------------- |
| Nenhum saldo pode se tornar negativo           |
| Todo movimento financeiro deve ser auditável   |
| Toda alteração de saldo deve gerar LedgerEntry |
| Trades não podem ser alterados após execução   |
| Ledger é imutável                              |
| Matching Engine não altera saldo diretamente   |
| Liquidação deve ocorrer através da Wallet      |
| Balance é uma projeção derivada do Ledger      |
| Ledger é a fonte única da verdade financeira   |
|                                                |
