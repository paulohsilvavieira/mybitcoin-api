# ADR 0003 — Separação de Conexões Write/Read (Réplica de Leitura PostgreSQL)

**Status:** Implementado
**PR:** https://github.com/paulohsilvavieira/mybitcoin-api/pull/3 (mergeado)
**Data:** 2026-07-27
**Autores:** Time de Backend
**Contexto relacionado:** ADR 0001 (UnitOfWork), `docs/architecture/03-estrutura-projeto.md`
**Gerado por:** skill `/adr-architect`

---

## Contexto

Hoje `DatabaseModule` fornece um único `Pool` (`POOL_TOKEN`) e um único `DatabaseService`, injetado tanto pelo `UnitOfWork` (escritas transacionais) quanto por repositórios que fazem apenas leitura (ex.: `PgUserRepository` via `QueryExecutor`, `TransactionRepository`/`LedgerEntryRepository` fora de UoW). Todo tráfego — leitura e escrita — passa pela mesma instância de PostgreSQL.

Conforme o volume de leituras cresce (consultas de saldo, extrato, order book, histórico de trades), essa conexão única compete pelos mesmos recursos das escritas críticas do ledger, criando risco de contenção. A necessidade é introduzir uma réplica de leitura (read replica) via streaming replication nativa do PostgreSQL, com o código de aplicação capaz de rotear queries de leitura para a réplica e manter todas as escritas (e leituras dentro de transações) no primary.

Esta é uma decisão de infraestrutura compartilhada (`src/infrastructure/database/`) — não pertence a nenhum bounded context de negócio, mas afeta todos os módulos que acessam o banco.

---

## Forças em Jogo

- Não pode quebrar a garantia de atomicidade do `UnitOfWork` (ADR 0001) — leituras dentro de uma transação precisam ver o estado da própria transação, não podem ir para a réplica (lag de replicação).
- Não pode ser possível, nem por engano, uma escrita ir parar na réplica. Repositórios que hoje escrevem fora do `UnitOfWork` (ex.: `TransactionRepository`/`LedgerEntryRepository` usados por `ConfirmDepositUseCase`) não podem ter seu token de DI trocado para a réplica — a separação read/write precisa ser estrutural (tipos diferentes), não apenas uma troca de token por cima da mesma interface.
- Mudança deve ser aditiva sobre a infraestrutura existente — `DatabaseService` e `UnitOfWork` não podem ter sua assinatura quebrada para os consumidores atuais (`FinancialModule`, `ConfirmDepositWithUowUseCase`).
- Ambiente local (docker-compose) deve simular fielmente a topologia de produção (streaming replication real), não apenas dois pools apontando para o mesmo Postgres — para validar lag de replicação, failover de conexão, etc.
- Se a réplica cair, o comportamento deve ser simples e visível (fail-fast), sem lógica de fallback escondida que mascare degradação de infra.

---

## Decisão

### 1. Dois pools de conexão, dois tokens

`DatabaseModule` passa a fornecer dois `Pool` do `pg`, um por variável de ambiente de host distinta:

- `WRITE_POOL_TOKEN` → conecta em `DB_WRITE_HOST` (primary). Mantém as variáveis `DB_HOST`/`DB_PORT` existentes como fallback para não quebrar ambientes já configurados (`DB_WRITE_HOST` tem precedência se definida).
- `READ_POOL_TOKEN` → conecta em `DB_READ_HOST`/`DB_READ_PORT` (réplica).

`POOL_TOKEN` é removido e todos os usos migrados para `WRITE_POOL_TOKEN` (não há consumidor externo ao `DatabaseModule` hoje, então não é breaking change de fato).

Expressão de fallback exata em `database.provider.ts` (resolve o gap de ambiguidade apontado na validação — `config.getOrThrow` não suporta fallback nativamente):

```typescript
// src/infrastructure/database/database.provider.ts
export const DatabaseWriteConnectionProvider: FactoryProvider = {
  provide: WRITE_POOL_TOKEN,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({
      host: config.get<string>('DB_WRITE_HOST') ?? config.getOrThrow('DB_HOST'),
      port: config.get<number>('DB_WRITE_PORT') ?? config.getOrThrow<number>('DB_PORT'),
      database: config.getOrThrow('DB_NAME'),
      user: config.getOrThrow('DB_USER'),
      password: config.getOrThrow('DB_PASSWORD'),
      max: config.get('DB_POOL_SIZE', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    }),
};

export const DatabaseReadConnectionProvider: FactoryProvider = {
  provide: READ_POOL_TOKEN,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({
      host: config.getOrThrow('DB_READ_HOST'),
      port: config.getOrThrow<number>('DB_READ_PORT'),
      database: config.getOrThrow('DB_NAME'),
      user: config.getOrThrow('DB_USER'),
      password: config.getOrThrow('DB_PASSWORD'),
      max: config.get('DB_POOL_SIZE', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    }),
};
```

`DB_READ_HOST`/`DB_READ_PORT` não têm fallback — a réplica é uma peça nova de infra, não existe variável legada para herdar. Se não configuradas, a aplicação falha na subida (fail-fast já na inicialização, não silenciosamente no primeiro request).

### 2. `QueryExecutor` ganha uma variante de leitura

```typescript
// src/infrastructure/database/query-executor.ts
export abstract class QueryExecutor {
  abstract query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

// src/infrastructure/database/read-query-executor.ts
export abstract class ReadQueryExecutor extends QueryExecutor {}
```

`ReadQueryExecutor` é um subtipo nominal do `QueryExecutor` existente — mesma interface, token de DI diferente. Isso permite que qualquer repositório (que já recebe `QueryExecutor` no construtor, sem mudança nenhuma na classe do repositório) seja instanciado com a implementação de leitura ou de escrita, dependendo de qual token o `useFactory` do módulo injeta.

### 3. Duas implementações de serviço

- `DatabaseService` (existente, sem mudança de comportamento) — injeta `WRITE_POOL_TOKEN`, mantém `query()` e `runInTransaction()`. Continua sendo o que o `UnitOfWork` usa.
- `ReadDatabaseService` (novo) — injeta `READ_POOL_TOKEN`, implementa apenas `QueryExecutor.query()`. **Não expõe `runInTransaction()`** — réplica é read-only, transação nela não faz sentido (e o Postgres em modo standby rejeitaria `BEGIN ... COMMIT` com escrita de qualquer forma).

```typescript
// src/infrastructure/database/read-database.service.ts
@Injectable()
export class ReadDatabaseService implements ReadQueryExecutor {
  constructor(@Inject(READ_POOL_TOKEN) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }
}
```

### 4. Regra de roteamento — CQRS: repositório de escrita e repositório de leitura são tipos diferentes

> **Revisão (2026-07-27, após `/adr-validator` estágio 2):** a primeira versão desta seção propunha trocar o `QueryExecutor` injetado no `useFactory` do `TransactionRepository`/`LedgerEntryRepository` existentes para apontar à réplica em usos "fora de UoW". O validador encontrou um gap CRÍTICO: esses mesmos tokens são usados por `ConfirmDepositUseCase` (`confirm-deposit.usecase.ts:18-33`) para **escrever** fora do `UnitOfWork` — trocar o token faria essa escrita ir contra a réplica (Postgres rejeitaria com `cannot execute INSERT/UPDATE in a read-only transaction`). A correção, confirmada com o usuário, é não reaproveitar o mesmo tipo de repositório para leitura e escrita: cada módulo passa a ter **duas interfaces de repositório distintas** — uma de escrita (já existente) e uma nova, só de leitura — seguindo o conceito de CQRS (Command Query Responsibility Segregation) aplicado à camada de persistência, sem introduzir barramento de comandos/queries nem event sourcing.

- **Repositório de escrita** (`XRepository`, já existente — `TransactionRepository`, `LedgerEntryRepository`, `UserRepository`) — mantém `save`/`delete` e os métodos de leitura que hoje já expõe (ex.: `findById`), sem nenhuma mudança de assinatura. Continua **sempre** ligado ao `WRITE_POOL_TOKEN`, seja injetado direto (ex.: `ConfirmDepositUseCase`, que lê e escreve fora de UoW) seja construído manualmente dentro do `UnitOfWork` (ADR 0001). **Nunca recebe `ReadQueryExecutor`.**
- **Repositório de leitura** (`XReadRepository`, novo — abstract class em `domain/`, expõe só métodos de consulta, nunca `save`/`delete`/`update`) — implementado por `PgXReadRepository` em `infrastructure/persistence/`, recebendo `ReadQueryExecutor` no construtor. Usado por casos de uso que só precisam ler e toleram lag de replicação (ex.: futura consulta de extrato, listagem de histórico de transações).
- **Dentro de `UnitOfWork.run()`** → sempre o repositório de escrita, via `WRITE_POOL_TOKEN` (`DatabaseService.runInTransaction`), sem exceção — inclusive para leituras feitas dentro da transação. Nenhuma mudança no `PostgresUnitOfWork` existente.

Como o repositório de leitura é um **tipo novo**, sem método de escrita, é estruturalmente impossível (o TypeScript não compila) chamar `.save()`/`.delete()` numa instância de `XReadRepository` — o gap CRÍTICO da validação deixa de ser possível por construção, não por convenção.

Exemplo — novo par de interfaces no módulo `financial` (`domain/`):

```typescript
// src/modules/financial/domain/transaction.repository.ts (existente, sem mudança)
export abstract class TransactionRepository {
  abstract findById(id: string): Promise<Transaction | null>;
  abstract save(transaction: Transaction): Promise<void>;
}

// src/modules/financial/domain/transaction-read.repository.ts (novo)
export abstract class TransactionReadRepository {
  abstract findById(id: string): Promise<Transaction | null>;
  // métodos de consulta futuros (ex.: findByAccountId, listar histórico) entram só aqui
}
```

Implementação (`infrastructure/persistence/`):

```typescript
// src/modules/financial/infrastructure/persistence/pg-transaction-read.repository.ts
export class PgTransactionReadRepository extends TransactionReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findById(id: string): Promise<Transaction | null> {
    // mesma query de leitura de PgTransactionRepository.findById, executada via this.db (réplica)
  }
}
```

Wiring no módulo (`financial.module.ts`) — `TransactionRepository` (write) continua exatamente como está hoje; só é adicionado um provider novo para o tipo de leitura:

```typescript
{
  provide: TransactionRepository, // inalterado — sempre write
  useFactory: (db: DatabaseService) => new PgTransactionRepository(db),
  inject: [DatabaseService],
},
{
  provide: TransactionReadRepository, // novo — sempre read
  useFactory: (readDb: ReadQueryExecutor) => new PgTransactionReadRepository(readDb),
  inject: [ReadQueryExecutor],
},
```

`ConfirmDepositUseCase` e `ConfirmDepositWithUowUseCase` continuam injetando `TransactionRepository`/`LedgerEntryRepository` (write) exatamente como hoje — zero mudança de comportamento para eles. Um futuro caso de uso somente-leitura injeta `TransactionReadRepository` em vez disso.

### 5. Fail-fast na indisponibilidade da réplica

Nenhum fallback automático para o primary. Se `ReadDatabaseService.query()` falhar (réplica fora do ar), o erro sobe normalmente para quem chamou. Não há retry nem circuit breaker nesta decisão — mantém o comportamento simples e visível. Resiliência adicional (fallback, retry) fica fora de escopo deste ADR e deve ser tratada em um ADR futuro se necessário.

### 6. Migrations sempre no primary

`pnpm migration:run` e `pnpm migration:create` continuam usando exclusivamente as variáveis de conexão de escrita (`DB_WRITE_HOST`/`DB_HOST`). Réplicas de streaming replication não aceitam DDL — não há decisão a tomar aqui além de garantir que nenhum script de migration aponte para `DB_READ_HOST`.

### 7. docker-compose local com streaming replication real

Dois serviços Postgres com replicação física via `pg_basebackup` + `standby.signal`, para simular fielmente a topologia de produção (não apenas dois pools contra o mesmo container).

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: pnpm start:dev
    ports:
      - "${PORT:-3000}:3000"
    environment:
      NODE_ENV: development
      PORT: 3000
      DB_WRITE_HOST: postgres-primary
      DB_WRITE_PORT: 5432
      DB_READ_HOST: postgres-replica
      DB_READ_PORT: 5432
      DB_NAME: ${DB_NAME:-mybitcoin}
      DB_USER: ${DB_USER:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      DB_POOL_SIZE: ${DB_POOL_SIZE:-10}
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      postgres-replica:
        condition: service_healthy
    restart: unless-stopped

  postgres-primary:
    image: postgres:17-alpine
    command: >
      postgres
      -c wal_level=replica
      -c max_wal_senders=10
      -c max_replication_slots=10
      -c hot_standby=on
    environment:
      POSTGRES_DB: ${DB_NAME:-mybitcoin}
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      REPLICATION_USER: ${DB_REPLICATION_USER:-replicator}
      REPLICATION_PASSWORD: ${DB_REPLICATION_PASSWORD:-replicator_password}
    volumes:
      - postgres_primary_data:/var/lib/postgresql/data
      - ./docker/postgres-primary/init-replication.sh:/docker-entrypoint-initdb.d/init-replication.sh:ro
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres} -d ${DB_NAME:-mybitcoin}"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  postgres-replica:
    image: postgres:17-alpine
    environment:
      PGUSER: ${DB_REPLICATION_USER:-replicator}
      PGPASSWORD: ${DB_REPLICATION_PASSWORD:-replicator_password}
      POSTGRES_PRIMARY_HOST: postgres-primary
    volumes:
      - postgres_replica_data:/var/lib/postgresql/data
      - ./docker/postgres-replica/entrypoint-replica.sh:/entrypoint-replica.sh:ro
    entrypoint: ["/entrypoint-replica.sh"]
    depends_on:
      postgres-primary:
        condition: service_healthy
    ports:
      - "${POSTGRES_REPLICA_PORT:-5433}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres} -d ${DB_NAME:-mybitcoin}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

volumes:
  postgres_primary_data:
  postgres_replica_data:
```

`docker/postgres-primary/init-replication.sh` (roda uma vez, na primeira inicialização do primary, via `docker-entrypoint-initdb.d`):

```bash
#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
EOSQL

echo "host replication ${REPLICATION_USER} all md5" >> "$PGDATA/pg_hba.conf"
```

`docker/postgres-replica/entrypoint-replica.sh` (roda `pg_basebackup` contra o primary na primeira subida, depois inicia em modo standby):

```bash
#!/bin/bash
set -e

if [ -z "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
  until pg_basebackup -h "$POSTGRES_PRIMARY_HOST" -D "$PGDATA" -U "$PGUSER" -Fp -Xs -P -R; do
    echo "Waiting for the primary to become available for pg_basebackup..."
    sleep 1
  done
  chmod 0700 "$PGDATA"
fi

exec docker-entrypoint.sh postgres
```

A flag `-R` do `pg_basebackup` gera automaticamente `standby.signal` e `postgresql.auto.conf` com `primary_conninfo`, colocando a réplica em modo standby/hot_standby assim que sobe.

### Rationale

**Por que repositórios de leitura e escrita separados (CQRS) e não só trocar o `QueryExecutor` injetado no repositório existente?**
Foi a primeira abordagem proposta neste ADR, e o `/adr-validator` (estágio 2) encontrou um gap CRÍTICO: `TransactionRepository`/`LedgerEntryRepository` são usados tanto para leitura quanto para escrita fora do `UnitOfWork` (`ConfirmDepositUseCase`), então não existe um único token "seguro" para apontar à réplica sem arriscar que uma escrita futura (ou já existente) vá parar lá. Separar em dois tipos — `XRepository` (sempre write) e `XReadRepository` (sempre read, sem métodos de mutação) — torna esse erro estruturalmente impossível: o compilador não permite `.save()` em um `XReadRepository`, porque o método não existe nesse tipo. O custo é uma interface a mais por módulo quando uma leitura genuinamente desacoplada de escrita for necessária — não duplica a implementação inteira, só o que for exclusivamente leitura.

**Por que não usar um proxy/DataSource único que decide read/write automaticamente por tipo de query (ex.: `pg-pool` com round-robin)?**
Roteamento "mágico" por parsing de SQL (SELECT vs INSERT/UPDATE/DELETE) esconderia a decisão de qual conexão está sendo usada e tornaria impossível garantir a regra "dentro de UnitOfWork sempre primary" de forma auditável. Escolha explícita por token de injeção é rastreável e testável.

**Por que streaming replication real no docker-compose e não dois pools apontando pro mesmo Postgres?**
O objetivo é validar em ambiente local o comportamento real de produção — lag de replicação, comportamento do `pg_basebackup`, falha de conexão com a réplica. Dois pools contra a mesma instância não exercitariam nada disso e dariam falsa confiança.

---

## Impacto nos Bounded Contexts (OBRIGATÓRIO)

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| account/kyc (identity) | Nova interface `UserReadRepository` (+ `PgUserReadRepository`) para leituras futuras que tolerem lag (ex.: consulta de perfil). `UserRepository` (write, usada por `RegisterUser` para checar e-mail duplicado antes de criar) não muda — continua no primary, pois a checagem de unicidade precisa de consistência imediata | Injeção de dependência via `IdentityModule` |
| financial      | Novas interfaces `TransactionReadRepository`/`LedgerEntryReadRepository` (+ `PgTransactionReadRepository`/`PgLedgerEntryReadRepository`) para leituras futuras fora de UoW. `TransactionRepository`/`LedgerEntryRepository` (write) usados por `ConfirmDepositUseCase` e `ConfirmDepositWithUowUseCase` não mudam — continuam no primary | Injeção de dependência via `FinancialModule` |
| bitcoin        | Nenhum código hoje — ao ser implementado, segue a mesma convenção (par `XRepository`/`XReadRepository` por módulo) | N/A ainda |

**Entidades de domínio afetadas:** nenhuma entidade muda de comportamento; nenhuma migration.
**Interfaces de repositório afetadas:** nenhuma interface **existente** muda de assinatura. São **adicionadas** três novas interfaces de domínio, só leitura: `TransactionReadRepository`, `LedgerEntryReadRepository` (módulo `financial`) e `UserReadRepository` (módulo `identity`) — todas hoje sem nenhum consumidor real (não há caso de uso somente-leitura implementado ainda); o ADR estabelece o padrão para quando esse caso de uso surgir.
**Migrations necessárias:** não (nenhuma tabela de negócio muda; a única mudança de "schema" é a role de replicação no Postgres, criada pelo script `init-replication.sh`, fora do fluxo de migrations da aplicação).

---

## Checklist de Arquitetura (OBRIGATÓRIO)

- [x] Nenhum arquivo em `<ctx>/domain/` importa de `<ctx>/infrastructure/` ou `<ctx>/presentation/` — as novas interfaces `XReadRepository` são abstract classes puras em `domain/`, sem import de infraestrutura (mesmo padrão de `TransactionRepository`/`LedgerEntryRepository`/`UserRepository` hoje)
- [x] Valores monetários usam `BIGINT` no banco e `bigint` no TypeScript — não aplicável a este ADR (nenhuma coluna monetária nova)
- [x] Erros de domínio são subclasses de `DomainError` (nunca boolean de retorno) — não aplicável, réplica indisponível propaga o erro nativo do `pg` (infraestrutura, não regra de negócio)
- [x] Operações multi-tabela usam `UnitOfWork` (ADR 0001) — preservado; `UnitOfWork` continua exclusivamente no `WRITE_POOL_TOKEN` e com o repositório de escrita
- [x] Entidades não recebem dependências de infraestrutura no construtor — preservado
- [x] Nenhuma interface `XReadRepository` expõe método de mutação (`save`/`delete`/`update`) — verificar em code review; é a garantia estrutural de que uma escrita não pode ir parar na réplica

---

## Plano de Implementação (OBRIGATÓRIO — na ordem)

Decisão de infraestrutura compartilhada com um acréscimo pontual em `domain/`/`infrastructure/` de cada módulo (as novas interfaces de leitura). Ordem: infra compartilhada → domínio por módulo → infraestrutura por módulo → wiring → config → docs.

### 1. Infraestrutura compartilhada (`src/infrastructure/database/`)
- [x] Renomear `POOL_TOKEN` → `WRITE_POOL_TOKEN` em `database.token.ts`; adicionar `READ_POOL_TOKEN`
- [x] `database.provider.ts` — separar em `DatabaseWriteConnectionProvider`/`DatabaseReadConnectionProvider` (ver snippet na seção Decisão, item 1), lendo `DB_WRITE_HOST`/`DB_WRITE_PORT` (com fallback para `DB_HOST`/`DB_PORT`) e `DB_READ_HOST`/`DB_READ_PORT` (sem fallback)
- [x] `read-query-executor.ts` — nova abstract class `ReadQueryExecutor extends QueryExecutor`
- [x] `read-database.service.ts` — nova classe `ReadDatabaseService implements ReadQueryExecutor`, injeta `READ_POOL_TOKEN`, sem `runInTransaction`
- [x] `database.module.ts` — registrar os dois providers de conexão, `ReadDatabaseService`, exportar `WRITE_POOL_TOKEN`, `READ_POOL_TOKEN`, `DatabaseService`, `ReadDatabaseService`/`ReadQueryExecutor`, `UnitOfWork`
- [x] `unit-of-work-postgres.service.ts` — sem mudança de comportamento; `DatabaseService` injetado continua sendo a instância de escrita
- [x] `database.service.spec.ts` — atualizar import e uso de `POOL_TOKEN` para `WRITE_POOL_TOKEN` (o rename do token quebra este spec se não for atualizado)
- [x] `read-database.service.spec.ts` — novo, cobre delegação ao pool de leitura e ausência de `runInTransaction`

### 2. Domínio por módulo — novas interfaces só-leitura

> **Nota de implementação (2026-08-01):** ao implementar, o domínio do módulo `financial` foi reorganizado de arquivos soltos em `domain/` para subpastas `domain/entities/` e `domain/repositories/` — incluindo os arquivos de escrita já existentes (`transaction.entity.ts`, `transaction.repository.ts`, `ledger-entry.entity.ts`, `ledger-entry.repository.ts`), que passaram a viver ao lado das novas interfaces de leitura, cada subpasta com seu `index.ts` de barrel. Isso diverge do caminho flat originalmente planejado abaixo (`domain/transaction-read.repository.ts`) e alinha `financial` à mesma convenção de subpastas que `identity` já usava (`domain/repositories/`). É uma reorganização de nomenclatura/pastas, não uma mudança de comportamento — a Regra de Dependência e a ausência de métodos de mutação nas interfaces de leitura continuam garantidas. Os caminhos reais são:
> - `src/modules/financial/domain/entities/transaction.entity.ts`, `ledger-entry.entity.ts`, `index.ts`
> - `src/modules/financial/domain/repositories/transaction.repository.ts`, `transaction-read.repository.ts`, `ledger-entry.repository.ts`, `ledger-entry-read.repository.ts`, `index.ts`
> - `src/modules/identity/domain/repositories/user-read.repository.ts`, `index.ts` (pasta já existia, só o `index.ts` é novo)

- [x] `src/modules/financial/domain/repositories/transaction-read.repository.ts` — nova abstract class `TransactionReadRepository` (só `findById` por ora; ponto de extensão para consultas futuras)
- [x] `src/modules/financial/domain/repositories/ledger-entry-read.repository.ts` — nova abstract class `LedgerEntryReadRepository`
- [x] `src/modules/identity/domain/repositories/user-read.repository.ts` — nova abstract class `UserReadRepository`
- [x] **Nenhuma dessas interfaces recebe método `save`/`delete`/`update`** — garantido em tempo de compilação e coberto por teste de convenção (`Object.getOwnPropertyNames` do prototype) em cada spec de `PgXReadRepository`

### 3. Infraestrutura por módulo (`infrastructure/persistence/`)
- [x] `src/modules/financial/infrastructure/persistence/pg-transaction-read.repository.ts` — `PgTransactionReadRepository extends TransactionReadRepository`, recebe `ReadQueryExecutor`
- [x] `src/modules/financial/infrastructure/persistence/pg-ledger-entry-read.repository.ts` — `PgLedgerEntryReadRepository extends LedgerEntryReadRepository`, recebe `ReadQueryExecutor`
- [x] `src/modules/identity/infrastructure/persistence/pg-user-read.repository.ts` — `PgUserReadRepository extends UserReadRepository`, recebe `ReadQueryExecutor`
- [x] `pg-transaction-read.repository.spec.ts`, `pg-ledger-entry-read.repository.spec.ts`, `pg-user-read.repository.spec.ts` — novos, cobrem delegação ao `ReadQueryExecutor`, mapeamento de linhas e o teste de convenção de ausência de métodos de mutação

### 4. Wiring dos módulos NestJS
- [x] `src/modules/financial/financial.module.ts` — adicionar providers para `TransactionReadRepository`/`LedgerEntryReadRepository` (injetando `ReadQueryExecutor`); providers existentes de `TransactionRepository`/`LedgerEntryRepository` (write) **não mudam**
- [x] `src/modules/identity/identity.module.ts` — adicionar provider para `UserReadRepository` (injetando `ReadQueryExecutor`); provider existente de `UserRepository` (write) **não muda**
- [ ] Teste de resolução de DI dos módulos (`Test.createTestingModule`) — **não implementado**. `*.module.ts` está excluído de cobertura no `jest.config` do projeto (`collectCoverageFrom: ["!**/*.module.ts", ...]`) e não há precedente de spec de módulo NestJS no repositório; o wiring foi validado via `pnpm build` (compila, logo os tokens resolvem) em vez de um spec dedicado. Registrado como desvio consciente, não silencioso.

### 5. Configuração e ambiente
- [x] `.env.example` — adicionar `DB_WRITE_HOST`, `DB_WRITE_PORT`, `DB_READ_HOST`, `DB_READ_PORT`, `DB_REPLICATION_USER`, `DB_REPLICATION_PASSWORD`, `POSTGRES_REPLICA_PORT`
- [x] `docker-compose.yml` — substituir serviço único `postgres` por `postgres-primary` + `postgres-replica`, atualizar `app` para as novas variáveis
- [x] `docker/postgres-primary/init-replication.sh` — novo script de criação de role de replicação
- [x] `docker/postgres-replica/entrypoint-replica.sh` — novo script de `pg_basebackup` + start em modo standby
- [x] `chmod +x` nos dois scripts (necessário para o Docker executar)

### 6. Documentação
- [x] `docs/architecture/03-estrutura-projeto.md` — atualizar seção "Infrastructure Global" e o diagrama de dependências para refletir `WRITE_POOL_TOKEN`/`READ_POOL_TOKEN`, `ReadDatabaseService` e o padrão `XRepository`/`XReadRepository` por módulo

---

## Edge Cases & Erros de Domínio (OBRIGATÓRIO)

| Caso | Erro de domínio | Comportamento decidido |
|------|----------------|----------------------|
| réplica indisponível ao executar leitura via `XReadRepository` | nenhum (erro de infraestrutura, não de domínio) | `ReadDatabaseService.query()` propaga o erro do driver `pg` — fail-fast, sem retry/fallback para o primary |
| tentativa de escrita através de um `XReadRepository` (ex.: chamar `.save()` numa instância de `TransactionReadRepository`) | N/A — não existe como erro de runtime | Estruturalmente impossível: `XReadRepository` nunca declara `save`/`delete`/`update`, então o código não compila. Não existe caminho de execução em que uma escrita chegue à réplica |
| leitura dentro de `UnitOfWork.run()` | N/A | Sempre resolvida pelo repositório de escrita (`XRepository`) via `WRITE_POOL_TOKEN` — não existe caminho de código que injete `XReadRepository` dentro de uma transação |
| réplica com lag (dado ainda não replicado) | N/A | Aceito como trade-off consciente de read replica — não é erro, é comportamento esperado. Casos que exigem leitura consistente com a última escrita devem usar o repositório de escrita (`UnitOfWork`/primary), não `XReadRepository` |
| replica cai e sobe de novo (container restart) | N/A | `postgres-replica` refaz `pg_basebackup` do zero se o volume estiver vazio; se o volume persistiu, reconecta via `primary_conninfo` salvo em `postgresql.auto.conf` |

---

## Plano de Teste (OBRIGATÓRIO)

- [x] Unit: `ReadDatabaseService.query()` delega para o `Pool` do `READ_POOL_TOKEN` (mock de `Pool`) — `read-database.service.spec.ts`
- [ ] Unit: `DatabaseWriteConnectionProvider`/`DatabaseReadConnectionProvider` leem as variáveis de ambiente corretas (mock de `ConfigService`), incluindo fallback `DB_WRITE_HOST` → `DB_HOST` — **não implementado**. `database.provider.ts` está excluído de cobertura no `jest.config` do projeto (`!**/database.provider.ts`) e instancia `Pool` diretamente (`new Pool(...)`), o que exigiria mockar o módulo `pg` inteiro sem precedente no repositório para o provider de escrita já existente antes deste ADR. Desvio consciente, não silencioso — validado indiretamente por `pnpm build`.
- [x] Unit: `PgTransactionReadRepository.findById()`, `PgLedgerEntryReadRepository`, `PgUserReadRepository` delegam corretamente para o `ReadQueryExecutor` injetado (mock) — `pg-transaction-read.repository.spec.ts`, `pg-ledger-entry-read.repository.spec.ts`, `pg-user-read.repository.spec.ts`
- [ ] Unit: módulos (`IdentityModule`, `FinancialModule`) resolvem `TransactionReadRepository`/`LedgerEntryReadRepository`/`UserReadRepository` a partir de `ReadQueryExecutor`, e `TransactionRepository`/`LedgerEntryRepository`/`UserRepository` continuam resolvidos a partir de `DatabaseService` (write) — **não implementado**. `*.module.ts` está excluído de cobertura no `jest.config` do projeto e não há precedente de spec de módulo NestJS no repositório. Validado via `pnpm build` (compila = tokens resolvem) em vez de `Test.createTestingModule`. Desvio consciente, não silencioso.
- [x] Convenção/tipo: garantir que nenhuma abstract class `XReadRepository` declara `save`/`delete`/`update` — coberto por teste runtime (`Object.getOwnPropertyNames` do prototype) em cada spec de `PgXReadRepository`, além da garantia em tempo de compilação
- [x] Integração (CI, `.github/workflows/ci.yml`, job `replication-integration-tests`): sobe `postgres-primary` + `postgres-replica` via `docker compose` de verdade, escreve no primary via `psql`, aguarda propagação e confirma que o dado aparece na réplica (polling com timeout de 15s)
- [x] Integração (CI, mesmo job): derruba `postgres-replica`, confirma que a leitura falha (fail-fast, sem fallback) e que a escrita no primary continua funcionando normalmente
- [x] Negativo (CI, mesmo job): réplica sobe pela primeira vez (volume vazio) com o primary parado — confirma que `entrypoint-replica.sh` entra no loop de retry do `pg_basebackup` (via log), depois volta o primary e confirma que a réplica completa o `pg_basebackup` e fica `healthy`

> **Nota de implementação (2026-08-01):** os três cenários de integração rodam contra o `docker-compose.yml` real do projeto (não contra mocks), num job dedicado do CI. Dois problemas foram encontrados e corrigidos ao validar o job localmente antes de commitar: (1) `docker compose rm -f -v` **não remove volumes nomeados** (só voláteis anônimos) — por isso o cenário de retry roda no primeiro boot da réplica (volume genuinamente vazio) em vez de tentar "limpar" um volume já populado; (2) `docker compose up -d postgres-replica` sozinho **religa o `postgres-primary` automaticamente** por causa do `depends_on: condition: service_healthy` — por isso o step usa `--no-deps` para conseguir testar a réplica subindo com o primary de fato indisponível.

---

## Fluxos (se aplicável)

```
Leitura fora de transação (ex.: consultar extrato — caso de uso futuro)
1. Controller → UseCase
   → chama TransactionReadRepository.findById() (ou futuro findByAccountId())
2. PgTransactionReadRepository (recebe ReadQueryExecutor no construtor)
   → query vai para READ_POOL_TOKEN → postgres-replica

Escrita/leitura dentro de UnitOfWork (ex.: confirmar depósito)
1. UseCase → uow.run(async ({ transactionRepo, ledgerRepo }) => { ... })
2. PostgresUnitOfWork abre transação via DatabaseService (WRITE_POOL_TOKEN)
   → todas as queries do callback (leituras e escritas) usam o mesmo client → postgres-primary
3. Commit/Rollback no primary
```

---

## Consequências

**Positivas:**
- Leituras de alto volume deixam de competir por conexões/recursos com escritas críticas do ledger
- Nenhuma interface **existente** muda de assinatura — `TransactionRepository`, `LedgerEntryRepository`, `UserRepository` e todos os casos de uso que os consomem (`ConfirmDepositUseCase`, `ConfirmDepositWithUowUseCase`, `RegisterUser`) permanecem exatamente como estão. São **adicionadas** interfaces novas, só leitura (`TransactionReadRepository`, `LedgerEntryReadRepository`, `UserReadRepository`), sem consumidor obrigatório imediato
- É estruturalmente impossível (erro de compilação, não de runtime) uma escrita ir parar na réplica — `XReadRepository` nunca expõe `save`/`delete`/`update`
- Ambiente local espelha fielmente a topologia de produção (streaming replication real), permitindo detectar problemas de lag/replicação antes do deploy
- Regra de roteamento é explícita e auditável (token de DI + tipo de repositório), não há SQL parsing "mágico"

**Negativas / Trade-offs:**
- Dois containers Postgres localmente (mais RAM/CPU no ambiente dev) e complexidade adicional de bootstrap (`pg_basebackup` na primeira subida)
- Cada módulo que precisar de leitura desacoplada de escrita ganha uma interface (`XReadRepository`) e uma implementação (`PgXReadRepository`) a mais para manter, além do par de escrita já existente
- Leituras via réplica podem retornar dados com lag — cada novo caso de uso precisa decidir conscientemente se tolera lag (`XReadRepository`) ou exige consistência imediata (repositório de escrita/`UnitOfWork`)
- Sem fallback automático: uma réplica fora do ar quebra todas as leituras que dependem dela, mesmo que o primary esteja saudável (aceito deliberadamente para o MVP — ver seção Decisão, item 5)
- Scripts de shell (`init-replication.sh`, `entrypoint-replica.sh`) são infraestrutura fora do TypeScript, exigem manutenção separada

---

## Decisões do Usuário (rastreabilidade)

> Confirmadas no grelhamento (Passo 2 da skill). Não são suposições do arquiteto.

- 2026-07-27 — Como a réplica vai replicar os dados no docker-compose local? → Streaming replication real (`pg_basebackup` + standby), não dois pools contra o mesmo Postgres.
- 2026-07-27 — Leituras dentro do `UnitOfWork` vão para write ou read? → Sempre write/primary, inclusive leituras — leitura na réplica dentro de uma transação quebraria "read-your-writes" e ficaria sujeita a lag de replicação.
- 2026-07-27 — Escopo: para todos os módulos ou só os de alto volume de leitura? → Infraestrutura genérica reutilizável por qualquer módulo (decisão de infraestrutura compartilhada, não de domínio específico).
- 2026-07-27 — Como os repositórios existentes recebem o `QueryExecutor` certo fora do `UnitOfWork`? → Delegado ao arquiteto ("melhor prática de mercado"): dois tokens de `QueryExecutor` (`ReadQueryExecutor`/write `DatabaseService`) injetados via `useFactory` do módulo, sem duplicar classes de repositório.
- 2026-07-27 — Comportamento se a réplica cair? → Fail-fast, erro propaga sem fallback automático para o primary (adequado para MVP; resiliência adicional fica para ADR futuro se necessário).
- 2026-07-29 — Como resolver o gap CRÍTICO encontrado pelo `/adr-validator` (roteamento write/read do `FinancialModule` arriscava mandar escrita de `ConfirmDepositUseCase` para a réplica)? → Criar repositórios de leitura e de escrita como tipos separados, usando o conceito de CQRS (Command Query Responsibility Segregation) na camada de persistência — não reaproveitar o mesmo token/interface para os dois usos.

---

## Referências

- ADR 0001 — UnitOfWork Pattern for Atomic Transactions (`docs/adr/0001-unit-of-work-pattern.md`)
- `docs/architecture/03-estrutura-projeto.md` — estrutura de `infrastructure/database/`
- [PostgreSQL: Streaming Replication](https://www.postgresql.org/docs/current/warm-standby.html#STREAMING-REPLICATION)

---

## Validação (Estágio 2) — 2026-07-27

**Veredito:** 🔁 **REVISAR**

### Checklist

| Bloco | Item | Status | Evidência |
|-------|------|--------|-----------|
| A. Regra de Dependência | Mudança não toca `domain/`/`presentation/` de nenhum módulo | OK | `financial.module.ts`, `identity.module.ts` só alteram `useFactory`/`inject` na camada de módulo NestJS |
| A. Regra de Dependência | Repositórios continuam acessados só via interface de domínio | OK | `TransactionRepository`, `LedgerEntryRepository`, `UserRepository` inalterados |
| B. DDD | N/A — nenhuma entidade/VO/evento novo | N/A | — |
| C. Precisão monetária | N/A — nenhum campo monetário novo | N/A | — |
| D. Atomicidade (ADR 0001) | UnitOfWork permanece 100% no write pool | OK | Seção "Decisão", item 4 — `PostgresUnitOfWork` não é tocado |
| D. Atomicidade (ADR 0001) | Repositórios usados fora do UoW não fazem escrita ao serem repontados para `ReadQueryExecutor` | **GAP CRÍTICO** | `confirm-deposit.usecase.ts:18-33` escreve (`transactionRepo.save`, `ledgerRepo.save` x2) usando o **mesmo token de DI** (`TransactionRepository`/`LedgerEntryRepository`) que o ADR, na seção "Decisão" item 4 e na tabela de Impacto (linha 240), propõe repontar para `ReadQueryExecutor` |
| E. Schema | N/A — nenhuma tabela de negócio muda | N/A | — |
| F. Edge cases | Réplica indisponível coberto | OK | Tabela "Edge Cases" |
| F. Edge cases | Escrita acidental contra a réplica (decorrente do GAP acima) | **GAP ALTO** | Não há linha na tabela de Edge Cases para "write contra pool de leitura" — cenário real seria erro do Postgres (`cannot execute INSERT/UPDATE in a read-only transaction`), não falha de conexão |
| G. Plano de teste | Cobre leitura/escrita via UoW e queda de réplica | OK, mas incompleto | Falta cenário do GAP ALTO acima |
| H. Plano de implementação | Ordem coerente (infra compartilhada → infra por módulo → config → docs) | OK | Seção "Plano de Implementação" |
| — | `.env` real (não versionado) não é mencionado no plano, só `.env.example` | BAIXO (aceitável) | Fora do repo git; ambiente docker-compose usa valores fixos por serviço, não `${DB_READ_HOST}` do `.env` — não bloqueia |

### Gaps

| # | Severidade | Gap | Evidência | Correção exigida |
|---|-----------|-----|-----------|-------------------|
| 1 | CRÍTICO | O exemplo de roteamento (seção "Decisão", item 4) e a linha "financial" da tabela de Impacto propõem repontar `TransactionRepository`/`LedgerEntryRepository` (tokens de DI do `FinancialModule`) para `ReadQueryExecutor`. Esses mesmos tokens são usados por `ConfirmDepositUseCase` para **escrever** fora do `UnitOfWork`. Implementar como descrito faz a escrita ir contra a réplica (read-only), quebrando o fluxo de confirmação de depósito em produção. | `src/modules/financial/financial.module.ts:29-38`, `src/modules/financial/application/confirm-deposit.usecase.ts:18-33` | O ADR precisa decidir explicitamente uma das duas saídas e documentá-la: (a) manter `TransactionRepository`/`LedgerEntryRepository` do `FinancialModule` sempre no write pool (já que hoje são usados para escrita fora de UoW) e só introduzir `ReadQueryExecutor` em repositórios/tokens **novos**, criados especificamente para casos de uso somente-leitura; ou (b) tratar `ConfirmDepositUseCase` (não-UoW) como código morto a remover nesta mudança (ele já é redundante com `ConfirmDepositWithUowUseCase` e viola ADR 0001 ao fazer 3 escritas sem transação) e só então liberar o token para `ReadQueryExecutor`. Qualquer uma exige atualizar a seção "Decisão" item 4 e a tabela de Impacto. |
| 2 | ALTO | Decorrente do gap 1: a tabela de Edge Cases não cobre o cenário "write executado contra o pool de leitura" — o modo de falha não é o mesmo do "réplica indisponível" (é um erro do Postgres rejeitando a escrita, não um erro de conexão). | Tabela "Edge Cases & Erros de Domínio" | Adicionar linha explícita cobrindo esse cenário (ou removê-lo por construção, se o gap 1 for resolvido pela opção que impede fisicamente qualquer repositório com método de escrita de receber `ReadQueryExecutor`). |
| 3 | MÉDIO | O fallback `DB_WRITE_HOST` → `DB_HOST` é descrito em prosa (seção "Decisão", item 1) mas não há exemplo de código para `database.provider.ts` mostrando a expressão exata de fallback (hoje o provider usa `config.getOrThrow`, que não suporta fallback nativamente). | Seção "Decisão", item 1; `database.provider.ts` atual usa `config.getOrThrow('DB_HOST')` | Adicionar o snippet do provider de escrita com a expressão de fallback (ex.: `config.get('DB_WRITE_HOST') ?? config.getOrThrow('DB_HOST')`) para remover ambiguidade na execução. |

### Cobertura

- **OK:** Regra de Dependência (2/2 aplicáveis), Atomicidade/UoW (1/2), Edge cases réplica indisponível, ordem do plano de implementação.
- **GAP:** roteamento write/read para os tokens já existentes do `FinancialModule` (CRÍTICO), edge case de escrita contra réplica (ALTO), snippet de fallback de config (MÉDIO).
- **N/A:** DDD (nenhum conceito novo), precisão monetária (nenhum campo novo), schema (nenhuma migration).

### Próximo passo

Rode `/adr-architect` para amendar o ADR endereçando o gap CRÍTICO (decisão explícita sobre `TransactionRepository`/`LedgerEntryRepository` do `FinancialModule`) e o gap ALTO (edge case), depois re-valide.

---

## Validação (Estágio 2, 2ª rodada) — 2026-07-29

**Veredito:** 🔁 **REVISAR**

O gap CRÍTICO da primeira rodada está **resolvido**: a seção "Decisão" item 4 foi reescrita para CQRS (repositório de escrita `XRepository` e repositório de leitura `XReadRepository` como tipos distintos), confirmado no código atual — `financial.module.ts:29-38` mantém `TransactionRepository`/`LedgerEntryRepository` ligados a `DatabaseService` (write), sem nenhuma mudança, e o novo `XReadRepository` não declara `save`/`delete`. O gap MÉDIO do fallback de config também está resolvido (snippet completo na seção "Decisão", item 1). Porém a amendment não propagou a mudança de design para o restante do documento, criando gaps novos.

### Checklist (itens re-verificados nesta rodada)

| Bloco | Item | Status | Evidência |
|-------|------|--------|-----------|
| D. Atomicidade | Repositório de escrita nunca recebe `ReadQueryExecutor` | OK (resolvido) | Seção "Decisão" item 4; `financial.module.ts:29-38` inalterado |
| F. Edge cases | Cenário "escrita contra pool de leitura" coberto | **GAP ALTO (ainda aberto)** | Tabela "Edge Cases & Erros de Domínio" (linhas 380-385) não foi atualizada — continua com a redação da primeira versão, sem menção a `XReadRepository`, e não registra que a escrita contra a réplica agora é impossível por construção (isso deveria estar documentado ali, não só na seção Decisão) |
| — | Consistência interna do documento | **GAP ALTO (novo)** | Seção "Fluxos" (linhas 402-407) ainda mostra `TransactionRepository.findByAccountId()` "instanciado com `ReadQueryExecutor`" — exatamente o padrão que a seção "Decisão" item 4 e o Rationale (linha 303) descrevem como a causa do gap CRÍTICO original. Um implementador que leia só "Fluxos" reintroduz o bug corrigido. Deveria mostrar `TransactionReadRepository`/`PgTransactionReadRepository` |
| G. Plano de teste | Testes cobrem as classes/interfaces novas (`XReadRepository`, `PgXReadRepository`) | **GAP MÉDIO** | "Plano de Teste" (linhas 391-396) ainda descreve testar "`IdentityModule`/`FinancialModule` resolvem `ReadQueryExecutor` para os provedores de leitura avulsa" — redação da abordagem abandonada, não menciona `TransactionReadRepository`, `LedgerEntryReadRepository`, `UserReadRepository` nem testa que os repositórios de escrita não expõem `ReadQueryExecutor` |
| — | Consistência "Consequências" vs "Impacto nos Bounded Contexts" | **GAP MÉDIO** | "Consequências" (linha 422) afirma "nenhuma classe de domínio ou repositório muda de assinatura — mudança inteiramente na camada de DI/infraestrutura", mas a tabela de Impacto (linhas 318-319) e o Plano de Implementação (itens 2-3) descrevem a criação de 3 novas interfaces de domínio (`TransactionReadRepository`, `LedgerEntryReadRepository`, `UserReadRepository`) e suas implementações — a mudança não é mais "só DI/infra" |
| — | Rastreabilidade da decisão de amendment | **GAP MÉDIO** | "Decisões do Usuário" (linhas 438-442) não registra a rodada de grelhamento que resultou no padrão CQRS (pergunta sobre como resolver o gap crítico → resposta do usuário escolhendo repositórios de leitura/escrita separados). A única menção fica no blockquote "Revisão" dentro da seção Decisão — o template exige que toda decisão do usuário fique também na seção dedicada, para rastreabilidade |

### Gaps

| # | Severidade | Gap | Evidência | Correção exigida |
|---|-----------|-----|-----------|-------------------|
| 1 | ALTO | Seção "Fluxos" contradiz a seção "Decisão" — mostra o padrão de roteamento que foi descartado por ser inseguro | Linhas 402-407 | Reescrever o exemplo de "Leitura fora de transação" para usar `TransactionReadRepository`/`PgTransactionReadRepository`, não `TransactionRepository` com `ReadQueryExecutor` |
| 2 | ALTO | Tabela de Edge Cases não foi atualizada para o vocabulário/design CQRS — não documenta que escrita contra a réplica é impossível por construção | Linhas 378-385 | Adicionar/atualizar linha cobrindo "tentativa de escrita via `XReadRepository`" com o comportamento decidido (não compila, por design) |
| 3 | MÉDIO | Plano de Teste não cobre as classes/interfaces efetivamente criadas por este ADR | Linhas 389-396 | Substituir os itens que mencionam `ReadQueryExecutor` genérico por testes concretos de `PgTransactionReadRepository`, `PgLedgerEntryReadRepository`, `PgUserReadRepository`, e um teste (mesmo que de convenção/lint) garantindo que `XReadRepository` nunca declara `save`/`delete`/`update` |
| 4 | MÉDIO | "Consequências" (positivas) contradiz a tabela de Impacto quanto ao escopo da mudança | Linha 422 vs linhas 318-319, 351-364 | Ajustar a redação para "nenhuma interface **existente** muda de assinatura; são adicionadas interfaces novas, só leitura" |
| 5 | MÉDIO | Rodada de grelhamento da amendment (resolução do gap CRÍTICO via CQRS) não está na seção "Decisões do Usuário" | Linhas 438-442 | Adicionar entrada: "2026-07-29 — Como resolver o gap CRÍTICO de roteamento write/read no `FinancialModule`? → Criar repositórios de leitura e escrita separados (CQRS), não reaproveitar o mesmo token/tipo." |

### Cobertura

- **Resolvido desde a 1ª rodada:** gap CRÍTICO (roteamento write/read), gap MÉDIO (snippet de fallback de config).
- **Ainda em aberto:** gap ALTO (edge case de escrita contra réplica — não fechado, só mudou de causa).
- **Novo nesta rodada:** contradição em "Fluxos" (ALTO), Plano de Teste desatualizado (MÉDIO), "Consequências" inconsistente com "Impacto" (MÉDIO), rastreabilidade incompleta (MÉDIO).

### Próximo passo

Rode `/adr-architect` novamente para propagar o design CQRS (seção Decisão, item 4) para "Edge Cases", "Fluxos", "Plano de Teste", "Consequências" e "Decisões do Usuário" — são ajustes de consistência textual, não uma nova decisão de arquitetura. Depois, re-valide.

---

## Validação (Estágio 2, 3ª rodada) — 2026-07-29

**Veredito:** ✅ **APROVA**

Os 5 gaps da 2ª rodada foram verificados e estão resolvidos:

| # | Gap da 2ª rodada | Status | Evidência |
|---|-----|--------|-----------|
| 1 (ALTO) | "Fluxos" contradizia "Decisão" | **Resolvido** | Linhas 406-410 agora usam `TransactionReadRepository`/`PgTransactionReadRepository` |
| 2 (ALTO) | Edge Cases sem vocabulário CQRS | **Resolvido** | Linha 383 cobre explicitamente "tentativa de escrita através de um `XReadRepository`" como estruturalmente impossível |
| 3 (MÉDIO) | Plano de Teste testava a abordagem abandonada | **Resolvido** | Linhas 394-398 testam `PgTransactionReadRepository`/`PgLedgerEntryReadRepository`/`PgUserReadRepository` e a garantia estrutural de ausência de `save`/`delete` em `XReadRepository` |
| 4 (MÉDIO) | "Consequências" contradizia "Impacto" | **Resolvido** | Linha 425 agora diz "nenhuma interface **existente** muda de assinatura... são adicionadas interfaces novas" — consistente com a tabela de Impacto |
| 5 (MÉDIO) | Rodada de amendment fora de "Decisões do Usuário" | **Resolvido** | Linha 448 registra a entrada de 2026-07-29 |

Re-derivação de impacto (independente, contra o código atual): `financial.module.ts:29-38` confirma que os providers de escrita de `TransactionRepository`/`LedgerEntryRepository` permanecem inalterados; nenhuma entidade ou interface de domínio existente muda de assinatura; a Regra de Dependência é respeitada nos exemplos de código do ADR (`domain/transaction-read.repository.ts` não importa `ReadQueryExecutor` — só a implementação em `infrastructure/persistence/` importa, seguindo exatamente o padrão já usado por `PgTransactionRepository`/`QueryExecutor` hoje).

### Gap novo (não bloqueante) — reportar, não ignorar

| # | Severidade | Gap | Evidência | Correção sugerida |
|---|-----------|-----|-----------|-------------------|
| 1 | MÉDIO/BAIXO | O Plano de Implementação (item 1) renomeia `POOL_TOKEN` → `WRITE_POOL_TOKEN`, mas `src/infrastructure/database/database.service.spec.ts:4,22` importa e usa `POOL_TOKEN` diretamente (`{ provide: POOL_TOKEN, useValue: mockPool }`). Esse teste quebra (erro de compilação) se o token for renomeado sem atualizar o spec — o plano não menciona esse arquivo. | `src/infrastructure/database/database.service.spec.ts:4,22` | Adicionar ao item 1 do Plano de Implementação: "atualizar `database.service.spec.ts` para importar `WRITE_POOL_TOKEN` em vez de `POOL_TOKEN`". É mecânico (o TypeScript acusa o erro imediatamente ao renomear), mas fica explícito em vez de depender do executor notar sozinho. |

Este gap é MÉDIO/BAIXO — não envolve Regra de Dependência, dinheiro, atomicidade nem schema, e a correção é trivial. Não bloqueia a implementação, mas deve ser aceito explicitamente antes de prosseguir (em vez de silenciosamente ignorado), conforme a política de gaps não-bloqueantes.

### Cobertura final

- **CRÍTICO:** 0 (o único encontrado, na 1ª rodada, está resolvido)
- **ALTO:** 0 (os dois da 2ª rodada estão resolvidos)
- **MÉDIO/BAIXO:** 1 novo (spec de `database.service` não mencionado no plano de rename do token) — não bloqueante
- Regra de Dependência, atomicidade (ADR 0001), precisão monetária (N/A), schema (N/A) — todos OK ou N/A confirmado contra o código atual

### Próximo passo

ADR pronto para implementação. Você pode: (a) aceitar o gap MÉDIO/BAIXO como está e rodar `/adr-executor` diretamente (o TypeScript vai forçar a correção do spec durante o rename), ou (b) pedir um ajuste de uma linha no Plano de Implementação antes. Recomendo (a) — é a via mais rápida e o compilador cobre o risco.
