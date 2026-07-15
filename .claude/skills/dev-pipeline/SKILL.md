---
name: dev-pipeline
description: Pipeline completa de desenvolvimento. Orquestra todas as skills do projeto (ADR, planner, implementação, guards, testes, PR) em sequência, com gate de aprovação humana em cada etapa. Suporta implementação cross-project (API + Frontend). Gatilhos — (1) slash command /dev-pipeline; (2) usuário pede "desenvolver X", "implementar X do início ao fim", "rodar a pipeline completa". NÃO pula etapas. NÃO toma decisões sem aprovação. NÃO invocar automaticamente.
---

# Dev Pipeline — mybitcoin-api

Você é o **orquestrador** da pipeline de desenvolvimento. Sua função é guiar uma tarefa do conceito ao PR, executando as skills do projeto na ordem correta e PARANDO para aprovação humana em cada etapa.

**Você não implementa. Você orquestra.** Cada etapa é delegada à skill correspondente. Seu trabalho é garantir a sequência, coletar aprovações e avançar.

## Regras de ouro

1. **NUNCA pule uma etapa.** Mesmo que pareça óbvio, siga a ordem.
2. **NUNCA tome decisão de negócio.** Sempre pergunte ao usuário.
3. **NUNCA implemente diretamente.** Execute a skill da etapa, mostre o resultado, espere aprovação.
4. **pt-BR** em toda a comunicação.
5. **Gate = parada obrigatória.** Não avance sem "sim" explícito do usuário.
6. **Se qualquer etapa falhar**, volte para a etapa anterior corrigir — não avance com erro.

---

## Fluxo da Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  INÍCIO: /dev-pipeline <descrição da tarefa>            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  1. RECEPÇÃO   │  ← Perguntas iniciais (inclui escopo UI)
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  2. TRIAGEM    │  ← CA vs Simples? Frontend? Precisa de ADR?
              └───────┬────────┘
                      │
              ┌───────┴───────┐
              │               │
         Precisa ADR    Não precisa
              │               │
              ▼               │
    ┌──────────────────┐      │
    │ 3a. ARCHITECT    │      │
    └────────┬─────────┘      │
             │ GATE           │
             ▼                │
    ┌──────────────────┐      │
    │ 3b. VALIDATOR    │      │
    └────────┬─────────┘      │
             │ GATE           │
             ▼                │
    ┌──────────────────┐      │
    │ 3c. APROVAR ADR  │      │
    └────────┬─────────┘      │
             │ GATE           │
             │                │
             ▼                ▼
              ┌────────────────┐
              │ 4. TASK PLANNER│  ← Planeja API + Frontend
              └───────┬────────┘
                      │ GATE
                      ▼
              ┌────────────────┐
              │ 5. IMPLEMENTAR │
              │  API por camada│
              └───────┬────────┘
                      │ GATE por camada
                      ▼
              ┌────────────────┐
              │ 6. TESTES API  │
              └───────┬────────┘
                      │ GATE
                      ▼
              ┌────────────────┐
              │ 7. GUARDS API  │
              └───────┬────────┘
                      │ GATE
                      ▼
              ┌────────────────┐     ┌──────────────────────┐
              │ 8. IMPLEMENTAR │     │ Se "apenas API" na   │
              │  FRONTEND      │────▶│ Etapa 1, pula 8-10   │
              └───────┬────────┘     └──────────────────────┘
                      │ GATE por camada
                      ▼
              ┌────────────────┐
              │ 9. BUILD/LINT  │
              │  FRONTEND      │
              └───────┬────────┘
                      │ GATE
                      ▼
              ┌────────────────┐
              │ 10. GUARDS     │
              │  FRONTEND      │
              └───────┬────────┘
                      │ GATE
                      ▼
              ┌────────────────┐
              │ 11. PR         │  ← 1 PR API + 1 PR Frontend
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  FIM           │
              └────────────────┘
```

---

## Etapa 1 — RECEPÇÃO

**Objetivo:** entender o que o usuário quer.

1. Receba a descrição da tarefa de `$ARGUMENTS`.
2. Se a descrição for vaga, faça **no máximo 3 perguntas** para esclarecer:
   - O que deve acontecer? (comportamento esperado)
   - Quem usa? (usuário autenticado? admin? sistema?)
   - Há schema novo ou mudança de banco?
3. Se a funcionalidade envolver UI, pergunte também:
   - Quais telas/componentes o frontend deve ter? (apenas API? API + Frontend?)
   - Há mudança na API que o frontend precisa consumir?
4. Confirme o entendimento com o usuário antes de avançar.

**GATE 1:** "Entendi que a tarefa é: <resumo>. Escopo: <API / API + Frontend>. Correto? Avanço para triagem?"

---

## Etapa 2 — TRIAGEM

**Objetivo:** classificar a tarefa e decidir o caminho.

Leia `docs/architecture/04-quando-usar-clean-architecture.md` e classifique:

### 2.1 — Clean Architecture ou Simples?

| Critério | CA | Simples |
|----------|-----|---------|
| Toca saldo/ledger | ✅ | ❌ |
| Autenticação/KYC | ✅ | ❌ |
| Bitcoin on-chain | ✅ | ❌ |
| Regra de negócio de domínio | ✅ | ❌ |
| Efeito colateral auditável | ✅ | ❌ |
| CRUD puro, sem regra | ❌ | ✅ |

### 2.2 — Precisa de Frontend?

Se o usuário confirmou "API + Frontend" na Etapa 1:

| Critério Frontend | Simples | Complexo |
|-------------------|---------|----------|
| Página CRUD básica | ✅ | ❌ |
| Componente isolado | ✅ | ❌ |
| Nova store Zustand | ❌ | ✅ |
| Página multi-step | ❌ | ✅ |
| WebSocket/real-time | ❌ | ✅ |
| Tabela com paginação/filtering | ❌ | ✅ |

**Frontend complexo** pode precisar de ADR próprio (estágio 3 separado para frontend).

### 2.3 — Precisa de ADR?

**ADR é obrigatório** se qualquer um for verdadeiro:
- Schema novo de banco (tabela nova)
- Novo bounded context
- Muda padrão de código existente
- Integração externa nova
- Decisão arquitetural que afeta mais de um contexto
- Frontend complexo (nova store, WebSocket, página multi-step)

**ADR não é necessário** se:
- É continuação de ADR existente (ex: implementar endpoint para schema já definido em ADR)
- CRUD simples sem mudança de schema
- Fix de bug sem mudança de design
- Frontend simples (CRUD básico, componente isolado)

**GATE 2:** "Classificação: <CA/Simples>. Frontend: <Não / Simples / Complexo>. <Precisa/Não precisa> de ADR. <Motivo>. Avanço?"

---

## Etapa 3A — ADR ARCHITECT (se aplicável)

**Skill:** `/adr-architect`

1. Execute a skill `adr-architect` com a descrição da tarefa.
2. A skill vai grelhar o usuário com perguntas — **responda em nome do usuário** usando as respostas da Etapa 1, ou **repasse as perguntas** ao usuário se não tiver certeza.
3. A skill produzirá o ADR em `docs/adr/NNNN-<slug>.md`.

**GATE 3A:** Mostre o ADR produzido. "ADR criado em <caminho>. Revise. Aprova para validação?"

---

## Etapa 3B — ADR VALIDATOR (se aplicável)

**Skill:** `/adr-validator`

1. Execute a skill `adr-validator` com o caminho do ADR.
2. A skill vai analisar adversarialmente e dar veredito APROVA ou REVISAR.

**Se REVISAR:**
- Mostre os gaps encontrados.
- **GATE:** "Validador encontrou <N> gaps. Volto ao architect para corrigir, ou você quer ajustar manualmente?"
- Se voltar ao architect, repita 3A → 3B até APROVA.

**GATE 3B:** "ADR validado com APROVA. Avanço para aprovação final do ADR?"

---

## Etapa 3C — APROVAÇÃO FINAL DO ADR

**GATE 3C:** Mostre:
- Resumo do ADR (contexto, decisão, impacto).
- Gaps que foram corrigidos (se houve revisão).
- "Aprova este ADR para implementação? (sim/não/ajustar)"

Se "ajustar" → volte ao architect com as alterações do usuário.

---

## Etapa 4 — TASK PLANNER

**Skill:** `/task-planner`

1. Execute a skill `task-planner` com a descrição da tarefa (e referência ao ADR se existir).
2. A skill produzirá o plano de implementação com artefatos da API **e do frontend** (se aplicável).
3. Se frontend complexo, o planner também listará artefatos frontend na ordem correta.

**GATE 4:** Mostre o plano completo (API + Frontend). "Plano pronto. Aprova para implementação? Algum ajuste?"

---

## Etapa 5 — IMPLEMENTAÇÃO API

**Objetivo:** implementar o backend camada por camada, com gate entre cada uma.

> **Nota:** Se o usuário escolheu "apenas API" na Etapa 1, pule para a Etapa 11 (PR) após os guards.

### 5.1 — Domínio (`src/modules/<ctx>/domain/`)
1. Implemente todas as entidades, VOs, erros, eventos e interfaces de repositório do plano.
2. **GATE 5.1:** "Domínio implementado. <arquivos criados>. Aprova para aplicação?"

### 5.2 — Aplicação (`src/modules/<ctx>/application/`)
1. Implemente todos os use cases do plano.
2. **GATE 5.2:** "Aplicação implementada. <arquivos criados>. Aprova para infraestrutura?"

### 5.3 — Infraestrutura (`src/modules/<ctx>/infrastructure/`)
1. Implemente migrations, queries e repositórios do plano.
2. **GATE 5.3:** "Infraestrutura implementada. <arquivos criados>. Aprova para presentation?"

### 5.4 — Presentation (`src/modules/<ctx>/presentation/`)
1. Implemente DTOs, controllers e módulos do plano.
2. **GATE 5.4:** "Presentation implementada. <arquivos criados>. Aprova para testes?"

### Regras durante implementação:
- Siga a ordem do plano rigorosamente.
- Use `UnitOfWork` para operações multi-tabela.
- Valores monetários sempre em `bigint`.
- Erros sempre tipados (subclasses de `DomainError`).
- SQL nomeado em `*.sql.ts`, nunca inline.
- **Não commit nenhum.** O commit é na Etapa 11.

---

## Etapa 6 — TESTES API

1. Rode `pnpm test` no mybitcoin-api.
2. Se houver falhas de **regressão** (causadas pela mudança), **corrija antes de avançar**.
3. Se houver falhas **baseline** (já existiam), registre mas não bloqueie.
4. Verifique se os cenários do plano de testes do ADR/planner estão cobertos.

**GATE 6:** "Testes API: <verde/com falha>. Regressões: <nenhuma/lista>. Aprova para guards?"

---

## Etapa 7 — GUARDS API

Execute os guards conforme a natureza da tarefa:

| Guard | Quando executar |
|-------|----------------|
| `/arch-guard` | **Sempre** — qualquer mudança em `src/` |
| `/ledger-guard` | Se toca saldo, ledger, depósito, saque |
| `/security-guard` | Se toca autenticação, KYC, sessões, senhas |
| `/code-reviewer` | **Sempre** — qualidade de código |
| `/test-reviewer` | **Sempre** — qualidade dos testes |

**Para cada guard:**
1. Execute a skill.
2. Se retornar VIOLAÇÃO/ISSUES → **corrija** antes de avançar.
3. Se retornar CONFORME/PASS → avance.

**GATE 7:** "Guards API executados: <resultado de cada um>. Aprova para frontend?"

---

## Etapa 8 — IMPLEMENTAÇÃO FRONTEND

**Objetivo:** implementar o frontend no repositório mybitcoin-front.

> **Nota:** Se o usuário escolheu "apenas API" na Etapa 1, **PULE** esta etapa e vá para a Etapa 11 (PR).

**Skill:** `/frontend-executor`

1. Execute a skill `frontend-executor` com o plano aprovado.
2. A skill implementará na ordem: types → services → stores → hooks → components → pages.
3. Cada camada tem gate de aprovação humana.

**GATE 8:** "Frontend implementado: <resumo>. Aprova para build/lint frontend?"

---

## Etapa 9 — BUILD/LINT FRONTEND

1. No repositório frontend, rode `pnpm build` — deve passar sem erros de TypeScript.
2. Rode `pnpm lint` — sem erros de lint.
3. Se houver erros, **corrija antes de avançar**.

**GATE 9:** "Build frontend: <ok/erro>. Lint frontend: <ok/erro>. Aprova para guards frontend?"

---

## Etapa 10 — GUARDS FRONTEND

**Skill:** `/frontend-guard`

1. Execute a skill `frontend-guard` com os arquivos criados/modificados.
2. A skill verificará: invariantes (FIN-xxx, UI-xxx, DATA-xxx, SEC-xxx), padrões shadcn, component-reviewer, formulários, error handling.
3. Se retornar VIOLAÇÃO → **corrija** antes de avançar.
4. Se retornar CONFORME → avance.

**GATE 10:** "Guards frontend: <resultado>. Aprova para PR?"

---

## Etapa 11 — PR

### Se API + Frontend:
1. **PR da API** — componha título e corpo baseados no ADR (se existe) ou manualmente.
2. **PR do Frontend** — componha título e corpo baseados nos arquivos criados.
3. **GATE 11:** Mostre títulos, corpos e branches de ambos PRs. "Abro os PRs no GitHub? (sim/não)"

### Se apenas API:
1. Se há ADR → execute `/adr-pr`.
2. Se não há ADR → componha título e corpo do PR manualmente.
3. **GATE 11:** Mostre título, corpo e branch. "Abro o PR no GitHub? (sim/não)"

Após PR aberto:
- Se ADR existe → atualize status para `Em Progresso` com URL do PR.
- Informe os próximos passos de ops (migration, env vars, etc.).

---

## Etapa 12 — FIM

Resumo final:
- Tarefa implementada: <descrição>
- Escopo: <API / API + Frontend>
- ADR: <caminho ou "não aplicável">
- Arquivos criados/alterados (API): <lista>
- Arquivos criados/alterados (Frontend): <lista> (se aplicável)
- Testes API: <resultado>
- Guards API: <resultado de cada um>
- Guards Frontend: <resultado> (se aplicável)
- PR API: <URL ou "commitado localmente">
- PR Frontend: <URL ou "commitado localmente"> (se aplicável)

---

## Tratamento de erros

| Erro | Ação |
|------|------|
| Skill retorna erro | Mostre o erro, pergunte se quer retry ou pular |
| Guard retorna VIOLAÇÃO | Corrija o código, re-execite o guard |
| ADR validado como REVISAR | Volte ao architect com os gaps |
| Testes com regressão | Corrija antes de avançar |
| Build frontend com erro | Corrija antes de avançar |
| Frontend guard retorna VIOLAÇÃO | Corrija o código frontend, re-execite o guard |
| Usuário rejeita etapa | Volte à etapa anterior com as correções |

---

## Exemplo de uso

```
Usuário: /dev-pipeline implementar página de carteiras com saldo e histórico

Pipeline: Entendido. Vou guiar esta tarefa do início ao fim.

ETAPA 1 — RECEPÇÃO:
  Pergunta: O que a página deve mostrar? (saldo + tabela de transações)
  Pergunta: Precisa de paginação? (sim, 20 por página)
  Pergunta: Precisa de telas no frontend também? (SIM → pipeline unificada)
  Entendi que a tarefa é: Criar endpoint de saldo + histórico E página frontend
  com card de saldo e tabela de transações. Escopo: API + Frontend. Avanço para triagem?

ETAPA 2 — TRIAGEM:
  Classificação: Clean Architecture (toca ledger)
  Frontend: Complexo (tabela + paginação + store)
  Precisa de ADR: Sim (schema + endpoint + página complexa)
  Avanço?

ETAPA 3A — ARCHITECT:
  [executa /adr-architect com contexto da tarefa]
  ADR criado em docs/adr/0005-wallet-page.md
  Revise. Aprova para validação?

ETAPA 3B — VALIDATOR:
  [executa /adr-validator]
  APROVA
  Avanço para aprovação final?

ETAPA 3C — APROVAÇÃO:
  ADR aprovado. Avanço para planner?

ETAPA 4 — TASK PLANNER:
  [executa /task-planner]
  Plano: 8 artefatos API + 6 artefatos Frontend
  Avanço?

ETAPA 5 — IMPLEMENTAR API:
  5.1 Domain → gate
  5.2 Application → gate
  5.3 Infrastructure → gate
  5.4 Presentation → gate

ETAPA 6 — TESTES API:
  pnpm test → verde

ETAPA 7 — GUARDS API:
  /arch-guard → CONFORME
  /ledger-guard → CONFORME
  /code-reviewer → PASS
  /test-reviewer → PASS

ETAPA 8 — IMPLEMENTAR FRONTEND:
  [executa /frontend-executor]
  Types → gate
  Services + Hooks → gate
  Components → gate
  Pages → gate

ETAPA 9 — BUILD/LINT FRONTEND:
  pnpm build → ok
  pnpm lint → ok

ETAPA 10 — GUARDS FRONTEND:
  [executa /frontend-guard]
  CONFORME (FIN-001 ✓, UI-001 ✓, SEC-002 ✓)

ETAPA 11 — PR:
  PR API: feat/wallet-page-api
  PR Frontend: feat/wallet-page-frontend

ETAPA 12 — FIM:
  Tarefa completa. 2 PRs abertos.
```
