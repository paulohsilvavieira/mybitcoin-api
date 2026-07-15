---
name: task-planner
description: Planeja a implementação de uma funcionalidade ANTES de escrever qualquer código. Carrega o contexto de documentação relevante, classifica a abordagem (CA vs simples), lista os artefatos a criar na ordem correta e define quais guards executar ao final. Suporta planejamento cross-project (API + Frontend). Gatilhos válidos — (1) slash command /task-planner; (2) usuário pede "planejar a implementação", "como implementar X", "quais arquivos preciso criar para Y", "me ajuda a planejar antes de codar", "por onde começo". Produz um plano estruturado e PARA para aprovação humana antes de qualquer implementação. NÃO escreve código. NÃO invocar automaticamente.
---

# Task Planner — mybitcoin-api

Você monta o plano de implementação antes de qualquer código ser escrito. Isso evita arquivos na camada errada, contexto de documentação ignorado e guards violados antes mesmo de terminar.

**Regra de ouro:** um plano ruim cria dívida difícil de reverter. Um plano bom é 10 minutos. Gaste os 10 minutos.

---

## Passo 0 — Entender a tarefa

**Alvo de `$ARGUMENTS`:** descrição da funcionalidade a implementar.

Se a descrição for vaga, faça **no máximo 2 perguntas** para esclarecer o essencial:
- O que o usuário/sistema faz? (input)
- O que deve acontecer no final? (output/efeito)

Não faça mais perguntas do que o necessário. Com a resposta, siga em frente.

---

## Passo 1 — Carregar documentação relevante

Identifique o bounded context da tarefa e leia os documentos correspondentes:

**Por contexto:**

| Contexto | Documentos a ler |
|----------|----------------|
| Identidade / autenticação / KYC | `docs/bussiness/02-identidade-e-acesso.md` + `docs/adr/0002-schema-identidade-kyc.md` |
| Financeiro / ledger / saldo | `docs/bussiness/04-carteiras-e-ledger-financeiro.md` + `docs/adr/0001-unit-of-work-pattern.md` |
| Bitcoin / depósito / saque on-chain | `docs/bussiness/09-depositos-e-saques.md` |
| Order book / matching / trades | `docs/bussiness/05-mercados-de-negociacao.md` + `docs/bussiness/06-order-book.md` + `docs/bussiness/07-matching-engine.md` + `docs/bussiness/08-trades-maker-taker-taxas.md` |
| Admin / configuração | `docs/architecture/04-quando-usar-clean-architecture.md` |
| Qualquer contexto | `docs/bussiness/11-invariantes-globais.md` (invariantes que se aplicam a tudo) |

Também leia `docs/architecture/04-quando-usar-clean-architecture.md` para classificar a abordagem.

**Extraia e liste as regras de negócio relevantes para esta tarefa antes de montar o plano.**

---

## Passo 2 — Classificar a abordagem

Aplique o critério de `docs/architecture/04-quando-usar-clean-architecture.md`:

**Clean Architecture** se qualquer um dos itens for verdadeiro:
- Toca saldo, ledger ou movimentação financeira
- Executa ou valida regra de negócio de domínio
- Envolve autenticação, autorização, KYC ou tokens
- Toca Bitcoin on-chain (transações, endereços, confirmações)
- Pode afetar múltiplos usuários ou produzir efeito colateral auditável

**Abordagem simples** se todos forem verdadeiros:
- CRUD puro sem regra de negócio
- Não afeta saldo, segurança ou Bitcoin
- Operação administrativa ou de configuração
- Falha não compromete integridade financeira ou de acesso

---

## Passo 3 — Mapear os artefatos

### Se Clean Architecture:

Liste os artefatos na **ordem de implementação** (do interior para o exterior):

```
DOMÍNIO (src/modules/<contexto>/domain/)
  □ <entidade>.entity.ts            — se for entidade nova
  □ <conceito>.value-object.ts      — se for value object novo
  □ <nome>.errors.ts                — erros tipados que a tarefa introduz
  □ <nome>.events.ts                — domain events emitidos (se houver)
  □ <nome>.repository.ts            — interface *Repository (se persistir)

APLICAÇÃO (src/modules/<contexto>/application/)
  □ <nome>.usecase.ts               — o use case

INFRAESTRUTURA (src/modules/<contexto>/infrastructure/persistence/)
  □ <contexto>.sql.ts               — SQL nomeado
  □ pg-<nome>.repository.ts         — implementação
  □ migrations/<timestamp>_<descricao>.sql — se há mudança de schema (em src/infrastructure/database/migrations/)

PRESENTATION (src/modules/<contexto>/presentation/)
  □ <nome>.dto.ts                   — DTO de entrada com class-validator
  □ <nome>.controller.ts            — endpoint(s)
  □ <contexto>.module.ts            — registrar no módulo (se necessário)

TESTES
  □ src/modules/<ctx>/domain/<entidade>.entity.spec.ts
  □ src/modules/<ctx>/application/<nome>.usecase.spec.ts
  □ src/modules/<ctx>/infrastructure/persistence/<nome>.spec.ts
```

### Se abordagem simples (CRUD dentro do módulo):

```
  □ <recurso>.dto.ts                — validação de entrada
  □ <recurso>.service.ts            — lógica e SQL direto no service
  □ <recurso>.controller.ts         — endpoints
  □ <recurso>.module.ts

TESTES
  □ src/modules/<ctx>/application/<recurso>.service.spec.ts
```

---

## Passo 3B — Mapear artefatos Frontend (se aplicável)

Se a tarefa envolve frontend (usuário confirmou "API + Frontend" na recepção), liste também os artefatos do mybitcoin-front.

Leia `.pipeline-config.json` na raiz do mybitcoin-api para obter o path do frontend.

### Ordem de implementação frontend:

```
TIPOS (<frontend>/src/types/)
  □ <nome>.types.ts          — interfaces de request, response e modelos de UI
                               valores monetários: amount_satoshi: string (nunca number)

SERVICE + HOOKS QUERY (<frontend>/src/services/)
  □ <nome>.service.ts        — funções axios
  □ use<Nome>.ts             — useQuery / useMutation wrappando o service
                               queryKey estável, staleTime intencional, invalidação no onSuccess

STORE (<frontend>/src/stores/) — só se estado global
  □ use<Nome>Store.ts        — store Zustand com slice mínimo
                               Só para dados compartilhados entre páginas distantes

HOOKS (<frontend>/src/hooks/)
  □ use<Nome>.ts             — lógica reutilizável extraída de componentes

COMPONENTES (<frontend>/src/components/<domínio>/)
  □ <Nome>.tsx               — componente ≤ 150 linhas, ≤ 5 props
                               mobile-first, aria-label, tokens semânticos
                               estados: loading (Skeleton), error (Alert), empty (EmptyState)

FORMULÁRIOS (se aplicável)
  □ Schema zod em <frontend>/src/types/<nome>.schema.ts
  □ Componente usando react-hook-form + zodResolver + shadcn Form
  □ Erros da API via form.setError('root', { message })

PÁGINA (<frontend>/src/pages/<rota>/)
  □ <Nome>.tsx               — composição dos componentes
                               Envolta em <ErrorBoundary>
                               Lazy loaded com React.lazy()
                               Sem lógica de negócio inline

TESTES FRONTEND (<frontend>/src/)
  □ <arquivo>.test.tsx       — testes com Vitest + Testing Library
                               happy path, error state, loading, edge cases
```

---

## Passo 4 — Identificar dependências e riscos

Para cada artefato listado, responda:

- **Depende de algo que ainda não existe?** (ex: interface AccountRepository que ainda não foi criada)
- **Muda schema existente?** → precisa de migration + verificar dados já existentes
- **Toca ledger?** → `/ledger-guard` obrigatório ao final
- **Toca autenticação/KYC?** → `/security-guard` obrigatório ao final
- **Cria arquivos em `src/modules/<ctx>/domain/` ou `src/modules/<ctx>/application/`?** → `/arch-guard` obrigatório ao final
- **É operação multi-tabela?** → `UnitOfWork` é obrigatório no use case

---

## Passo 5 — Regras de negócio extraídas

Liste explicitamente as regras do documento que se aplicam a esta tarefa. Exemplo:

```
Regras de negócio identificadas em docs/bussiness/04-carteiras-e-ledger-financeiro.md:
  □ INV-001: saldo disponível não pode ficar negativo após a operação
  □ INV-005: toda movimentação de saldo deve gerar ledger_entry
  □ INV-007: Σ débitos = Σ créditos dentro da mesma transação
  □ INV-006: todo ledger_entry deve ter transaction_id
```

Estas regras devem aparecer nos testes e na lógica do use case/entidade.

---

## Passo 6 — Perguntas não respondidas

Liste qualquer suposição que o plano teve de fazer que o usuário deveria confirmar:

```
Suposições que precisam de confirmação:
  □ O endpoint é autenticado? (assumido que sim — qualquer operação financeira exige)
  □ Um usuário pode ter múltiplas carteiras do mesmo ativo? (assumido que não)
  □ Qual o limite máximo de saque? (não encontrado na documentação)
```

---

## Formato de entrega

```
## Plano de implementação: <nome da funcionalidade>

### Abordagem
<Clean Architecture / Simples> — <motivo em uma frase>

### Bounded context
<contexto identificado>

### Regras de negócio aplicáveis
- <INV-XXX / CAD-XXX / etc.>: <descrição>

### Artefatos a criar (em ordem)

**1. Domínio**
- [ ] src/modules/<ctx>/domain/<nome>.ts — <para que serve>

**2. Aplicação**
- [ ] src/modules/<ctx>/application/<nome>.usecase.ts — <o que orquestra>

**3. Infraestrutura**
- [ ] src/modules/<ctx>/infrastructure/persistence/<ctx>.sql.ts — <queries SQL>
- [ ] src/modules/<ctx>/infrastructure/persistence/pg-<nome>.repository.ts — <implementação>
- [ ] src/infrastructure/database/migrations/<ts>_<desc>.sql — <o que muda>

**4. Presentation**
- [ ] src/modules/<ctx>/presentation/<nome>.dto.ts
- [ ] src/modules/<ctx>/presentation/<nome>.controller.ts

**5. Testes**
- [ ] src/modules/<ctx>/domain/<nome>.entity.spec.ts — testar: <invariantes principais>
- [ ] src/modules/<ctx>/application/<nome>.usecase.spec.ts — testar: <caminho feliz + erros esperados>
- [ ] src/modules/<ctx>/infrastructure/persistence/pg-<nome>.repository.spec.ts — testar: <persistência + bigint>

### Guards a executar ao final

**API:**
- [ ] /arch-guard — verificar Regra de Dependência
- [ ] /ledger-guard — verificar invariantes financeiros (se aplicável)
- [ ] /security-guard — verificar regras de acesso (se aplicável)
- [ ] /code-reviewer — verificar complexidade e código limpo
- [ ] /test-reviewer — verificar qualidade dos testes

**Frontend (se aplicável):**
- [ ] /frontend-guard — verificar invariantes frontend (FIN-xxx, UI-xxx, DATA-xxx, SEC-xxx)
- [ ] build frontend — pnpm build sem erros TypeScript
- [ ] lint frontend — pnpm lint sem erros

### Riscos e dependências
- <risco identificado>

### Suposições pendentes de confirmação
- [ ] <suposição que o usuário precisa validar>
```

---

## Gate humano

Após exibir o plano, **PARE**. Não implemente nada.

Diga: "Plano pronto. Confirme para iniciar a implementação, ajuste o que for necessário, ou invoque `/adr-architect` se esta mudança exige uma decisão arquitetural formal primeiro."

Se a tarefa envolver schema novo ou mudança de padrão → sugira `/adr-architect` antes de implementar.
