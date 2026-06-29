# Invariantes Globais da Exchange

## Objetivo

As invariantes globais representam regras fundamentais que devem permanecer verdadeiras em qualquer momento do ciclo de vida da Exchange, independentemente da operação executada.

Toda funcionalidade, processo, serviço ou integração deve preservar essas propriedades.

---

# 1. Nenhum Saldo Pode Ser Negativo

## Regra

Nenhum usuário pode possuir saldo disponível, bloqueado ou total inferior a zero.

### Formalização

```text
SaldoDisponivel >= 0
SaldoBloqueado >= 0
SaldoTotal >= 0
```

### Justificativa

Saldos negativos indicam criação indevida de crédito, falhas de concorrência ou inconsistências contábeis.

### Exemplo Válido

| Ativo | Disponível | Bloqueado |
| ----- | ---------- | --------- |
| BRL   | 1000       | 500       |

### Exemplo Inválido

| Ativo | Disponível | Bloqueado |
| ----- | ---------- | --------- |
| BRL   | -100       | 500       |

---

# 2. Nenhuma Ordem Pode Ser Executada Mais de Uma Vez

## Regra

Cada parcela executada de uma ordem deve possuir identificador único e ser registrada apenas uma vez.

### Justificativa

Evita:

* Duplicação de trades.
* Créditos indevidos.
* Divergência contábil.

### Exemplo

Uma ordem de compra de 1 BTC pode gerar:

```text
Trade #1001 → 0.4 BTC
Trade #1002 → 0.6 BTC
```

Nunca:

```text
Trade #1001 executado novamente
```

---

# 3. Nenhum Ativo Pode Ser Criado Espontaneamente

## Regra

Toda movimentação deve possuir origem rastreável.

### Formalização

```text
Entradas = Saídas + Saldos Existentes
```

### Justificativa

A Exchange não pode gerar BTC, ETH, USDT ou BRL sem evento legítimo.

### Eventos Permitidos

| Evento                 | Permite criação |
| ---------------------- | --------------- |
| Depósito               | Sim             |
| Airdrop administrativo | Sim             |
| Trade                  | Não             |
| Cancelamento de ordem  | Não             |

---

# 4. Nenhum Ativo Pode Ser Destruído Espontaneamente

## Regra

Ativos não podem desaparecer do sistema.

### Justificativa

Toda redução de saldo deve possuir causa explícita.

### Eventos Permitidos

| Evento            | Consome ativo |
| ----------------- | ------------- |
| Saque             | Sim           |
| Trade             | Sim           |
| Taxa              | Sim           |
| Falha operacional | Não           |

---

# 5. Conservação Global de Ativos

## Regra

A soma global de cada ativo deve permanecer constante, exceto em operações autorizadas de entrada ou saída.

### Formalização

Para cada ativo:

```text
TotalSistema =
SaldosUsuarios +
SaldosBloqueados +
SaldosOperacionais
```

### Exemplo

BTC existente:

| Local      | Quantidade |
| ---------- | ---------- |
| Usuários   | 80 BTC     |
| Bloqueado  | 15 BTC     |
| Tesouraria | 5 BTC      |

```text
Total BTC = 100 BTC
```

Após um trade:

```text
Total BTC = 100 BTC
```

O trade apenas redistribui propriedade.

---

# 6. Toda Ordem Deve Possuir Lastro Financeiro

## Regra

Nenhuma ordem pode existir sem que os ativos necessários estejam previamente bloqueados.

### Compra

```text
Saldo BRL >= Valor da Ordem
```

### Venda

```text
Saldo BTC >= Quantidade da Ordem
```

### Justificativa

Impede:

* Ordens descobertas.
* Alavancagem implícita.
* Fraudes operacionais.

---

# 7. Nenhum Trade Pode Existir Sem Duas Ordens Compatíveis

## Regra

Todo trade deve derivar do encontro entre:

* Uma ordem de compra.
* Uma ordem de venda.

### Formalização

```text
Trade = BuyOrder + SellOrder
```

### Justificativa

Trades não podem ser criados manualmente pelo sistema.

---

# 8. Toda Execução Deve Atualizar os Saldos Correspondentes

## Regra

Após a execução de um trade, os saldos envolvidos devem refletir imediatamente a negociação.

### Exemplo

Compra:

```text
0.5 BTC
Preço = 500.000 BRL
```

Resultado obrigatório:

| Participante | Alteração    |
| ------------ | ------------ |
| Comprador    | +0.5 BTC     |
| Comprador    | -250.000 BRL |
| Vendedor     | -0.5 BTC     |
| Vendedor     | +250.000 BRL |

---

# 9. Nenhuma Ordem Cancelada Pode Voltar ao Livro

## Regra

Uma ordem cancelada torna-se imutável.

### Estados Permitidos

```text
OPEN
 ├─► PARTIALLY_FILLED
 ├─► FILLED
 └─► CANCELLED
```

### Estado Proibido

```text
CANCELLED → OPEN
```

---

# 10. Ordens Totalmente Executadas Não Podem Receber Novas Execuções

## Regra

Após atingir sua quantidade total:

```text
ExecutedQuantity = OriginalQuantity
```

A ordem deve ser encerrada definitivamente.

### Estado Proibido

```text
FILLED → PARTIALLY_FILLED
FILLED → FILLED novamente
```

---

# 11. Nenhum Trade Pode Alterar o Preço Original Registrado

## Regra

Após persistido, o preço de execução torna-se imutável.

### Justificativa

Preserva:

* Auditoria.
* Reconciliação financeira.
* Integridade histórica.

---

# 12. O Histórico Deve Ser Imutável

## Regra

Eventos financeiros nunca podem ser apagados ou alterados.

### Eventos

* Trade
* Depósito
* Saque
* Taxa
* Ajuste
* Cancelamento

### Estratégia

Correções devem gerar novos eventos.

Nunca:

```text
UPDATE trade
DELETE trade
```

Sempre:

```text
INSERT correction_event
```

---

# 13. Todo Evento Deve Ser Auditável

## Regra

Toda alteração relevante deve possuir rastreabilidade.

### Informações Mínimas

| Campo     | Obrigatório |
| --------- | ----------- |
| EventId   | Sim         |
| Timestamp | Sim         |
| Usuário   | Sim         |
| Origem    | Sim         |
| Tipo      | Sim         |

---

# 14. O Matching Engine Deve Ser Determinístico

## Regra

Dado o mesmo livro de ofertas e mesma sequência de entrada, o resultado deve ser sempre idêntico.

### Justificativa

Permite:

* Reprocessamento.
* Auditoria.
* Recuperação de desastres.

---

# 15. Prioridade Preço-Tempo Deve Ser Preservada

## Regra

O algoritmo de matching deve respeitar:

1. Melhor preço.
2. Menor timestamp.

### Exemplo

Livro:

| Ordem | Preço | Hora  |
| ----- | ----- | ----- |
| A     | 100   | 10:00 |
| B     | 100   | 10:01 |

Execução obrigatória:

```text
A antes de B
```

---

# 16. Nenhum Usuário Pode Negociar Consigo Mesmo

## Regra

Uma ordem não pode casar com outra ordem pertencente ao mesmo usuário.

### Justificativa

Evita:

* Wash trading.
* Manipulação de volume.
* Dados de mercado artificiais.

---

# 17. Toda Taxa Deve Possuir Destino Contábil

## Regra

Toda cobrança deve ser creditada explicitamente em uma conta de receita.

### Formalização

```text
Taxa Debitada =
Taxa Creditada
```

### Proibido

```text
Taxa desaparece do sistema
```

---

# 18. Estados Devem Ser Monotônicos

## Regra

Uma entidade nunca pode retornar para um estado anterior.

### Exemplo

Ordem:

```text
OPEN
→ PARTIALLY_FILLED
→ FILLED
```

Nunca:

```text
FILLED → OPEN
```

---

# 19. Identificadores Devem Ser Globalmente Únicos

## Regra

Não podem existir dois registros com o mesmo identificador lógico.

### Entidades

* UserId
* OrderId
* TradeId
* DepositId
* WithdrawalId
* EventId

---

# 20. O Razão Contábil Deve Fechar

## Regra

Toda movimentação financeira deve obedecer ao princípio das partidas dobradas.

### Formalização

```text
Σ Débitos = Σ Créditos
```

### Exemplo

Compra de BTC:

| Conta         | Valor   |
| ------------- | ------- |
| BRL Comprador | -50.000 |
| BRL Vendedor  | +50.000 |

Resultado:

```text
Débitos = Créditos
```

---

# Invariante Suprema

## Integridade Patrimonial Global

A qualquer instante do sistema:

```text
Σ Ativos Existentes
=
Σ Ativos Depositados
+
Σ Ajustes Administrativos
-
Σ Saques
```

E simultaneamente:

```text
Σ Débitos
=
Σ Créditos
```

Essa é a propriedade máxima da Exchange. Se ela for preservada, o patrimônio digital da plataforma permanece íntegro, auditável e consistente.
