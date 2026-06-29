---
name: adr-executor
description: Executor de ADR (estágio 3 do pipeline). Skill MANUAL — invoque para IMPLEMENTAR um ADR já APROVADO (Status Aceito + Validação Estágio 2 = APROVA). Gatilhos válidos — (1) slash command /adr-executor; (2) usuário pede "implementar o ADR", "executar o ADR", "codar o que o ADR aprovou". Implementa na ordem correta (domain → application → infrastructure → interface-adapters), aplica os princípios de Clean Architecture e DDD, adiciona testes do plano do ADR, e PARA no gate humano antes de commitar. NÃO invocar automaticamente.
---

# ADR Executor — mybitcoin-api

Você implementa um ADR **já aprovado**, seguindo estritamente o plano de implementação. O ADR é a especificação e os documentos de arquitetura são a lei. Você é um implementador disciplinado — não um designer.

## Regras de ouro (inquebráveis)

1. **Só executa ADR aprovado.** Se o ADR não está `Status: Aceito` com Validação Estágio 2 = APROVA, **PARE** e peça para rodar `/adr-validator` antes.
2. **Ordem obrigatória:** domain → application → infrastructure → interface-adapters. Nunca ao contrário.
3. **A Regra de Dependência é absoluta.** Nenhum arquivo em `domain/` ou `application/` pode importar de `infrastructure/` ou `interface-adapters/`. Se o ADR pede isso, **sinalize e pare**.
4. **Dinheiro sempre em `bigint`.** Nenhum valor monetário em `number` ou `float`.
5. **Erros tipados, nunca boolean.** Falhas de domínio são subclasses de `DomainError`.
6. **Nunca use sub-agentes / Task tool.** Implemente inline.
7. **Você PARA no gate.** NÃO commita, NÃO abre PR. Implementa, testa e reporta.

---

## Passo 0 — Preflight

1. **ADR de `$ARGUMENTS`** (ex: `docs/adr/0004-<slug>.md`). Leia o ADR inteiro:
   - Status, Validação Estágio 2, Plano de Implementação, Edge Cases, Plano de Teste, Schema.
2. **Confirme aprovação:** procure `Status: Aceito` + bloco `Validação (Estágio 2) ... APROVA`. Se não existir, **PARE**.
3. Leia os documentos de arquitetura:
   - `docs/architecture/02-clean-architecture-ddd-fundamentos.md` — os princípios
   - `docs/architecture/03-estrutura-projeto.md` — onde cada arquivo deve morar
4. Leia o código existente nos bounded contexts afetados para entender o padrão já estabelecido antes de criar qualquer arquivo novo.

## Passo 1 — Implementar na ordem correta

### 1. Domínio (`src/domain/<contexto>/`)

Para cada entidade/value object/event/erro do ADR:
- Crie a entidade com métodos de negócio (sem dependências de infra no construtor).
- Crie value objects para conceitos sem identidade (ex: `Satoshi`, `BitcoinAddress`).
- Crie domain events para fatos que outros contextos precisam reagir.
- Crie erros tipados: `class XxxNotFoundError extends DomainError`.
- Crie a abstract class de repositório: `XxxRepository` (sem prefixo `I`) com retorno de entidades (nunca boolean). A implementação usará `extends XxxRepository`.

### 2. Aplicação (`src/application/<contexto>/`)

Para cada use case do ADR:
- Recebe abstract classes de repositório e `UnitOfWork` no construtor — nunca implementações concretas (ex: `TransactionRepository`, nunca `TransactionPostgresRepository`).
- Método `execute(input: XxxInput): Promise<XxxOutput>`.
- Orquestra entidades; regras de negócio ficam nas entidades, não aqui.
- Operações multi-tabela envolvidas em `this.uow.run(async (uow) => { ... })`.

### 3. Infraestrutura (`src/infrastructure/`)

Para cada repositório/migration do ADR:
- Crie a migration SQL em `src/infrastructure/database/migrations/` (nome: `<timestamp>_<slug>.sql`).
- Crie as queries SQL em `src/infrastructure/database/queries/<contexto>.queries.ts` (SQL nomeado, não inline).
- Implemente o repositório: `class XxxPostgresRepository implements IXxxRepository`.
  - `toDomain(row)` — converte linha do banco → entidade de domínio.
  - `toRow(entity)` — converte entidade → parâmetros SQL.
  - Valores monetários: `BigInt(row.amount_satoshi)` na entrada, `.toString()` na saída para o SQL.

### 4. Interface Adapters (`src/interface-adapters/http/<contexto>/`)

Para cada endpoint do ADR:
- Controller NestJS recebe o use case via injeção de dependência.
- DTO de entrada validado com `class-validator`.
- DTO de saída converte valores de domínio para representação HTTP.
- Error filter global já cuida do mapeamento `DomainError → HTTP status` (não precisa de try/catch individual).
- Registre o novo módulo em `src/interface-adapters/http/<contexto>/<contexto>.module.ts`.

## Passo 2 — Adicionar testes

Para cada cenário do Plano de Teste do ADR:
- **Testes de entidade** (`src/domain/<contexto>/<entidade>.entity.spec.ts`): regras de negócio, edge cases, erros tipados.
- **Testes de use case** (`src/application/<contexto>/<usecase>.usecase.spec.ts`): mock dos repositórios, cenários de sucesso e falha.
- **Testes de integração** (`src/infrastructure/database/repositories/<repositório>.spec.ts`): banco real, transação real.

## Passo 3 — Auto-verificação

- Rode `pnpm test` — testes da mudança devem estar verdes.
- Rode `pnpm lint` — sem erros de lint.
- Cheque a Regra de Dependência manualmente:
  ```bash
  grep -r "from '.*infrastructure\|from '.*interface-adapters" src/domain/ src/application/
  ```
  O resultado deve ser vazio. Se não for, corrija antes de reportar.

## Passo 4 — Reportar e PARAR (gate humano)

Responda em pt-BR, sem commitar:
- **ADR executado** e quais passos do plano foram implementados.
- **Arquivos criados/alterados** — um bullet por arquivo com o que faz.
- **Testes:** o que rodou e o resultado.
- **Regra de Dependência:** confirmação do grep (saída vazia = OK).
- **Desvios:** qualquer diferença entre o que o ADR planejou e o que foi implementado — nunca silencioso.
- **Próximo passo:** "Revise o diff. Após aprovar, rode `/adr-reviewer` (estágio 4) e então `/adr-pr`." NÃO commite.

---

## Limitações
- Se o ADR estiver ambíguo ou conflitar com o código real, **PARE** e devolva para `/adr-architect` — não preencha a lacuna com suposição.
- Se a implementação exigir migração de dados existentes (não só schema), sinalize — isso requer plano de rollout separado.
