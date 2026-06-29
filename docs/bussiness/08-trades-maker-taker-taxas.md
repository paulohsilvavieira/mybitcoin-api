# Trades, Maker, Taker e Taxas

## 1. Trades

### Definição

Um Trade representa a execução total ou parcial entre uma ordem de compra e uma ordem de venda compatíveis.

O Trade é o evento financeiro que efetivamente transfere ativos entre participantes do mercado.

---

## Estrutura de um Trade

| Campo       | Descrição                    |
| ----------- | ---------------------------- |
| TradeId     | Identificador único          |
| Pair        | Par negociado                |
| Price       | Preço executado              |
| Quantity    | Quantidade executada         |
| QuoteAmount | Valor financeiro da operação |
| BuyOrderId  | Ordem compradora             |
| SellOrderId | Ordem vendedora              |
| BuyUserId   | Comprador                    |
| SellUserId  | Vendedor                     |
| MakerSide   | Lado que forneceu liquidez   |
| TakerSide   | Lado que consumiu liquidez   |
| ExecutedAt  | Data/Hora da execução        |

---

## Regras de Execução

### Regra 1 — O preço pertence ao Maker

O preço do trade sempre é definido pela ordem que já estava presente no livro.

Exemplo:

Livro:

| Tipo  | Preço | Quantidade |
| ----- | ----- | ---------- |
| Venda | 100   | 10         |

Nova ordem:

```text
Compra 10 @ 105
```

Resultado:

```text
Trade executado a 100
```

Não a 105.

---

### Regra 2 — Execuções Parciais

Uma ordem pode gerar múltiplos trades.

Livro:

| Venda | Quantidade |
| ----- | ---------- |
| 100   | 2          |
| 101   | 3          |
| 102   | 5          |

Ordem:

```text
Compra 8 BTC
```

Resultado:

| Trade | Preço | Quantidade |
| ----- | ----- | ---------- |
| 1     | 100   | 2          |
| 2     | 101   | 3          |
| 3     | 102   | 3          |

---

### Regra 3 — Trade Nunca Pode Alterar Quantidades

Após a execução:

```text
Quantidade executada ≤ Quantidade restante
```

Sempre.

---

## Cálculo Financeiro

### Valor Bruto

```text
GrossAmount = Price × Quantity
```

Exemplo:

```text
Preço = 500.000 BRL
Quantidade = 0,10 BTC
```

```text
GrossAmount = 50.000 BRL
```

---

## Arredondamentos

### Preço

Seguir a precisão definida pelo mercado.

Exemplo:

| Mercado  | Casas |
| -------- | ----- |
| BTC/BRL  | 2     |
| BTC/USDT | 2     |
| ETH/BTC  | 8     |

---

### Quantidade

Seguir a precisão do ativo base.

Exemplo:

| Ativo | Casas |
| ----- | ----- |
| BTC   | 8     |
| ETH   | 8     |
| SOL   | 6     |

---

### Valor Financeiro

```text
QuoteAmount = round(
    Price × Quantity,
    quote_precision
)
```

---

## Edge Cases

### Quantidade Residual

Ordem:

```text
1 BTC
```

Executado:

```text
0,99999999 BTC
```

Restante:

```text
0,00000001 BTC
```

Caso o restante seja menor que o mínimo negociável:

```text
Residual < MinOrderSize
```

A ordem pode ser encerrada automaticamente.

---

### Trade de Valor Muito Pequeno

Exemplo:

```text
0,00000001 BTC
```

Se o valor financeiro ficar abaixo do mínimo permitido:

```text
Trade rejeitado
```

---

# 2. Maker

## Definição

Maker é o participante que adiciona liquidez ao livro de ofertas.

Sua ordem permanece disponível aguardando contraparte.

---

## Regras

Uma ordem é Maker quando:

```text
Não executa imediatamente
```

e

```text
É inserida no Order Book
```

---

## Exemplo

Livro vazio.

Usuário envia:

```text
Compra 1 BTC @ 500.000
```

Resultado:

```text
Ordem inserida no livro
```

Usuário é Maker.

---

## Benefícios

Normalmente exchanges aplicam:

| Papel | Taxa  |
| ----- | ----- |
| Maker | Menor |
| Taker | Maior |

Porque o Maker fornece liquidez.

---

## Edge Cases

### Parcial Maker / Parcial Taker

Ordem:

```text
Compra 10 BTC @ 100
```

Executa:

```text
3 BTC
```

Restam:

```text
7 BTC
```

Os 3 BTC executados:

```text
Taker
```

Os 7 BTC restantes:

```text
Maker
```

A mesma ordem pode assumir ambos os papéis.

---

# 3. Taker

## Definição

Taker é o participante que remove liquidez existente do Order Book.

---

## Regras

Uma ordem é Taker quando:

```text
Executa imediatamente
```

contra uma ordem já existente.

---

## Exemplo

Livro:

```text
Venda 1 BTC @ 500.000
```

Nova ordem:

```text
Compra 1 BTC @ 500.000
```

Resultado:

```text
Compra = Taker
Venda = Maker
```

---

## Identificação

A última ordem recebida pelo Matching Engine é sempre a candidata a Taker.

---

## Edge Cases

### Ordem Market

Toda ordem Market é necessariamente Taker.

Motivo:

```text
Nunca permanece no livro.
```

---

### Ordem Limit Executada Integralmente

Livro:

```text
Venda 100
```

Nova ordem:

```text
Compra 120
```

Execução:

```text
100 executados
20 permanecem no livro
```

Resultado:

| Quantidade | Papel |
| ---------- | ----- |
| 100        | Taker |
| 20         | Maker |

---

# 4. Taxas

## Objetivo

Remunerar a operação da exchange.

---

## Tipos de Taxa

| Tipo           | Aplicação           |
| -------------- | ------------------- |
| Maker Fee      | Cobrada do Maker    |
| Taker Fee      | Cobrada do Taker    |
| Withdrawal Fee | Saque               |
| Deposit Fee    | Depósito (opcional) |

Neste documento focamos apenas nas taxas de negociação.

---

## Configuração

Exemplo:

| Tipo  | Percentual |
| ----- | ---------- |
| Maker | 0,10%      |
| Taker | 0,20%      |

---

## Cálculo da Taxa

### Fórmula Geral

```text
Fee = GrossAmount × FeeRate
```

---

### Exemplo

Trade:

```text
Preço = 500.000
Quantidade = 0,10
```

Valor bruto:

```text
50.000 BRL
```

Taxa:

```text
0,20%
```

Resultado:

```text
Fee = 100 BRL
```

---

## Cobrança no Comprador

Comprador recebe:

```text
BTC Recebido =
Quantidade Executada
- FeeBTC
```

ou

```text
BTC Recebido =
Quantidade Executada
```

e

```text
Taxa em BRL
```

Dependendo da política da exchange.

---

## Cobrança no Vendedor

Vendedor recebe:

```text
BRL Líquido =
GrossAmount - Fee
```

---

## Arredondamentos

### Taxa Monetária

```text
round(
    GrossAmount × FeeRate,
    quote_precision
)
```

Exemplo:

```text
50.000 × 0,001
=
50,00
```

---

### Taxa em Cripto

```text
round(
    Quantity × FeeRate,
    asset_precision
)
```

Exemplo:

```text
0,12345678 × 0,001
=
0,00012345 BTC
```

---

## Edge Cases

### Taxa Arredondada para Zero

Exemplo:

```text
Fee = 0,0000000001 BTC
```

Após arredondamento:

```text
0 BTC
```

Opções:

1. Permitir taxa zero.
2. Aplicar taxa mínima.
3. Acumular frações internamente.

A decisão deve ser definida na política financeira da exchange.

---

### Taxa Superior ao Recebimento

Exemplo extremo:

```text
Trade muito pequeno
```

Onde:

```text
Fee >= NetAmount
```

Resultado:

```text
Trade rejeitado
```

ou

```text
Aplicação de valor mínimo negociável.
```

---

### Mudança de Taxa Durante Operação

A taxa aplicada deve ser aquela vigente:

```text
No momento da execução do trade
```

e não da criação da ordem.

Isso evita inconsistências em ordens de longa duração.

---

## Fórmula Consolidada

### Comprador

```text
GrossQty = ExecutedQty

FeeQty = GrossQty × FeeRate

NetQty = GrossQty - FeeQty
```

---

### Vendedor

```text
GrossAmount = Price × Qty

FeeAmount = GrossAmount × FeeRate

NetAmount = GrossAmount - FeeAmount
```
