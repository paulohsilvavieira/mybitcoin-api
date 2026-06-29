# Sistema de Carteiras e Ledger Financeiro

## Objetivo

O sistema de carteiras (Wallet Service) é responsável pelo controle dos saldos dos usuários e pela custódia lógica dos ativos dentro da exchange.

O Ledger Financeiro é responsável pelo registro imutável de todas as movimentações financeiras, garantindo rastreabilidade, auditoria e consistência contábil através do modelo de dupla entrada.

---

# Arquitetura Conceitual

```text
+------------------+
|    Usuário       |
+------------------+
          |
          v
+------------------+
| Wallet Service   |
+------------------+
          |
          v
+------------------+
| Financial Ledger |
+------------------+
          |
          v
+------------------+
| Auditoria        |
+------------------+
```

---

# Modelo de Carteira

Cada usuário possui uma carteira para cada ativo suportado pela plataforma.

Exemplo:

| Usuário | Ativo |
| ------- | ----- |
| User A  | BRL   |
| User A  | BTC   |
| User A  | ETH   |
| User A  | USDT  |

---

# Estrutura de Saldo

Para cada ativo são mantidos três tipos de saldo.

## Saldo Disponível

Representa a quantidade livre para utilização imediata.

Pode ser utilizada para:

* Criar ordens
* Realizar transferências
* Efetuar saques
* Pagar taxas

### Exemplo

| Ativo | Disponível |
| ----- | ---------- |
| BRL   | 10.000     |
| BTC   | 0,50000000 |

---

## Saldo Bloqueado

Representa recursos reservados para operações pendentes.

Normalmente utilizado por:

* Ordens abertas
* Saques em processamento
* Reservas operacionais

### Exemplo

Usuário cria uma ordem:

```text
Comprar BTC por 2.000 BRL
```

Resultado:

| Tipo       | Valor     |
| ---------- | --------- |
| Disponível | 8.000 BRL |
| Bloqueado  | 2.000 BRL |

---

## Saldo Total

Representa o patrimônio total do usuário para determinado ativo.

### Fórmula

```text
Saldo Total = Saldo Disponível + Saldo Bloqueado
```

### Exemplo

| Tipo       | Valor      |
| ---------- | ---------- |
| Disponível | 8.000 BRL  |
| Bloqueado  | 2.000 BRL  |
| Total      | 10.000 BRL |

---

# Ledger Financeiro

## Definição

O Ledger é o livro razão da exchange.

Toda movimentação financeira deve gerar registros contábeis.

Nenhuma alteração de saldo pode ocorrer sem um lançamento correspondente no ledger.

---

# Estrutura de Lançamento

Cada lançamento possui:

| Campo         | Descrição                  |
| ------------- | -------------------------- |
| TransactionId | Identificador da transação |
| Asset         | Ativo                      |
| DebitAccount  | Conta debitada             |
| CreditAccount | Conta creditada            |
| Amount        | Quantidade                 |
| Timestamp     | Data e hora                |
| Reference     | Origem do evento           |
| Metadata      | Dados complementares       |

---

# Modelo de Contas

## Contas de Usuário

Representam os saldos dos clientes.

Exemplos:

```text
USER:1001:BRL
USER:1001:BTC
USER:1002:USDT
```

---

## Contas Operacionais

Representam recursos da exchange.

Exemplos:

```text
EXCHANGE:FEES:BRL
EXCHANGE:FEES:BTC

EXCHANGE:TREASURY:BRL
EXCHANGE:TREASURY:BTC
```

---

## Contas Transitórias

Utilizadas durante processos intermediários.

Exemplos:

```text
SETTLEMENT:BRL
SETTLEMENT:BTC

WITHDRAWAL:HOLD:BRL
ORDER:HOLD:BRL
```

---

# Crédito

Representa entrada de recursos em uma conta.

## Exemplos

* Depósito
* Recebimento de trade
* Estorno
* Bonificação

### Exemplo

```text
Depósito de 1 BTC
```

| Conta    | Movimento     |
| -------- | ------------- |
| USER:BTC | Crédito 1 BTC |

---

# Débito

Representa saída de recursos de uma conta.

## Exemplos

* Saque
* Pagamento de taxa
* Execução de compra
* Transferência

### Exemplo

```text
Saque de 500 BRL
```

| Conta    | Movimento      |
| -------- | -------------- |
| USER:BRL | Débito 500 BRL |

---

# Princípio da Dupla Entrada

## Definição

Toda transação financeira deve possuir:

* Pelo menos um débito
* Pelo menos um crédito

A soma dos débitos deve ser igual à soma dos créditos.

---

## Regra Fundamental

```text
Σ Débitos = Σ Créditos
```

---

## Exemplo de Depósito

Depósito de 10.000 BRL.

| Conta        | Movimento      |
| ------------ | -------------- |
| TREASURY:BRL | Débito 10.000  |
| USER:BRL     | Crédito 10.000 |

Resultado:

```text
Total Débitos = 10.000
Total Créditos = 10.000
```

---

## Exemplo de Reserva para Ordem

Usuário cria ordem de compra.

Valor:

```text
2.000 BRL
```

Movimentação:

| Conta              | Movimento     |
| ------------------ | ------------- |
| USER_AVAILABLE:BRL | Débito 2.000  |
| USER_LOCKED:BRL    | Crédito 2.000 |

Resultado:

```text
Saldo total permanece inalterado.
```

---

## Exemplo de Execução de Trade

Compra:

```text
0,10 BTC
Preço: 500.000 BRL
Valor: 50.000 BRL
```

Comprador:

| Conta              | Movimento        |
| ------------------ | ---------------- |
| USER_LOCKED:BRL    | Débito 50.000    |
| USER_AVAILABLE:BTC | Crédito 0,10 BTC |

Vendedor:

| Conta              | Movimento       |
| ------------------ | --------------- |
| USER_AVAILABLE:BTC | Débito 0,10 BTC |
| USER_AVAILABLE:BRL | Crédito 50.000  |

---

# Reconciliação

## Definição

Processo de validação da consistência entre:

* Wallets
* Ledger
* Contas operacionais
* Sistemas externos

---

## Objetivos

* Detectar divergências
* Garantir integridade financeira
* Identificar falhas operacionais
* Apoiar auditorias

---

## Reconciliação Interna

Valida:

```text
Wallets = Ledger
```

Exemplo:

| Fonte   | BTC    |
| ------- | ------ |
| Wallets | 250,50 |
| Ledger  | 250,50 |

Status:

```text
OK
```

---

## Reconciliação por Ativo

Executada individualmente para cada ativo.

Exemplo:

| Ativo | Status |
| ----- | ------ |
| BRL   | OK     |
| BTC   | OK     |
| ETH   | OK     |
| USDT  | OK     |

---

## Reconciliação de Transações

Valida:

* Todas as transações possuem lançamentos.
* Todas as transações estão balanceadas.
* Não existem lançamentos órfãos.

---

# Invariantes de Negócio

Os invariantes abaixo devem ser verdadeiros em qualquer momento do sistema.

---

## INV-001

Saldo disponível nunca pode ser negativo.

```text
available >= 0
```

---

## INV-002

Saldo bloqueado nunca pode ser negativo.

```text
locked >= 0
```

---

## INV-003

Saldo total nunca pode ser negativo.

```text
total >= 0
```

---

## INV-004

Saldo total deve ser igual à soma dos componentes.

```text
total = available + locked
```

---

## INV-005

Toda movimentação financeira deve possuir registro no ledger.

```text
Wallet Update => Ledger Entry
```

---

## INV-006

Nenhum lançamento pode alterar saldo sem transação associada.

```text
ledger_entry.transaction_id != null
```

---

## INV-007

Toda transação deve estar balanceada.

```text
Σ debit = Σ credit
```

---

## INV-008

Não pode existir criação espontânea de saldo.

```text
Money Created = 0
```

Exceto para eventos autorizados:

* Depósitos
* Airdrops simulados
* Ajustes administrativos auditados

---

## INV-009

Não pode existir destruição espontânea de saldo.

```text
Money Destroyed = 0
```

Exceto para:

* Saques
* Queimas registradas
* Ajustes administrativos auditados

---

## INV-010

Ordens abertas devem possuir reserva correspondente.

```text
Open Order => Locked Balance
```

---

## INV-011

Saldo bloqueado deve ser suficiente para cobrir todas as ordens abertas.

```text
Locked Balance >= Open Orders Exposure
```

---

## INV-012

Toda execução de trade deve preservar o patrimônio global do sistema.

```text
Assets Before Trade
=
Assets After Trade
```

---

## INV-013

Toda cobrança de taxa deve possuir contraparte da exchange.

Exemplo:

```text
USER:BRL            Débito 10
EXCHANGE:FEES:BRL  Crédito 10
```

---

## INV-014

Toda conta deve ser auditável a partir do histórico de lançamentos.

```text
Current Balance
=
Σ Ledger Entries
```

---

# Garantias do Sistema

O modelo Wallet + Ledger deve garantir:

* Consistência financeira
* Rastreabilidade completa
* Imutabilidade dos lançamentos
* Reconciliação automática
* Auditoria integral
* Ausência de criação indevida de saldo
* Integridade contábil por dupla entrada
