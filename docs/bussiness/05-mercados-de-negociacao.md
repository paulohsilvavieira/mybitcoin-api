# Mercados de Negociação

## BTC/USDT

Mercado destinado à negociação de Bitcoin contra Tether (USDT).

### Configuração

| Campo                    | Valor       |
| ------------------------ | ----------- |
| Ativo Base               | BTC         |
| Ativo Cotação            | USDT        |
| Quantidade Mínima        | 0.00001 BTC |
| Incremento de Quantidade | 0.00001 BTC |
| Tick Size                | 0.01 USDT   |
| Status                   | Ativo       |

### Exemplos

#### Compra

```text
Comprar 0.50 BTC a 60.000 USDT
```

Valor da ordem:

```text
0.50 × 60.000 = 30.000 USDT
```

#### Venda

```text
Vender 0.25 BTC a 61.000 USDT
```

---

## ETH/USDT

Mercado destinado à negociação de Ethereum contra Tether (USDT).

### Configuração

| Campo                    | Valor      |
| ------------------------ | ---------- |
| Ativo Base               | ETH        |
| Ativo Cotação            | USDT       |
| Quantidade Mínima        | 0.0001 ETH |
| Incremento de Quantidade | 0.0001 ETH |
| Tick Size                | 0.01 USDT  |
| Status                   | Ativo      |

### Exemplos

#### Compra

```text
Comprar 10 ETH a 3.000 USDT
```

#### Venda

```text
Vender 5 ETH a 3.100 USDT
```

---

## SOL/USDT

Mercado destinado à negociação de Solana contra Tether (USDT).

### Configuração

| Campo                    | Valor      |
| ------------------------ | ---------- |
| Ativo Base               | SOL        |
| Ativo Cotação            | USDT       |
| Quantidade Mínima        | 0.01 SOL   |
| Incremento de Quantidade | 0.01 SOL   |
| Tick Size                | 0.001 USDT |
| Status                   | Ativo      |

### Exemplos

#### Compra

```text
Comprar 100 SOL a 150 USDT
```

#### Venda

```text
Vender 50 SOL a 155 USDT
```

---

# Tipos de Ordem

## Estados de Ordem

Todos os tipos de ordem utilizam os seguintes estados.

| Estado           | Descrição                   |
| ---------------- | --------------------------- |
| NEW              | Ordem criada e aceita       |
| OPEN             | Disponível no Order Book    |
| PARTIALLY_FILLED | Parcialmente executada      |
| FILLED           | Totalmente executada        |
| CANCELLED        | Cancelada pelo usuário      |
| EXPIRED          | Expirada por regra da ordem |
| REJECTED         | Rejeitada durante validação |

---

# Ordem LIMIT

Ordem executada apenas no preço informado ou em preço melhor.

## Estrutura

```json
{
  "market": "BTCUSDT",
  "side": "BUY",
  "type": "LIMIT",
  "price": "60000",
  "quantity": "0.50"
}
```

---

## Regras

| Regra                   | Obrigatório |
| ----------------------- | ----------- |
| Preço informado         | Sim         |
| Quantidade informada    | Sim         |
| Saldo disponível        | Sim         |
| Pode permanecer no book | Sim         |
| Execução imediata       | Não         |

---

## Fluxo

```text
Receber Ordem
      │
      ▼
Validar
      │
      ▼
Bloquear Saldo
      │
      ▼
Matching
      │
      ├─ Sem Match
      │      │
      │      ▼
      │   OPEN
      │
      └─ Com Match
             │
             ▼
     FILLED ou PARTIALLY_FILLED
```

---

## Estados Possíveis

| Estado           |
| ---------------- |
| NEW              |
| OPEN             |
| PARTIALLY_FILLED |
| FILLED           |
| CANCELLED        |
| REJECTED         |

---

## Casos Inválidos

### Quantidade inválida

```json
{
  "quantity": 0
}
```

Resultado:

```text
REJECTED
INVALID_QUANTITY
```

---

### Preço inválido

```json
{
  "price": 0
}
```

Resultado:

```text
REJECTED
INVALID_PRICE
```

---

### Saldo insuficiente

```text
Saldo USDT: 100
Compra: 1 BTC a 60.000
```

Resultado:

```text
REJECTED
INSUFFICIENT_BALANCE
```

---

# Ordem MARKET

Executa imediatamente utilizando as melhores ofertas disponíveis.

## Estrutura

```json
{
  "market": "BTCUSDT",
  "side": "BUY",
  "type": "MARKET",
  "quantity": "0.50"
}
```

---

## Regras

| Regra                       | Obrigatório |
| --------------------------- | ----------- |
| Quantidade                  | Sim         |
| Preço                       | Não         |
| Deve executar imediatamente | Sim         |
| Entra no book               | Não         |

---

## Fluxo

```text
Receber Ordem
      │
      ▼
Validar
      │
      ▼
Matching Imediato
      │
      ├─ Liquidez suficiente
      │         │
      │         ▼
      │      FILLED
      │
      └─ Liquidez parcial
                │
                ▼
      PARTIALLY_FILLED
```

---

## Estados Possíveis

| Estado           |
| ---------------- |
| NEW              |
| PARTIALLY_FILLED |
| FILLED           |
| REJECTED         |

---

## Casos Inválidos

### Livro vazio

```text
Nenhuma oferta disponível
```

Resultado:

```text
REJECTED
NO_LIQUIDITY
```

---

### Quantidade inválida

```json
{
  "quantity": 0
}
```

Resultado:

```text
REJECTED
INVALID_QUANTITY
```

---

### Saldo insuficiente

Resultado:

```text
REJECTED
INSUFFICIENT_BALANCE
```

---

# Ordem IOC (Immediate Or Cancel)

Executa imediatamente o volume disponível e cancela o restante.

## Estrutura

```json
{
  "market": "BTCUSDT",
  "side": "BUY",
  "type": "LIMIT",
  "timeInForce": "IOC",
  "price": "60000",
  "quantity": "1"
}
```

---

## Regras

| Regra                      | Valor       |
| -------------------------- | ----------- |
| Execução imediata          | Obrigatória |
| Parcial permitida          | Sim         |
| Restante permanece no book | Não         |
| Preço obrigatório          | Sim         |

---

## Fluxo

```text
Receber Ordem
      │
      ▼
Validar
      │
      ▼
Matching Imediato
      │
      ├─ Executa Total
      │       │
      │       ▼
      │    FILLED
      │
      ├─ Executa Parcial
      │       │
      │       ▼
      │ PARTIALLY_FILLED
      │       │
      │       ▼
      │  EXPIRED
      │
      └─ Nenhuma Execução
              │
              ▼
           EXPIRED
```

---

## Estados Possíveis

| Estado           |
| ---------------- |
| NEW              |
| PARTIALLY_FILLED |
| FILLED           |
| EXPIRED          |
| REJECTED         |

---

## Casos Inválidos

### Preço ausente

Resultado:

```text
REJECTED
PRICE_REQUIRED
```

---

### Quantidade inválida

Resultado:

```text
REJECTED
INVALID_QUANTITY
```

---

### Saldo insuficiente

Resultado:

```text
REJECTED
INSUFFICIENT_BALANCE
```

---

# Ordem FOK (Fill Or Kill)

Executa integralmente e imediatamente ou é cancelada sem gerar execução parcial.

## Estrutura

```json
{
  "market": "BTCUSDT",
  "side": "BUY",
  "type": "LIMIT",
  "timeInForce": "FOK",
  "price": "60000",
  "quantity": "1"
}
```

---

## Regras

| Regra             | Valor       |
| ----------------- | ----------- |
| Execução imediata | Obrigatória |
| Execução parcial  | Não         |
| Entra no book     | Não         |
| Preço obrigatório | Sim         |

---

## Fluxo

```text
Receber Ordem
      │
      ▼
Validar
      │
      ▼
Verificar Liquidez
      │
      ├─ Liquidez Total
      │       │
      │       ▼
      │    FILLED
      │
      └─ Liquidez Insuficiente
              │
              ▼
           EXPIRED
```

---

## Estados Possíveis

| Estado   |
| -------- |
| NEW      |
| FILLED   |
| EXPIRED  |
| REJECTED |

---

## Casos Inválidos

### Liquidez insuficiente

Livro:

```text
Venda disponível: 0.50 BTC
```

Ordem:

```text
Compra: 1 BTC
```

Resultado:

```text
EXPIRED
INSUFFICIENT_LIQUIDITY
```

---

### Preço ausente

Resultado:

```text
REJECTED
PRICE_REQUIRED
```

---

### Quantidade inválida

Resultado:

```text
REJECTED
INVALID_QUANTITY
```

---

### Saldo insuficiente

Resultado:

```text
REJECTED
INSUFFICIENT_BALANCE
```

---

# Matriz Comparativa

| Característica             | LIMIT | MARKET | IOC | FOK |
| -------------------------- | ----- | ------ | --- | --- |
| Preço obrigatório          | Sim   | Não    | Sim | Sim |
| Entra no Book              | Sim   | Não    | Não | Não |
| Permite execução parcial   | Sim   | Sim    | Sim | Não |
| Execução imediata          | Não   | Sim    | Sim | Sim |
| Pode ficar aberta          | Sim   | Não    | Não | Não |
| Pode expirar               | Não   | Não    | Sim | Sim |
| Liquidez total obrigatória | Não   | Não    | Não | Sim |
