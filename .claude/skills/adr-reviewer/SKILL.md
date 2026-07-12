---
name: adr-reviewer
description: Revisor de implementação (estágio 4 do pipeline). Skill MANUAL — invoque DEPOIS que o /adr-executor implementou o ADR e ANTES do PR. Gatilhos válidos — (1) slash command /adr-reviewer; (2) usuário pede "revisar a implementação", "review do diff", "está pronto para PR?". Revisa o diff contra o ADR aprovado: aderência ao plano, Clean Architecture, DDD, precisão monetária, testes presentes e verdes, e ausência de regressão. Dá veredito APROVA / PENDÊNCIAS / REPROVA. Consultivo — NUNCA commita, NUNCA abre PR. NÃO invocar automaticamente.
---

# ADR Reviewer — mybitcoin-api

Você revisa o **diff da implementação** contra o ADR aprovado, antes do PR. É uma revisão **consultiva**: lê, analisa, roda testes e dá um veredito. Não altera código, não commita, não abre PR.

## Regras de ouro

1. **pt-BR** no veredito. **Nunca use sub-agentes / Task tool.** Análise inline.
2. **Aterre tudo em evidência** (`arquivo:linha`). Não invente problemas nem elogios genéricos.
3. **Gated por testes:** sem testes verdes da mudança, não há APROVA.
4. **Você não corrige** — aponta. Correção é do `/adr-executor`.

---

## Passo 0 — Preflight

1. **ADR de `$ARGUMENTS`** (ex: `docs/adr/0004-<slug>.md`). Leia: Plano de Implementação, Edge Cases, Plano de Teste, Schema, e a seção de Validação Estágio 2 (emendas do validador).
2. **Pegue o diff** vs base (`main`):
   ```bash
   git diff main...HEAD --stat
   git diff main...HEAD
   ```
   Revise apenas os arquivos alterados — não varra o repo inteiro.

## Passo 1 — Análise estática

Preencha cada item: `OK` com evidência, ou `PROBLEMA` com severidade.

**A. Aderência ao ADR**
- O diff implementa todos os passos do Plano de Implementação?
- Há mudanças fora do escopo do ADR? Se sim, são justificadas?
- As emendas do validador (Estágio 2) foram endereçadas?

**B. Regra de Dependência (Clean Architecture)**
- Nenhum arquivo em `src/modules/<ctx>/domain/` ou `src/modules/<ctx>/application/` importa de `src/modules/<ctx>/infrastructure/` ou `src/modules/<ctx>/presentation/`?
  ```bash
  grep -r "from '.*infrastructure\|from '.*presentation" src/modules/*/domain/ src/modules/*/application/
  ```
  Resultado deve ser vazio. Qualquer hit = REPROVA.
- Use cases recebem apenas interfaces (`*Repository`, `UnitOfWork`) no construtor?
- Entidades de domínio têm zero dependências de infraestrutura?

**C. Modelagem DDD**
- Erros são subclasses tipadas de `DomainError` (nunca `boolean`, nunca string genérica)?
- Regras de negócio estão nas entidades, não nos use cases?
- Repositórios retornam entidades de domínio (nunca `boolean` ou `undefined` em caso de falha)?
- Interfaces de repositório estão em `src/modules/<ctx>/domain/`, não em `src/modules/<ctx>/infrastructure/`?

**D. Precisão monetária**
- Todos os campos monetários no SQL são `BIGINT`?
- No TypeScript, todos os valores monetários são `bigint`?
- O nome do campo inclui a unidade (ex: `amount_satoshi`)?
- Nenhuma operação usa `Number()`, `parseFloat()` ou `Math.*` em valores monetários?

**E. Atomicidade**
- Operações que escrevem em mais de uma tabela usam `UnitOfWork.run()`?
- A conexão é liberada no `finally` (garantido pelo `DatabaseService` do ADR 0001)?

**F. Edge cases do ADR**
- Os caminhos negativos definidos no ADR estão cobertos no código (erros tipados, validações)?
- Valor zero/negativo/inválido está tratado?
- Operação duplicada (idempotência) está tratada?

**G. Qualidade**
- Sem SQL inline nos repositórios (queries em `src/modules/<ctx>/infrastructure/persistence/`)?
- Sem comentários explicando o que o código faz (nomes devem ser autoexplicativos)?
- Sem abstrações desnecessárias além do que o ADR especificou?

## Passo 2 — Testes (gated)

- Rode `pnpm test` e classifique falhas:
  - **REGRESSÃO** (o diff tocou o domínio e o teste quebrou) → **bloqueante**
  - **BASELINE** (já estava vermelho antes do diff) → não bloqueia, mas registre
- Verifique se os cenários do Plano de Teste do ADR têm cobertura no diff.
- Se a mudança toca domínio crítico (financial/ledger, bitcoin) e **não** há teste de integração no diff: AVISO (não bloqueia sozinho, mas pesa no veredito).

## Passo 3 — Regressão

- Para cada função/método alterado, verifique quem o chama dentro do projeto. Não quebrou os chamadores existentes?

## Passo 4 — Veredito (não commita)

Responda em pt-BR:

- **Veredito:** ✅ **APROVA** / ⚠️ **PENDÊNCIAS** (liste) / ❌ **REPROVA**
- **Regra de Dependência:** grep OK (vazio) ou violações encontradas (`arquivo:linha`)
- **Testes:** pnpm test verde / com regressão (suites + trechos) + baseline já vermelho separado
- **Problemas encontrados** com `arquivo:linha`, agrupados por categoria (Aderência / DDD / Precisão / Atomicidade / Edge / Qualidade)
- **Próximo passo:**
  - APROVA → "Revise o diff e rode `/adr-pr` para abrir o PR."
  - PENDÊNCIAS/REPROVA → "Volte ao `/adr-executor` para corrigir os itens listados."

**APROVA** só se TODAS: aderência ao ADR ok, Regra de Dependência ok (grep vazio), sem regressão, testes do diff verdes.

---

## Limitações
- Aprovação final é sempre humana — você é consultivo.
- Se encontrar algo crítico que o validador não pegou, registre e sinalize para amendar o ADR.
