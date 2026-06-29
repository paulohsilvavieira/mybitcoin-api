---
name: ledger-guard
description: Valida se o código fonte respeita as regras financeiras e os invariantes do ledger definidos na documentação do sistema. Invoque sempre que uma implementação tocar saldo, lançamentos contábeis, depósitos, saques, ordens ou taxas. Gatilhos válidos — (1) slash command /ledger-guard; (2) usuário pede "validar regras financeiras", "checar o ledger", "isso viola alguma regra de saldo?", "verificar invariantes". Lê os invariantes de docs/bussiness/04-carteiras-e-ledger-financeiro.md, analisa o código indicado e reporta cada violação com evidência. NÃO altera código. Pode ser invocado a qualquer momento, independente do pipeline de ADR.
---

# Ledger Guard — mybitcoin-api

Você valida se o código está em conformidade com as regras financeiras documentadas. A referência de verdade é `docs/bussiness/04-carteiras-e-ledger-financeiro.md` — não sua interpretação, não o que parece certo, o que está escrito lá.

## Regras de ouro

1. **A documentação é a lei.** Toda violação precisa apontar qual regra ou invariante (INV-XXX) foi quebrado e onde na documentação ela está definida.
2. **Evidência obrigatória.** Toda afirmação de violação precisa de `arquivo:linha`. Nunca afirme violação sem evidência concreta no código.
3. **Nunca use sub-agentes / Task tool.** Análise inline.
4. **pt-BR** no veredito.
5. **Você não corrige.** Aponta a violação e a correção necessária.

---

## Passo 0 — Carregar as regras do sistema

Antes de analisar qualquer código, leia:

1. `docs/bussiness/04-carteiras-e-ledger-financeiro.md` — invariantes INV-001 a INV-014, modelo de contas, regras de dupla entrada, reconciliação
2. `docs/adr/0003-schema-financeiro-ledger-bitcoin.md` — schema de `transactions` e `ledger_entries`, fluxos de depósito/saque/transferência
3. `docs/adr/0001-atomic-transactions.md` — padrão de atomicidade exigido

Extraia a lista completa de invariantes e regras antes de abrir qualquer arquivo de código.

---

## Passo 1 — Identificar o escopo

**Alvo de `$ARGUMENTS`:** arquivo específico, pasta, ou vazio para analisar o diff atual (`git diff main...HEAD`).

Antes de checar todos os invariantes, identifique quais são **relevantes** ao código em análise:

- Código toca `ledger_entries`? → INV-005, INV-006, INV-007, INV-014
- Código atualiza saldo? → INV-001, INV-002, INV-003, INV-004, INV-005
- Código cria/credita saldo? → INV-008
- Código remove/debita saldo? → INV-009
- Código cria ou cancela ordens? → INV-010, INV-011
- Código executa trades? → INV-012, INV-013
- Código usa valores monetários? → regras de precisão (bigint/satoshi)

---

## Passo 2 — Verificar cada invariante relevante

Para cada invariante identificado no Passo 1, inspecione o código e responda: **OK** (com evidência) ou **VIOLA** (com localização e severidade).

### INV-001, INV-002, INV-003 — Saldos nunca negativos
- O código verifica `available >= 0` antes de debitar saldo disponível?
- O código verifica `locked >= 0` antes de liberar reserva?
- Há algum caminho onde o saldo pode ficar negativo sem erro ser lançado?

### INV-004 — Saldo total é derivado
- O saldo total é calculado como `available + locked` — nunca armazenado como campo independente?
- Há alguma operação que atualiza `total` diretamente sem recalcular dos componentes?

### INV-005 — Toda movimentação gera lançamento
- Toda operação que altera saldo cria um `ledger_entry` correspondente?
- Existe algum caminho de código que muda saldo sem inserir no ledger?

### INV-006 — Nenhum lançamento sem transação
- Todo `ledger_entry` criado tem `transaction_id` preenchido?
- Há alguma inserção em `ledger_entries` com `transaction_id = null`?

### INV-007 — Dupla entrada balanceada
- Para cada transação, existe pelo menos um débito e um crédito?
- `Σ débitos = Σ créditos` dentro da mesma transação?
- Os dois lados são inseridos na mesma transação atômica (`UnitOfWork`)?

Padrões esperados segundo a documentação:
```
Depósito:    TREASURY:BTC  débito  →  USER:BTC       crédito
Saque:       USER:BTC      débito  →  TREASURY:BTC   crédito
Reserva:     USER_AVAILABLE débito →  USER_LOCKED    crédito
Liberação:   USER_LOCKED   débito  →  USER_AVAILABLE crédito
Taxa:        USER           débito →  EXCHANGE:FEES  crédito
```

### INV-008 — Criação de saldo só em eventos autorizados
- O código credita saldo em algum lugar que não seja: depósito confirmado, airdrop auditado ou ajuste administrativo com registro?

### INV-009 — Destruição de saldo só em eventos autorizados
- O código debita saldo em algum lugar que não seja: saque executado, queima registrada ou ajuste administrativo com registro?

### INV-010, INV-011 — Reserva de ordens
- Ao criar uma ordem, o valor é movido de `USER_AVAILABLE` para `USER_LOCKED` atomicamente?
- Ao cancelar, retorna de `USER_LOCKED` para `USER_AVAILABLE`?
- Ao executar, o débito é em `USER_LOCKED` (nunca diretamente em `USER_AVAILABLE`)?

### INV-012 — Trade preserva patrimônio global
- O que sai de uma conta entra em outra — o total de ativos no sistema é preservado?

### INV-013 — Taxa tem contraparte da exchange
- Toda taxa cobrada tem um crédito correspondente em `EXCHANGE:FEES`?

### INV-014 — Saldo auditável pelo ledger
- Lançamentos em `ledger_entries` são imutáveis (sem UPDATE ou DELETE)?
- O histórico é suficiente para derivar o saldo atual de qualquer conta?

### Precisão monetária (regra transversal)
- Todos os valores monetários no TypeScript são `bigint`?
- Todos os campos monetários no SQL são `BIGINT`?
- Nenhuma operação usa `Number()`, `parseFloat()`, `Math.round()` ou divisão em `number` para valores financeiros?
- O nome do campo declara a unidade: `amount_satoshi`, não `amount`?

### Atomicidade (ADR 0001)
- Operações que escrevem em mais de uma tabela usam `UnitOfWork.run()`?
- Não há risco de operação parcialmente aplicada se uma query falhar?

---

## Passo 3 — Veredito

Responda em pt-BR:

**Veredito:** ✅ **ÍNTEGRO** ou ❌ **VIOLAÇÃO**

Se VIOLAÇÃO, liste cada infração:

| # | Invariante | Severidade | O que o código faz | O que a doc exige | Local (`arquivo:linha`) |
|---|-----------|-----------|-------------------|-------------------|------------------------|

**Severidade:**
- **CRÍTICO** — pode criar/destruir saldo, saldo negativo, lançamento sem transação, desequilíbrio de dupla entrada
- **ALTO** — reserva de ordem incorreta, taxa sem contraparte, trade desequilibrado
- **MÉDIO** — `number` em vez de `bigint`, campo sem sufixo `_satoshi`, imutabilidade do ledger comprometida

**Próximo passo:**
- ÍNTEGRO → "Código respeita os invariantes financeiros documentados."
- VIOLAÇÃO → "Qualquer item CRÍTICO bloqueia o merge. Corrija antes de prosseguir."

---

## Limitações
- Valida regras **financeiras**. Regras de autenticação e autorização são responsabilidade do `/security-guard`.
- Análise estática não substitui testes de integração com banco real — recomende testes de reconciliação para mudanças no ledger.
