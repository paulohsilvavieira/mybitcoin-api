# mybitcoin-api — Guia para Claude Code

## O que é este projeto

API de uma plataforma de criptomoedas real. Funcionalidades: autenticação/KYC, carteiras, ledger financeiro com dupla entrada, order book, matching engine, depósitos/saques Bitcoin on-chain.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | NestJS 11 |
| Linguagem | TypeScript 5.7 |
| Banco | PostgreSQL (driver `pg` — sem ORM) |
| Testes | Jest 30 |
| Observabilidade | OpenTelemetry |
| Package manager | pnpm |

---

## Arquitetura

Este projeto usa **Clean Architecture + DDD**. A documentação de referência está em `docs/architecture/`:

- `01-analise-projeto-anterior.md` — análise de sistemas similares de matching: o que funcionou e o que evoluir
- `02-clean-architecture-ddd-fundamentos.md` — princípios: Regra de Dependência, 4 camadas, DDD, UnitOfWork, erros tipados, bigint
- `03-estrutura-projeto.md` — estrutura concreta de pastas e convenções de nomenclatura
- `04-quando-usar-clean-architecture.md` — critério para CA vs abordagem simples

**NÃO use CA para tudo.** CRUD administrativo (cadastrar moedas, criar pares de mercado) vai em `src/admin/`. A regra: se falha no código pode causar perda financeira ou acesso não autorizado → CA. Caso contrário → `src/admin/`.

### Estrutura de pastas

```
src/
├── domain/              ← entidades, value objects, interfaces *Repository, erros tipados
├── application/         ← use cases (orquestram domínio, não têm lógica própria)
├── infrastructure/      ← implementações de repositórios, DatabaseService, migrations
│   └── database/
│       ├── repositories/   ← *Postgres.repository.ts
│       ├── queries/         ← SQL nomeado em constantes
│       ├── migrations/      ← arquivos .sql numerados
│       └── scripts/         ← migration runner, create-migration
├── interface-adapters/  ← controllers, DTOs, módulos NestJS
│   └── http/
└── admin/               ← CRUD simples (Controller → Service → DatabaseService)
```

### Regra de Dependência

Dependências só apontam para dentro:

```
interface-adapters → application → domain
infrastructure    → domain
```

`src/domain/` nunca importa nenhuma outra camada. Verifique com:

```bash
grep -r "from '.*application\|from '.*infrastructure\|from '.*interface-adapters" src/domain/
```

---

## Convenções críticas

### Valores monetários — sempre `bigint`

Toda unidade monetária é representada em **satoshi** como `bigint` no TypeScript e `BIGINT` no PostgreSQL. Nunca `number`, nunca `float`, nunca `BigNumber`.

```typescript
// Correto
const amount: bigint = 100_000n
// Errado
const amount: number = 100000
const amount = new BigNumber(100000)
```

Campos SQL devem ter sufixo `_satoshi`: `amount_satoshi BIGINT NOT NULL`.

### Erros de domínio — sempre tipados

Nunca retornar `boolean` ou `null` para indicar falha de regra de negócio. Sempre lançar subclasse de `DomainError`.

```typescript
// Correto
throw new InsufficientBalanceError(accountId, required, available)
// Errado
return false
return { success: false, error: 'Saldo insuficiente' }
```

### Atomicidade — UnitOfWork

Operações que escrevem em mais de uma tabela DEVEM usar `UnitOfWork`. Nunca queries manuais em transações sequenciais sem garantia de rollback.

```typescript
await this.uow.run(async ({ transactionRepository, ledgerRepository }) => {
  await transactionRepository.save(tx)
  await ledgerRepository.save(debit)
  await ledgerRepository.save(credit)
})
```

### SQL — nunca inline nos repositórios CA

SQL fica em `src/infrastructure/database/queries/*.queries.ts` como constantes nomeadas. Repositórios importam e usam essas constantes.

**Exceção:** `src/admin/` pode ter SQL inline no próprio service.

### Repositórios

- **Abstract class** em `src/domain/<contexto>/<nome>.repository.ts` — sem prefixo: `TransactionRepository` (não `ITransactionRepository`)
- **Implementação** em `src/infrastructure/database/repositories/<nome>.postgres.repository.ts` — usa `extends`: `class TransactionPostgresRepository extends TransactionRepository`
- No módulo NestJS: `{ provide: TransactionRepository, useClass: TransactionPostgresRepository }`
- Métodos `find*` retornam entidade de domínio ou `null` — nunca `undefined`, nunca `boolean`
- Métodos `save`/`delete` retornam `void` — nunca `boolean`

---

## Documentação de negócio

Em `docs/bussiness/` — estes são os documentos que as skills leem como "lei":

| Arquivo | Conteúdo |
|---------|---------|
| `01-visao-geral-sistema.md` | Visão macro, bounded contexts |
| `02-identidade-e-acesso.md` | Regras CAD/LOG/OUT/REC/SES/VER/KYC/MFA |
| `03-modelo-de-dominio.md` | Entidades, aggregates, value objects |
| `04-carteiras-e-ledger-financeiro.md` | INV-001 a INV-014, dupla entrada, ledger |
| `05-mercados-de-negociacao.md` | Pares, order book |
| `06-order-book.md` | Estrutura do order book |
| `07-matching-engine.md` | Algoritmo de matching |
| `08-trades-maker-taker-taxas.md` | Maker/Taker/Charger, cálculo de taxas |
| `09-depositos-e-saques.md` | Fluxos on-chain |
| `10-eventos-de-dominio-e-auditoria.md` | Domain events, auditoria |
| `11-invariantes-globais.md` | Invariantes globais do sistema |
| `12-cenarios-bdd.md` | Cenários BDD (Gherkin) |

## ADRs

Em `docs/adr/` — decisões arquiteturais já tomadas:

| ADR | Decisão |
|-----|---------|
| `0001-atomic-transactions.md` | Padrão UnitOfWork para atomicidade |
| `0002-schema-identidade-kyc.md` | Schema de accounts, kyc_profiles, kyc_documents |
| `0003-schema-financeiro-ledger-bitcoin.md` | Schema de transactions, ledger_entries, bitcoin_transactions |

---

## Skills disponíveis

Skills ficam em `.claude/skills/`. Invoque com `/nome-da-skill`.

### Pipeline de ADR

Use este fluxo sempre que uma decisão arquitetural for necessária (novo schema, novo bounded context, mudança de padrão).

| Skill | Comando | Quando usar |
|-------|---------|------------|
| `adr-architect` | `/adr-architect` | Iniciar a criação de um ADR — faz perguntas, monta o documento |
| `adr-validator` | `/adr-validator` | Revisar adversarialmente um ADR antes de implementar |
| `adr-executor` | `/adr-executor` | Implementar um ADR aceito na ordem correta (domain→application→infrastructure→adapters) |
| `adr-reviewer` | `/adr-reviewer` | Revisar o diff de implementação contra o ADR |
| `adr-pr` | `/adr-pr` | Abrir PR com título e body padronizados |

**Ordem do fluxo:** `architect` → `validator` → (humano aprova) → `executor` → `reviewer` → `pr`

### Guards — validadores de regras

Invoque após implementar código que toque os respectivos domínios.

| Skill | Comando | O que valida |
|-------|---------|-------------|
| `ledger-guard` | `/ledger-guard` | Invariantes INV-001 a INV-014, dupla entrada, bigint, UnitOfWork |
| `security-guard` | `/security-guard` | Regras CAD/LOG/OUT/REC/SES/VER/KYC/MFA, bcrypt, SQL parametrizado |
| `arch-guard` | `/arch-guard` | Regra de Dependência, placement de artefatos, DDD, nomenclatura |

Todos os guards: leem a documentação primeiro, depois analisam código, retornam CONFORME/ÍNTEGRO ou VIOLAÇÃO com evidência `arquivo:linha`.

### Qualidade de código

| Skill | Comando | O que faz |
|-------|---------|----------|
| `code-reviewer` | `/code-reviewer` | Avalia complexidade ciclomática/cognitiva, SRP, naming, DRY, valores mágicos — retorna PASS ou ISSUES |

### Testes

| Skill | Comando | O que faz |
|-------|---------|----------|
| `test-writer` | `/test-writer` | Escreve testes (unit para entidades/use cases, integração para repositórios) |
| `test-reviewer` | `/test-reviewer` | Revisa qualidade dos testes, retorna PASS ou ISSUES |

### Planejamento e modelagem (use ANTES de codar)

| Skill | Comando | O que faz |
|-------|---------|----------|
| `task-planner` | `/task-planner` | Carrega docs relevantes, classifica CA vs simples, lista artefatos em ordem, define guards a executar — PARA para aprovação antes de implementar |
| `domain-modeler` | `/domain-modeler` | Modela entidade/VO/aggregate/event em DDD: determina tipo, define invariantes, projeta interface de repositório e domain events — PARA para aprovação antes de implementar |

---

## Comandos principais

```bash
pnpm install                  # instalar dependências
pnpm start:dev                # servidor em modo watch
pnpm test                     # testes
pnpm test:cov                 # cobertura
pnpm migration:create         # criar arquivo de migration
pnpm migration:run            # aplicar migrations pendentes
pnpm migration:dry-run        # simular migrations sem aplicar
pnpm lint                     # linting
```

---

## Invariantes financeiros (resumo)

Nunca implemente código que toque ledger sem ler `docs/bussiness/04-carteiras-e-ledger-financeiro.md`. As regras críticas:

- **INV-001/002/003** — Saldos nunca negativos
- **INV-005** — Toda movimentação de saldo cria `ledger_entry`
- **INV-006** — Nenhum `ledger_entry` sem `transaction_id`
- **INV-007** — `Σ débitos = Σ créditos` por transação (dupla entrada)
- **INV-014** — `ledger_entries` são imutáveis — nunca UPDATE/DELETE

---

## O que NÃO fazer

- **Não use ORM** — só driver `pg` com SQL explícito
- **Não use `number` para valores financeiros** — apenas `bigint`
- **Não retorne `boolean` de repositório** — lance `DomainError` tipado
- **Não coloque SQL inline em repositórios de CA** — use `*.queries.ts`
- **Não importe infraestrutura em `src/domain/`** — violação da Regra de Dependência
- **Não processe operação financeira sem verificar KYC** — veja `docs/bussiness/02-identidade-e-acesso.md`
- **Não faça múltiplos writes sem `UnitOfWork`** — risco de estado parcial
