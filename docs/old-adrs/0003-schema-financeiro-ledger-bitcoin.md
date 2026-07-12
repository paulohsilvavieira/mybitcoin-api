# ADR 0003 — Schema Financeiro: Ledger e Transações Bitcoin

**Status:** Proposto  
**Data:** 2026-06-05  
**Autores:** Time de Backend

---

## Contexto

O sistema precisa registrar movimentações financeiras de duas origens distintas:

1. **Transações on-chain** — o sistema recebe notificações de transações Bitcoin via RPC de um nó Bitcoin. Esses dados incluem `txid`, `block_height`, `confirmations`, inputs/outputs e metadata raw da blockchain.
2. **Operações internas** — depósitos, saques e transferências entre contas gerenciadas pelo sistema (modelo custodial).

A questão central é como modelar o ledger interno de forma auditável e consistente, relacionando-o corretamente com as transações on-chain.

---

## Forças em Jogo

- Auditabilidade completa: qualquer saldo deve ser derivável do histórico de lançamentos.
- Separação entre dado bruto da blockchain e operação interna do sistema.
- Evitar ponto flutuante em valores monetários (Bitcoin em satoshi).
- Suportar o metadata raw do RPC sem prejudicar a performance de queries de negócio.
- Permitir que transferências internas (sem tx on-chain) coexistam com depósitos/saques on-chain.

---

## Decisão

Adotar três tabelas com responsabilidades distintas: `bitcoin_transactions`, `transactions` e `ledger_entries`.

### Schema

```sql
-- Dado bruto recebido via Bitcoin RPC
bitcoin_transactions (
  id               SERIAL PRIMARY KEY,
  txid             VARCHAR(64) UNIQUE NOT NULL,
  block_hash       VARCHAR(64),
  block_height     INTEGER,
  confirmations    INTEGER NOT NULL DEFAULT 0,
  amount_satoshi   BIGINT NOT NULL,
  fee_satoshi      BIGINT,
  direction        VARCHAR(10) NOT NULL,   -- inbound | outbound
  status           VARCHAR(20) NOT NULL DEFAULT 'unconfirmed',
                   -- unconfirmed | confirmed | orphaned
  metadata         JSONB,                 -- inputs, outputs, scripts, vout index, weight, etc.
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at     TIMESTAMPTZ
)

-- Operação financeira interna do sistema
transactions (
  id                       SERIAL PRIMARY KEY,
  account_id               INTEGER NOT NULL REFERENCES accounts(id),
  type                     VARCHAR(30) NOT NULL,
                           -- deposit | withdrawal | internal_transfer
  amount_satoshi           BIGINT NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
                           -- pending | completed | failed | cancelled
  bitcoin_transaction_id   INTEGER REFERENCES bitcoin_transactions(id),
                           -- NULL para transferências internas
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Lançamentos contábeis (double-entry bookkeeping)
ledger_entries (
  id               SERIAL PRIMARY KEY,
  transaction_id   INTEGER NOT NULL REFERENCES transactions(id),
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  amount_satoshi   BIGINT NOT NULL,
  direction        VARCHAR(10) NOT NULL,   -- debit | credit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### Rationale

**Por que `amount_satoshi` como `BIGINT` e não `DECIMAL`?**  
Bitcoin é indivisível abaixo de 1 satoshi (10⁻⁸ BTC). Armazenar como inteiro elimina erros de ponto flutuante em operações aritméticas. O valor máximo possível (21 milhões de BTC = 2,1 × 10¹⁵ satoshis) cabe confortavelmente em `BIGINT`.

**Por que `metadata` como JSONB em `bitcoin_transactions`?**  
O RPC retorna inputs, outputs, scripts, `vout` index, `locktime`, `weight` e outros campos que não são usados em queries de negócio, apenas para auditoria e exibição. Colunas próprias são reservadas aos campos usados em `WHERE`, `JOIN` e índices.

Exemplo do conteúdo esperado em `metadata`:
```json
{
  "vout": 1,
  "inputs": [
    { "txid": "abc...", "vout": 0, "address": "bc1q..." }
  ],
  "outputs": [
    { "address": "bc1q...", "value_satoshi": 100000, "n": 0 },
    { "address": "bc1q...", "value_satoshi": 50000, "n": 1 }
  ],
  "locktime": 0,
  "version": 2,
  "weight": 561
}
```

**Por que `bitcoin_transaction_id` é nullable em `transactions`?**  
Transferências internas entre contas do sistema não têm correspondência on-chain. O campo é preenchido apenas para depósitos e saques.

**Por que double-entry em `ledger_entries`?**  
O saldo de qualquer conta é sempre calculado como `SUM(credit) - SUM(debit)` sobre `ledger_entries` — nunca armazenado como campo. Isso garante que qualquer inconsistência seja auditável e que o histórico seja imutável.

---

## Fluxo de Depósito

```
1. Bitcoin RPC detecta tx inbound
   → INSERT bitcoin_transactions (status = 'unconfirmed', confirmations = 0)

2. Sistema cria a operação interna
   → INSERT transactions (type = 'deposit', status = 'pending', bitcoin_transaction_id = ...)

3. RPC notifica N confirmações atingidas
   → UPDATE bitcoin_transactions SET status = 'confirmed', confirmations = N
   → UPDATE transactions SET status = 'completed'
   → INSERT ledger_entries (direction = 'credit', account_id = ..., amount_satoshi = ...)
```

## Fluxo de Saque

```
1. Usuário solicita saque
   → INSERT transactions (type = 'withdrawal', status = 'pending')
   → INSERT ledger_entries (direction = 'debit', ...) — saldo reservado

2. Sistema assina e broadcast a tx
   → INSERT bitcoin_transactions (status = 'unconfirmed', direction = 'outbound')
   → UPDATE transactions SET bitcoin_transaction_id = ..., status = 'completed'
```

## Fluxo de Transferência Interna

```
1. Usuário transfere entre contas internas
   → INSERT transactions (type = 'internal_transfer', bitcoin_transaction_id = NULL)
   → INSERT ledger_entries (direction = 'debit',  account_id = origem, ...)
   → INSERT ledger_entries (direction = 'credit', account_id = destino, ...)
   — tudo em uma única transação atômica (ver ADR 0001)
```

---

## Consequências

**Positivas:**
- Saldo sempre derivado do ledger — nunca dessincronizado.
- `bitcoin_transactions` pode ser atualizada (confirmations, status) independentemente do ledger interno.
- Transferências internas e on-chain coexistem no mesmo modelo sem gambiarra.
- `metadata` JSONB preserva o dado bruto do RPC sem poluir o schema.

**Negativas / Trade-offs:**
- Calcular saldo exige `SUM` sobre `ledger_entries` — índice em `(account_id, direction)` é obrigatório para performance.
- Cada operação financeira envolve no mínimo duas tabelas — requer transação atômica (ADR 0001).
- Transferências internas geram dois `ledger_entries` por transação — volume de linhas maior que um modelo simples.

---

## Referências

- ADR 0001 — Fluxo de Transações Atômicas
- ADR 0002 — Schema de Identidade e KYC
- [Bitcoin RPC — getrawtransaction](https://developer.bitcoin.org/reference/rpc/getrawtransaction.html)
- Double-entry bookkeeping: cada transação gera débito + crédito de mesmo valor
