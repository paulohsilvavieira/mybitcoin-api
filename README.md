# mybitcoin-api

API de uma plataforma de criptomoedas com as funcionalidades de um exchange real: autenticação, KYC, carteiras, ledger financeiro com dupla entrada, order book, matching engine e depósitos/saques Bitcoin on-chain.

**Stack:** NestJS 11 · TypeScript 5.7 · PostgreSQL (driver `pg`, sem ORM) · Jest 30 · OpenTelemetry · pnpm

Este README é o ponto de entrada para qualquer desenvolvedor no projeto — de quem está fazendo o primeiro PR até quem está desenhando a arquitetura. Leia-o antes de tocar em código.

---

## Como rodar

### Pré-requisitos

- Node.js e [pnpm](https://pnpm.io/)
- PostgreSQL (local ou via Docker)

### Setup

```bash
pnpm install
cp .env.example .env   # ajuste as variáveis conforme seu ambiente
```

Subir Postgres (e réplica de leitura) via Docker, se preferir não instalar localmente:

```bash
docker compose up -d
```

Aplicar as migrations:

```bash
pnpm migration:run
```

### Executar

```bash
pnpm start:dev        # modo watch, para desenvolvimento
pnpm start            # modo normal
pnpm start:prod        # a partir do build (dist/)
```

### Testes

```bash
pnpm test             # suite completa
pnpm test:watch       # watch mode
pnpm test:cov         # com cobertura
pnpm test:e2e         # testes end-to-end

pnpm test -- transaction.entity.spec.ts   # um arquivo específico
pnpm test -- src/modules/financial/       # um módulo específico
```

### Lint e build

```bash
pnpm lint             # eslint com --fix
pnpm build            # compila para dist/
```

### Migrations

```bash
pnpm migration:create   # cria um novo arquivo de migration
pnpm migration:run       # aplica migrations pendentes
pnpm migration:dry-run   # simula a aplicação sem escrever no banco
```

---

## Antes de codar: o que ler

A ordem abaixo é a ordem recomendada de leitura conforme o tipo de tarefa. Não pule a documentação de negócio ao tocar em fluxos financeiros — as regras ali descritas são a fonte da verdade, não o código existente.

### 1. Arquitetura do projeto (`docs/architecture/`)

Leitura obrigatória antes de criar ou mover qualquer arquivo em `src/`.

| Documento | Conteúdo |
|-----------|---------|
| [`01-analise-projeto-anterior.md`](docs/architecture/01-analise-projeto-anterior.md) | Análise de sistemas similares de matching: o que funcionou e o que evoluir |
| [`02-clean-architecture-ddd-fundamentos.md`](docs/architecture/02-clean-architecture-ddd-fundamentos.md) | Princípios: Regra de Dependência, as 4 camadas, DDD, UnitOfWork, erros tipados, `bigint` |
| [`03-estrutura-projeto.md`](docs/architecture/03-estrutura-projeto.md) | Estrutura concreta de pastas e convenções de nomenclatura |
| [`04-quando-usar-clean-architecture.md`](docs/architecture/04-quando-usar-clean-architecture.md) | Critério para decidir entre Clean Architecture e uma abordagem simples |

### 2. Regras de negócio (`docs/bussiness/`)

Leitura obrigatória antes de implementar qualquer regra de negócio. Estes documentos são tratados como "lei" pelo projeto — em caso de dúvida entre o que o código faz e o que a documentação diz, a documentação prevalece.

| Documento | Conteúdo |
|-----------|---------|
| [`01-visao-geral-sistema.md`](docs/bussiness/01-visao-geral-sistema.md) | Visão macro do sistema e bounded contexts |
| [`02-identidade-e-acesso.md`](docs/bussiness/02-identidade-e-acesso.md) | Regras de cadastro, login, logout, recuperação de senha, sessão, verificação, KYC, MFA |
| [`03-modelo-de-dominio.md`](docs/bussiness/03-modelo-de-dominio.md) | Entidades, aggregates, value objects |
| [`04-carteiras-e-ledger-financeiro.md`](docs/bussiness/04-carteiras-e-ledger-financeiro.md) | Invariantes INV-001 a INV-014, dupla entrada, ledger |
| [`05-mercados-de-negociacao.md`](docs/bussiness/05-mercados-de-negociacao.md) | Pares de mercado, order book |
| [`06-order-book.md`](docs/bussiness/06-order-book.md) | Estrutura do order book |
| [`07-matching-engine.md`](docs/bussiness/07-matching-engine.md) | Algoritmo de matching |
| [`08-trades-maker-taker-taxas.md`](docs/bussiness/08-trades-maker-taker-taxas.md) | Maker/Taker/Charger, cálculo de taxas |
| [`09-depositos-e-saques.md`](docs/bussiness/09-depositos-e-saques.md) | Fluxos on-chain de depósito e saque |
| [`10-eventos-de-dominio-e-auditoria.md`](docs/bussiness/10-eventos-de-dominio-e-auditoria.md) | Domain events e auditoria |
| [`11-invariantes-globais.md`](docs/bussiness/11-invariantes-globais.md) | Invariantes globais do sistema |
| [`12-cenarios-bdd.md`](docs/bussiness/12-cenarios-bdd.md) | Cenários BDD (Gherkin) usados como referência de comportamento |

### 3. Registro de decisões arquiteturais (`docs/adr/`)

Decisões estruturais já tomadas e seus motivos ficam registradas ali como ADRs (Architecture Decision Records). Consulte antes de propor uma mudança que possa conflitar com uma decisão existente (ex.: padrão de atomicidade, escolha de tecnologia).

---

## Arquitetura em resumo

O projeto aplica **Clean Architecture + DDD** nos fluxos de domínio, e uma abordagem simples (Controller → Service → DatabaseService) para CRUD administrativo sem regra de negócio relevante.

```
src/
├── infrastructure/              ← infraestrutura compartilhada (DatabaseService, migrations, telemetry)
│   ├── database/
│   └── telemetry/
├── modules/                     ← módulos de negócio, cada um com suas próprias camadas
│   └── <contexto>/
│       ├── domain/              ← entidades, value objects, interfaces *Repository, erros
│       ├── application/         ← use cases
│       ├── infrastructure/persistence/  ← implementações de repositório e SQL
│       ├── presentation/        ← controllers, DTOs, módulo NestJS
│       └── <contexto>.module.ts
├── shared/                      ← artefatos de domínio compartilhados (DomainError, UnitOfWork)
└── app.module.ts
```

**Regra de Dependência:** dentro de cada módulo, as dependências só apontam para dentro — `presentation → application → domain` e `infrastructure → domain`. `domain/` nunca importa de `application/`, `infrastructure/` ou `presentation/`.

```bash
# verificar violações da Regra de Dependência
grep -r "from '.*application\|from '.*infrastructure\|from '.*presentation" src/modules/*/domain/
```

**Critério para decidir onde o código vai:**
> Se uma falha pode causar perda financeira ou acesso não autorizado → Clean Architecture. Se é CRUD sem regra de negócio → abordagem simples dentro do módulo correspondente.

Detalhes completos em [`docs/architecture/03-estrutura-projeto.md`](docs/architecture/03-estrutura-projeto.md).

---

## Convenções críticas

Estas convenções não são sugestões — código que as viola é considerado incorreto neste projeto.

**Valores monetários — sempre `bigint`.** Toda unidade monetária é representada em satoshi como `bigint` no TypeScript e `BIGINT` no PostgreSQL. Nunca `number`, nunca `float`, nunca `BigNumber`. Campos SQL levam o sufixo `_satoshi` (ex.: `amount_satoshi BIGINT NOT NULL`).

**Erros de domínio — sempre tipados.** Nunca retornar `boolean` ou `null` para indicar falha de regra de negócio. Sempre lançar uma subclasse de `DomainError` (ex.: `throw new InsufficientBalanceError(...)`).

**Atomicidade — sempre `UnitOfWork`.** Operações que escrevem em mais de uma tabela devem usar `UnitOfWork.run()`. Nunca queries manuais em sequência sem garantia de rollback.

**SQL — nunca inline em repositórios.** SQL fica em `src/modules/<contexto>/infrastructure/persistence/*.sql.ts` como constantes nomeadas, importadas pelos repositórios.

**Repositórios:**
- Interface abstrata em `domain/<nome>.repository.ts`, sem prefixo `I` (`TransactionRepository`, não `ITransactionRepository`)
- Implementação em `infrastructure/persistence/pg-<nome>.repository.ts`, usando `extends`
- Métodos `find*` retornam entidade de domínio ou `null` — nunca `undefined`, nunca `boolean`
- Métodos `save`/`delete` retornam `void` — nunca `boolean`

**Invariantes financeiras (resumo — detalhe completo em [`docs/bussiness/04-carteiras-e-ledger-financeiro.md`](docs/bussiness/04-carteiras-e-ledger-financeiro.md)):**
- Saldos nunca ficam negativos (INV-001/002/003)
- Toda movimentação de saldo cria um `ledger_entry` (INV-005)
- Nenhum `ledger_entry` sem `transaction_id` (INV-006)
- `Σ débitos = Σ créditos` por transação — dupla entrada (INV-007)
- `ledger_entries` são imutáveis — nunca `UPDATE`/`DELETE` (INV-014)

### O que não fazer

- Não usar ORM — apenas o driver `pg` com SQL explícito
- Não usar `number` para valores financeiros — apenas `bigint`
- Não retornar `boolean` de repositório — lançar `DomainError` tipado
- Não colocar SQL inline em repositórios de Clean Architecture
- Não importar infraestrutura em `src/modules/*/domain/` — viola a Regra de Dependência
- Não processar operação financeira sem verificar KYC (veja [`docs/bussiness/02-identidade-e-acesso.md`](docs/bussiness/02-identidade-e-acesso.md))
- Não fazer múltiplos writes sem `UnitOfWork` — risco de estado parcial

---

## Skills do Claude Code

Este projeto inclui skills para o Claude Code em `.claude/skills/`, invocadas com `/nome-da-skill`. Elas automatizam o fluxo de planejamento, implementação e revisão descrito acima — mas não substituem a leitura da documentação de negócio e arquitetura.

### Planejamento e modelagem (use antes de codar)

| Skill | O que faz |
|-------|-----------|
| `/task-planner` | Carrega a documentação relevante, classifica CA vs abordagem simples, lista os artefatos a criar em ordem de camada e define quais guards executar. Para para aprovação humana antes de implementar |
| `/domain-modeler` | Modela um novo conceito de domínio (entidade, VO, aggregate, event): determina o tipo, define invariantes, projeta a interface do repositório e os domain events. Para para aprovação humana antes de implementar |

### Ciclo de decisão arquitetural (quando a mudança exige um ADR)

```
/adr-architect → /adr-validator → (aprovação humana) → /adr-executor → /adr-reviewer → /adr-pr
```

| Skill | O que faz |
|-------|-----------|
| `/adr-architect` | Faz perguntas e redige o ADR |
| `/adr-validator` | Revisão adversarial do ADR antes de implementar |
| `/adr-executor` | Implementa o ADR aprovado na ordem correta (domain → application → infrastructure → presentation) |
| `/adr-reviewer` | Revisa o diff da implementação contra o ADR |
| `/adr-pr` | Abre o PR com título e corpo padronizados |

### Guards — validadores de regras do sistema

Invoque após implementar código que toque os respectivos domínios.

| Skill | Domínio | O que detecta |
|-------|---------|--------------|
| `/ledger-guard` | Financeiro | Violações dos invariantes INV-001 a INV-014, desequilíbrio na dupla entrada, `number` em vez de `bigint`, falta de atomicidade |
| `/security-guard` | Identidade e acesso | Violações das regras de cadastro/login/sessão/KYC/MFA, senha em plaintext, SQL com interpolação de input |
| `/arch-guard` | Arquitetura | Violações da Regra de Dependência, artefato na camada errada, nomenclatura incorreta, SQL inline em repositório CA |

Todos os guards leem a documentação antes de analisar o código e respondem **CONFORME/ÍNTEGRO** ou **VIOLAÇÃO** com evidência `arquivo:linha`. Nenhum guard altera código.

### Testes

| Skill | O que faz |
|-------|-----------|
| `/test-writer` | Escreve testes unitários (entidades, use cases) e de integração (repositórios) seguindo os padrões do projeto |
| `/test-reviewer` | Revisa qualidade dos testes: nomenclatura BDD, caminhos negativos, `bigint` nas asserções, erros tipados, separação unit/integração. Responde **PASS** ou **ISSUES** |

Padrão de testes: **unitários** (`domain/`, `application/`) usam mocks de interfaces, sem banco; **integração** (`infrastructure/`) usam banco real, isolados com `BEGIN`/`ROLLBACK`.

### Qualidade de código

| Skill | O que faz |
|-------|-----------|
| `/code-reviewer` | Revisa complexidade ciclomática e cognitiva, comprimento de funções, SRP, naming, DRY, valores mágicos e comentários desnecessários. Responde **PASS** ou **ISSUES** |

### Pipeline completa (API + Frontend)

`/dev-pipeline` orquestra todas as skills acima em sequência — recepção, ADR, planner, implementação, testes, guards e, opcionalmente, a implementação correspondente no frontend (`mybitcoin-front`) — com gate de aprovação humana em cada etapa. Configuração em `.pipeline-config.json`.
