# Matching Engine

## 1. Visão Geral

O Matching Engine é o componente central responsável por processar ordens de compra e venda, determinar elegibilidade para execução, gerar negociações (Trades) e manter a consistência do livro de ofertas (Order Book).

O mecanismo deve operar de forma:

* Determinística
* Sequencial
* Auditável
* Consistente
* Reprodutível

Seu comportamento deve ser idêntico para um mesmo conjunto de eventos de entrada.

---

# 2. Responsabilidades

| Responsabilidade          | Descrição                                |
| ------------------------- | ---------------------------------------- |
| Receber ordens            | Processar novas ordens de compra e venda |
| Validar ordens            | Garantir integridade e elegibilidade     |
| Executar matching         | Casar ordens compatíveis                 |
| Gerar trades              | Produzir eventos de execução             |
| Atualizar book            | Inserir, remover ou atualizar níveis     |
| Controlar saldo bloqueado | Garantir liquidação consistente          |
| Gerar auditoria           | Registrar todas as decisões do motor     |

---

# 3. Sequenciamento

## Objetivo

Garantir que todas as ordens sejam processadas em uma sequência única e bem definida.

## Regra

Cada evento recebido pelo Matching Engine recebe um identificador monotonicamente crescente.

Exemplo:

| Sequence ID | Evento          |
| ----------- | --------------- |
| 1001        | Nova ordem Buy  |
| 1002        | Nova ordem Sell |
| 1003        | Cancelamento    |
| 1004        | Nova ordem Buy  |

O motor processa exatamente na ordem recebida.

```text
1001 → 1002 → 1003 → 1004
```

Não existe processamento paralelo sobre o mesmo livro de ofertas.

---

## Critério de Aceite

### CA-SEQ-001

Dado um conjunto de eventos idênticos,

Quando forem processados múltiplas vezes,

Então o resultado deverá ser exatamente o mesmo.

---

### CA-SEQ-002

Nenhum evento poderá ser processado antes de seu predecessor lógico.

---

# 4. Determinismo

## Objetivo

Garantir previsibilidade e reprodutibilidade.

Um Matching Engine determinístico produz:

* mesmos trades
* mesmos preços
* mesmas quantidades
* mesma ordem de execução

sempre que receber a mesma sequência de eventos.

---

## Exemplo

Book:

| Tipo | Preço | Quantidade |
| ---- | ----- | ---------- |
| Sell | 100   | 5          |

Nova ordem:

```text
Buy 5 @ 100
```

Resultado sempre será:

```text
Trade
Preço: 100
Quantidade: 5
```

Independentemente de:

* horário da execução
* servidor utilizado
* quantidade de réplicas

---

## Critério de Aceite

### CA-DET-001

A reprodução do log de eventos deve gerar estado final idêntico.

---

### CA-DET-002

Não podem existir decisões aleatórias durante o matching.

---

# 5. Price-Time Priority

## Definição

A prioridade de execução é definida por:

1. Melhor preço.
2. Menor timestamp.
3. Menor sequence id.

Também conhecida como FIFO por nível de preço.

---

## Exemplo

Livro de venda:

| Ordem | Preço | Quantidade | Hora     |
| ----- | ----- | ---------- | -------- |
| S1    | 100   | 5          | 10:00:01 |
| S2    | 100   | 5          | 10:00:05 |
| S3    | 101   | 5          | 10:00:03 |

Nova ordem:

```text
Buy 10 @ 100
```

Execução:

```text
1º S1
2º S2
```

S3 não participa.

---

## Exemplo de Melhor Preço

Livro:

| Ordem | Preço |
| ----- | ----- |
| S1    | 100   |
| S2    | 99    |
| S3    | 101   |

Nova ordem:

```text
Buy 1 @ 101
```

Ordem de execução:

```text
S2
S1
S3
```

O melhor preço sempre possui prioridade.

---

## Critérios de Aceite

### CA-PTP-001

Ordens com melhor preço devem ser executadas antes de preços inferiores.

---

### CA-PTP-002

Ordens no mesmo preço devem respeitar FIFO.

---

### CA-PTP-003

Não é permitido ultrapassar ordens mais antigas no mesmo nível.

---

# 6. Partial Fill

## Definição

Ocorre quando apenas parte da quantidade da ordem pode ser executada.

---

## Exemplo 1

Livro:

| Ordem | Tipo | Quantidade |
| ----- | ---- | ---------- |
| S1    | Sell | 2 BTC      |

Nova ordem:

```text
Buy 5 BTC
```

Resultado:

Trade:

```text
2 BTC
```

Estado final:

| Ordem | Quantidade Restante |
| ----- | ------------------- |
| Buy   | 3 BTC               |
| S1    | 0 BTC               |

A ordem Buy permanece aberta.

---

## Exemplo 2

Livro:

| Ordem | Tipo | Quantidade |
| ----- | ---- | ---------- |
| S1    | Sell | 1 BTC      |
| S2    | Sell | 1 BTC      |

Nova ordem:

```text
Buy 5 BTC
```

Resultado:

```text
Trade 1 BTC
Trade 1 BTC
```

Restante:

```text
Buy 3 BTC
```

---

## Critérios de Aceite

### CA-PF-001

A quantidade executada nunca poderá exceder a quantidade disponível.

---

### CA-PF-002

A quantidade remanescente deverá permanecer ativa quando aplicável.

---

### CA-PF-003

O saldo remanescente deve ser consistente com a soma dos trades gerados.

---

# 7. Full Fill

## Definição

Ocorre quando a ordem é completamente executada.

---

## Exemplo

Livro:

| Ordem | Quantidade |
| ----- | ---------- |
| S1    | 5 BTC      |

Nova ordem:

```text
Buy 5 BTC
```

Resultado:

```text
Trade 5 BTC
```

Estado final:

```text
Buy = CLOSED
Sell = CLOSED
```

Nenhuma quantidade remanescente.

---

## Critérios de Aceite

### CA-FF-001

Após execução total, a quantidade restante deve ser zero.

---

### CA-FF-002

Ordens totalmente executadas devem ser removidas do book.

---

### CA-FF-003

O status deve ser alterado para FILLED.

---

# 8. Multi-Level Matching

## Definição

Capacidade de consumir múltiplos níveis de preço durante uma única execução.

---

## Exemplo

Livro de venda:

| Preço | Quantidade |
| ----- | ---------- |
| 100   | 2 BTC      |
| 101   | 3 BTC      |
| 102   | 5 BTC      |

Nova ordem:

```text
Buy 7 BTC @ 102
```

Execução:

```text
2 BTC @ 100
3 BTC @ 101
2 BTC @ 102
```

Trades gerados:

| Trade | Quantidade | Preço |
| ----- | ---------- | ----- |
| T1    | 2          | 100   |
| T2    | 3          | 101   |
| T3    | 2          | 102   |

Quantidade restante no nível 102:

```text
3 BTC
```

---

## Exemplo Visual

```text
Buy 7 BTC @ 102

Nível 100 → 2 BTC
Nível 101 → 3 BTC
Nível 102 → 2 BTC

Total = 7 BTC
```

---

## Critérios de Aceite

### CA-MLM-001

Os níveis devem ser consumidos do melhor para o pior preço.

---

### CA-MLM-002

A execução deve parar ao atingir a quantidade solicitada.

---

### CA-MLM-003

Não é permitido executar preços piores antes de consumir preços melhores.

---

# 9. Invariantes do Matching Engine

## INV-001 — Conservação de Quantidade

A soma das quantidades executadas nunca pode exceder a quantidade original da ordem.

```text
Σ Trades <= Quantidade Original
```

---

## INV-002 — Não Existência de Quantidade Negativa

Nunca pode existir:

```text
Quantidade < 0
```

Para:

* Ordens
* Trades
* Saldos
* Níveis do Book

---

## INV-003 — Integridade do Livro

Após qualquer execução:

```text
Best Bid < Best Ask
```

ou

```text
Book Cruzado = impossível
```

---

## INV-004 — Trade Sempre Possui Duas Contrapartes

Todo Trade deve possuir:

```text
Buy Order
Sell Order
```

---

## INV-005 — Imutabilidade de Trade

Após criado:

* preço não pode mudar
* quantidade não pode mudar
* timestamp não pode mudar

---

## INV-006 — Sequência Monotônica

```text
Sequence(n+1) > Sequence(n)
```

Sempre verdadeiro.

---

## INV-007 — Reprodutibilidade

Dado o mesmo log:

```text
Eventos + Ordem de Eventos
```

O resultado final deve ser idêntico.

---

# 10. Estados de Ordem

| Estado           | Descrição                |
| ---------------- | ------------------------ |
| NEW              | Ordem aceita             |
| PARTIALLY_FILLED | Parcialmente executada   |
| FILLED           | Totalmente executada     |
| CANCELLED        | Cancelada pelo usuário   |
| REJECTED         | Rejeitada pela validação |

---

# 11. Fluxo Simplificado

```text
Nova Ordem
      │
      ▼
Validação
      │
      ▼
Busca Contraparte
      │
      ▼
Price-Time Priority
      │
      ▼
Matching
      │
      ├── Partial Fill
      │
      ├── Full Fill
      │
      └── Multi-Level Fill
      │
      ▼
Trades
      │
      ▼
Atualização do Book
      │
      ▼
Persistência e Auditoria
```
