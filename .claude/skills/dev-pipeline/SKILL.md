---
name: dev-pipeline
description: Pipeline completa de desenvolvimento. Orquestra todas as skills do projeto (ADR, planner, implementação, guards, testes, PR) em sequência, com gate de aprovação humana em cada etapa. Gatilhos — (1) slash command /dev-pipeline; (2) usuário pede "desenvolver X", "implementar X do início ao fim", "rodar a pipeline completa". NÃO pula etapas. NÃO toma decisões sem aprovação. NÃO invocar automaticamente.
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
              │  1. RECEPÇÃO   │  ← Perguntas iniciais
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  2. TRIAGEM    │  ← CA vs Simples? Precisa de ADR?
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
              │ 4. TASK PLANNER│
              └───────┬────────┘
                      │ GATE
                      ▼
              ┌────────────────┐
              │ 5. IMPLEMENTAR │
              │  por camada    │
              └───────┬────────┘
                      │ GATE por camada
                      ▼
              ┌────────────────┐
              │ 6. TESTES      │
              └───────┬────────┘
                      │ GATE
                      ▼
              ┌────────────────┐
              │ 7. GUARDS      │
              └───────┬────────┘
                      │ GATE
                      ▼
              ┌────────────────┐
              │ 8. PR          │
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
3. Confirme o entendimento com o usuário antes de avançar.

**GATE 1:** "Entendi que a tarefa é: <resumo>. Correto? Avanço para triagem?"

---

## Etapa 2 — TRIAGEM

**Objetivo:** classificar a tarefa e decidir o caminho.

Leia `docs/architecture/04-quando-usar-clean-architecture.md` e classifique:

### 2.1 — Clean Architecture ou Simples?

| Critério | CA | Simples (`src/admin/`) |
|----------|-----|----------------------|
| Toca saldo/ledger | ✅ | ❌ |
| Autenticação/KYC | ✅ | ❌ |
| Bitcoin on-chain | ✅ | ❌ |
| Regra de negócio de domínio | ✅ | ❌ |
| Efeito colateral auditável | ✅ | ❌ |
| CRUD puro, sem regra | ❌ | ✅ |

### 2.2 — Precisa de ADR?

**ADR é obrigatório** se qualquer um for verdadeiro:
- Schema novo de banco (tabela nova)
- Novo bounded context
- Muda padrão de código existente
- Integração externa nova
- Decisão arquitetural que afeta mais de um contexto

**ADR não é necessário** se:
- É continuação de ADR existente (ex: implementar endpoint para schema já definido em ADR)
- CRUD simples sem mudança de schema
- Fix de bug sem mudança de设计

**GATE 2:** "Classificação: <CA/Simples>. <Precisa/Não precisa> de ADR. <Motivo>. Avanço?"

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
2. A skill produzirá o plano de implementação com artefatos, ordem e guards.

**GATE 4:** Mostre o plano completo. "Plano pronto. Aprova para implementação? Algum ajuste?"

---

## Etapa 5 — IMPLEMENTAÇÃO

**Objetivo:** implementar camada por camada, com gate entre cada uma.

### 5.1 — Domínio (`src/domain/`)
1. Implemente todas as entidades, VOs, erros, eventos e interfaces de repositório do plano.
2. **GATE 5.1:** "Domínio implementado. <arquivos criados>. Aprova para aplicação?"

### 5.2 — Aplicação (`src/application/`)
1. Implemente todos os use cases do plano.
2. **GATE 5.2:** "Aplicação implementada. <arquivos criados>. Aprova para infraestrutura?"

### 5.3 — Infraestrutura (`src/infrastructure/`)
1. Implemente migrations, queries e repositórios do plano.
2. **GATE 5.3:** "Infraestrutura implementada. <arquivos criados>. Aprova para interface adapters?"

### 5.4 — Interface Adapters (`src/interface-adapters/`)
1. Implemente DTOs, controllers e módulos do plano.
2. **GATE 5.4:** "Interface implementada. <arquivos criados>. Aprova para testes?"

### Regras durante implementação:
- Siga a ordem do plano rigorosamente.
- Use `UnitOfWork` para operações multi-tabela.
- Valores monetários sempre em `bigint`.
- Erros sempre tipados (subclasses de `DomainError`).
- SQL nomeado em `*.queries.ts`, nunca inline (exceto `src/admin/`).
- **Não commit nenhum.** O commit é na Etapa 8.

---

## Etapa 6 — TESTES

1. Rode `pnpm test`.
2. Se houver falhas de **regressão** (causadas pela mudança), **corrija antes de avançar**.
3. Se houver falhas **baseline** (já existiam), registre mas não bloqueie.
4. Verifique se os cenários do plano de testes do ADR/planner estão cobertos.

**GATE 6:** "Testes: <verde/com falha>. Regressões: <nenhuma/lista>. Aprova para guards?"

---

## Etapa 7 — GUARDS

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

**GATE 7:** "Guards executados: <resultado de cada um>. Aprova para PR?"

---

## Etapa 8 — PR (se aplicável)

**Skill:** `/adr-pr` (se ADR existe) ou abertura manual de PR.

1. Se há ADR → execute `/adr-pr`.
2. Se não há ADR → componha título e corpo do PR manualmente.
3. **GATE 8:** Mostre título, corpo e branch. "Abro o PR no GitHub? (sim/não)"

Após PR aberto:
- Se ADR existe → atualize status para `Em Progresso` com URL do PR.
- Informe os próximos passos de ops (migration, env vars, etc.).

---

## Etapa 9 — FIM

Resumo final:
- Tarefa implementada: <descrição>
- ADR: <caminho ou "não aplicável">
- Arquivos criados/alterados: <lista>
- Testes: <resultado>
- Guards: <resultado de cada um>
- PR: <URL ou "commitado localmente">

---

## Tratamento de erros

| Erro | Ação |
|------|------|
| Skill retorna erro | Mostre o erro, pergunte se quer retry ou pular |
| Guard retorna VIOLAÇÃO | Corrija o código, re-execite o guard |
| ADR validado como REVISAR | Volte ao architect com os gaps |
| Testes com regressão | Corrija antes de avançar |
| Usuário rejeita etapa | Volte à etapa anterior com as correções |

---

## Exemplo de uso

```
Usuário: /dev-pipeline implementar login com httpOnly cookies

Pipeline: Entendido. Vou guiar esta tarefa do início ao fim.

ETAPA 1 — RECEPÇÃO:
  Pergunta: O cookie deve conter o JWT de acesso? Ou apenas um session ID que referencia o servidor?
  [resposta do usuário]
  Pergunta: O refresh token também deve ser httpOnly, ou só o access token?
  [resposta do usuário]
  Entendi que a tarefa é: Implementar autenticação com cookies httpOnly para JWT access token
  e refresh token. Avanço para triagem?

ETAPA 2 — TRIAGEM:
  Classificação: Clean Architecture (toca autenticação)
  Precisa de ADR: Sim (muda padrão de como tokens são entregues)
  Avanço?

ETAPA 3A — ARCHITECT:
  [executa /adr-architect com contexto da tarefa]
  ADR criado em docs/adr/0004-auth-httpOnly-cookies.md
  Revise. Aprova para validação?

...e assim por diante até o PR.
```
