# mybitcoin-api

API de uma plataforma de criptomoedas com as funcionalidades de um exchange real: autenticação, KYC, carteiras, ledger financeiro com dupla entrada, order book, matching engine e depósitos/saques Bitcoin on-chain.

**Stack:** NestJS 11 · TypeScript 5.7 · PostgreSQL (driver `pg`) · Jest 30 · OpenTelemetry · pnpm

---

## Setup

```bash
pnpm install
```

Crie um arquivo `.env` com as variáveis de ambiente necessárias (veja `.env.example`).

## Executar

```bash
pnpm start:dev        # watch mode
pnpm start            # produção
```

## Testes

```bash
pnpm test             # suite completa
pnpm test:watch       # watch mode
pnpm test:cov         # cobertura
```

## Migrations

```bash
pnpm migration:create   # criar arquivo de migration
pnpm migration:run      # aplicar pendentes
pnpm migration:dry-run  # simular sem aplicar
```

---

## Arquitetura

O projeto aplica **Clean Architecture + DDD** nos fluxos de domínio e uma abordagem simples (Controller → Service → DatabaseService) para CRUD administrativo.

```
src/
├── infrastructure/              ← infraestrutura compartilhada (DatabaseService, migrations, telemetry)
│   ├── database/
│   └── telemetry/
├── modules/                     ← módulos de negócio, cada um com suas próprias camadas CA
│   └── <contexto>/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/persistence/
│       ├── presentation/
│       └── <contexto>.module.ts
├── shared/                      ← artefatos de domínio compartilhados (DomainError, UnitOfWork)
└── app.module.ts
```

A documentação de arquitetura está em [`docs/architecture/`](docs/architecture/).

**Critério para decidir onde o código vai:**
> "Se uma falha pode causar perda financeira ou acesso não autorizado → Clean Architecture. Se é CRUD sem regra de negócio → abordagem simples dentro do módulo correspondente."

---

## Documentação

### Negócio (`docs/bussiness/`)

| Documento | Conteúdo |
|-----------|---------|
| [`01-visao-geral-sistema.md`](docs/bussiness/01-visao-geral-sistema.md) | Visão macro e bounded contexts |
| [`02-identidade-e-acesso.md`](docs/bussiness/02-identidade-e-acesso.md) | Regras de autenticação, KYC, MFA |
| [`03-modelo-de-dominio.md`](docs/bussiness/03-modelo-de-dominio.md) | Entidades, aggregates, value objects |
| [`04-carteiras-e-ledger-financeiro.md`](docs/bussiness/04-carteiras-e-ledger-financeiro.md) | Invariantes INV-001–014, dupla entrada |
| [`05-mercados-de-negociacao.md`](docs/bussiness/05-mercados-de-negociacao.md) | Pares de mercado, order book |
| [`06-order-book.md`](docs/bussiness/06-order-book.md) | Estrutura do order book |
| [`07-matching-engine.md`](docs/bussiness/07-matching-engine.md) | Algoritmo de matching |
| [`08-trades-maker-taker-taxas.md`](docs/bussiness/08-trades-maker-taker-taxas.md) | Maker/Taker/Charger, taxas |
| [`09-depositos-e-saques.md`](docs/bussiness/09-depositos-e-saques.md) | Fluxos on-chain |
| [`10-eventos-de-dominio-e-auditoria.md`](docs/bussiness/10-eventos-de-dominio-e-auditoria.md) | Domain events e auditoria |
| [`11-invariantes-globais.md`](docs/bussiness/11-invariantes-globais.md) | Invariantes globais |
| [`12-cenarios-bdd.md`](docs/bussiness/12-cenarios-bdd.md) | Cenários BDD (Gherkin) |

### Arquitetura (`docs/architecture/`)

| Documento | Conteúdo |
|-----------|---------|
| [`01-analise-projeto-anterior.md`](docs/architecture/01-analise-projeto-anterior.md) | Análise de sistemas similares de matching: aprendizados aplicados ao mybitcoin-api |
| [`02-clean-architecture-ddd-fundamentos.md`](docs/architecture/02-clean-architecture-ddd-fundamentos.md) | Princípios: Regra de Dependência, DDD, IUnitOfWork |
| [`03-estrutura-projeto.md`](docs/architecture/03-estrutura-projeto.md) | Estrutura de pastas e convenções de nomenclatura |
| [`04-quando-usar-clean-architecture.md`](docs/architecture/04-quando-usar-clean-architecture.md) | Critério CA vs abordagem simples |

### ADRs (`docs/adr/`)

| ADR | Decisão |
|-----|---------|
| [`0001-unit-of-work-pattern.md`](docs/adr/0001-unit-of-work-pattern.md) | Padrão UnitOfWork para atomicidade |

---

## Skills do Claude Code

Este projeto inclui skills para o Claude Code em `.claude/skills/`. Use com `/nome-da-skill` no Claude Code.

### Pipeline de ADR

Fluxo para criar e implementar decisões arquiteturais:

```
/adr-architect → /adr-validator → (aprovação humana) → /adr-executor → /adr-reviewer → /adr-pr
```

| Skill | Descrição |
|-------|-----------|
| `/adr-architect` | Faz perguntas e escreve o ADR |
| `/adr-validator` | Revisão adversarial do ADR antes de implementar |
| `/adr-executor` | Implementa o ADR na ordem correta de camadas |
| `/adr-reviewer` | Revisa o diff da implementação contra o ADR |
| `/adr-pr` | Abre PR com título e body padronizados |

### Guards — validadores de regras do sistema

Invoque após implementar código nos respectivos domínios:

| Skill | Domínio | O que detecta |
|-------|---------|--------------|
| `/ledger-guard` | Financeiro | Violações dos invariantes INV-001–014, desequilíbrio na dupla entrada, `number` em vez de `bigint`, falta de atomicidade |
| `/security-guard` | Identidade e acesso | Violações das regras CAD/LOG/OUT/REC/SES/VER/KYC/MFA, senha em plaintext, SQL com interpolação de input |
| `/arch-guard` | Arquitetura | Violações da Regra de Dependência, artefato na camada errada, nomenclatura incorreta, SQL inline em repositório CA |

Todos os guards leem a documentação antes de analisar o código e respondem **CONFORME/ÍNTEGRO** ou **VIOLAÇÃO** com evidência `arquivo:linha`.

### Testes

| Skill | Descrição |
|-------|-----------|
| `/test-writer` | Escreve testes unitários (entidades, use cases) e de integração (repositórios) seguindo os padrões do projeto |
| `/test-reviewer` | Revisa qualidade dos testes: BDD naming, caminhos negativos, `bigint` nas asserções, erros tipados, separação unit/integração. Responde **PASS** ou **ISSUES** |

### Qualidade de código

| Skill | Descrição |
|-------|-----------|
| `/code-reviewer` | Revisa complexidade ciclomática e cognitiva, comprimento de funções, SRP, naming, DRY, valores mágicos e comentários desnecessários. Tolerâncias diferentes por camada. Responde **PASS** ou **ISSUES** |

### Planejamento e modelagem DDD

Use **antes de escrever qualquer código**. Essas skills evitam o custo de refatorar arquivos na camada errada ou invariantes esquecidas.

| Skill | Descrição |
|-------|-----------|
| `/task-planner` | Dado uma funcionalidade, carrega a documentação relevante, classifica CA vs simples, lista os artefatos a criar em ordem de camada (domain → application → infrastructure → presentation), mapeia dependências e define quais guards executar ao final. Para para aprovação antes de implementar |
| `/domain-modeler` | Dado um conceito de negócio, faz as perguntas certas de DDD, determina se é Entidade, Value Object ou Aggregate, define invariantes com erros tipados, projeta a interface `I*Repository` e os Domain Events. Para para aprovação antes de implementar |

#### Padrões de teste

**Testes unitários** (`src/modules/<ctx>/domain/`, `src/modules/<ctx>/application/`): mocks de interfaces, sem banco.

**Testes de integração** (`src/modules/<ctx>/infrastructure/`): banco real, isolados com `BEGIN`/`ROLLBACK`.

```bash
pnpm test -- transaction.entity.spec.ts       # arquivo específico
pnpm test -- src/modules/financial/           # contexto específico
```

---

## Convenções críticas

**Valores monetários:** sempre `bigint` no TypeScript, `BIGINT` no PostgreSQL, sufixo `_satoshi` no campo.

**Erros de domínio:** subclasses de `DomainError` — nunca retornar `boolean` ou `null` para indicar falha.

**Atomicidade:** operações multi-tabela obrigatoriamente em `UnitOfWork.run()`.

**SQL:** em `src/modules/<ctx>/infrastructure/persistence/*.sql.ts` — nunca inline em repositórios.

**Repositórios:** retornam entidade de domínio ou `null` — nunca `undefined`, nunca `boolean`.
