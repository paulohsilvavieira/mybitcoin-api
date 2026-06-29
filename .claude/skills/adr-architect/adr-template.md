# ADR NNNN — <título curto da decisão>

**Status:** Rascunho <!-- Rascunho | Proposto | Aceito | Em Progresso | Implementado | Substituído -->
**Data:** AAAA-MM-DD
**Autores:** Time de Backend
**Contexto relacionado:** <!-- ADR 0001, 0002, 0003 se aplicável -->
**Gerado por:** skill `/adr-architect`

---

## Contexto

<O problema ou necessidade. O que motivou esta decisão. Comportamento atual e por que mudar.
Referências aos bounded contexts afetados.>

---

## Forças em Jogo

- <restrição ou requisito que a decisão precisa satisfazer>
- <restrição ou requisito que a decisão precisa satisfazer>
- <trade-off relevante>

---

## Decisão

<A solução escolhida. Subseções com exemplos de schema ou código quando ajudar.>

### Schema (se houver mudança de banco)

```sql
-- Descrição da tabela
tabela_nome (
  id          SERIAL PRIMARY KEY,
  campo       TIPO NOT NULL,
  ...
)
```

### Rationale

**Por que <escolha A> e não <alternativa B>?**
<Justificativa da decisão.>

---

## Impacto nos Bounded Contexts (OBRIGATÓRIO)

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| account/kyc    |         |                 |
| financial      |         |                 |
| bitcoin        |         |                 |

**Entidades de domínio afetadas:** <lista>
**Interfaces de repositório afetadas:** <lista>
**Migrations necessárias:** sim / não

---

## Checklist de Arquitetura (OBRIGATÓRIO)

- [ ] Nenhum arquivo em `domain/` importa de `infrastructure/` ou `interface-adapters/`
- [ ] Valores monetários usam `BIGINT` no banco e `bigint` no TypeScript
- [ ] Erros de domínio são subclasses de `DomainError` (nunca boolean de retorno)
- [ ] Operações multi-tabela usam `UnitOfWork` (ADR 0001)
- [ ] Entidades não recebem dependências de infraestrutura no construtor

---

## Plano de Implementação (OBRIGATÓRIO — na ordem)

### 1. Domínio (`src/domain/`)
- [ ] <passo> — `arquivo`

### 2. Aplicação (`src/application/`)
- [ ] <passo> — `arquivo`

### 3. Infraestrutura (`src/infrastructure/`)
- [ ] <passo> — `arquivo` (migration, repositório, etc.)

### 4. Interface Adapters (`src/interface-adapters/`)
- [ ] <passo> — `arquivo` (controller, DTO, etc.)

---

## Edge Cases & Erros de Domínio (OBRIGATÓRIO)

| Caso | Erro de domínio | Comportamento decidido |
|------|----------------|----------------------|
| registro inexistente | `XxxNotFoundError` | |
| valor inválido / zero | `InvalidXxxError` | |
| operação duplicada | `XxxAlreadyExistsError` | |
| saldo insuficiente (se aplicável) | `InsufficientBalanceError` | |

---

## Plano de Teste (OBRIGATÓRIO)

- [ ] Unit (entidade): <cenários, incluindo edge cases acima>
- [ ] Unit (use case): <cenários com repositório mockado>
- [ ] Integração: <fluxo completo com banco real>
- [ ] Negativo: registro inexistente, valores inválidos, falha parcial

---

## Fluxos (se aplicável)

```
1. <passo>
   → <efeito>

2. <passo>
   → <efeito>
```

---

## Consequências

**Positivas:**
- <benefício>

**Negativas / Trade-offs:**
- <custo ou limitação>

---

## Decisões do Usuário (rastreabilidade)

> Confirmadas no grelhamento (Passo 2 da skill). Não são suposições do arquiteto.

- AAAA-MM-DD — <pergunta> → <resposta do usuário>

---

## Referências

- ADR NNNN — <título>
- <link ou doc relevante>
