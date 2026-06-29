# ADR 0001 — Fluxo de Transações Atômicas no Módulo de Banco de Dados

**Status:** Proposto  
**Data:** 2026-06-03  
**Autores:** Time de Backend

---

## Contexto

O projeto utiliza PostgreSQL com o driver nativo `pg` e um `Pool` de conexões exposto via injeção de dependência NestJS (`POOL_TOKEN`). Atualmente, o único uso de transações está nos scripts de migração, que executam `BEGIN`/`COMMIT`/`ROLLBACK` diretamente sobre um `PoolClient` dedicado.

À medida que a API evolui, operações de negócio passarão a exigir múltiplas escritas que precisam ser atômicas. Exemplos concretos já planejados:

- Criação de conta (`accounts`) + registro de auditoria (`audit_accounts_logs`) devem persistir juntos ou falhar juntos.
- Atualização de saldo + registro de transação Bitcoin devem ser indivisíveis.

O problema central é que `Pool.query()` — a API de conveniência do `pg` — não suporta transações: cada chamada obtém uma conexão diferente do pool, tornando impossível manter o contexto de `BEGIN`/`COMMIT` entre queries distintas. É necessário definir um padrão antes que os primeiros serviços sejam implementados.

---

## Forças em Jogo

- Manter a simplicidade do stack atual (raw SQL, sem ORM).
- Evitar vazamento de conexão (`PoolClient` não liberado após erro).
- Permitir que repositórios e serviços sejam testáveis de forma isolada.
- Não introduzir dependências externas desnecessárias.
- Seguir os padrões de injeção de dependência do NestJS já estabelecidos.

---

## Opções Consideradas

### Opção A — Gerenciamento manual por serviço

Cada serviço injeta `POOL_TOKEN`, chama `pool.connect()`, e gerencia `BEGIN`/`COMMIT`/`ROLLBACK`/`client.release()` diretamente.

```typescript
// dentro de um serviço qualquer
const client = await this.pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO accounts ...');
  await client.query('INSERT INTO audit_accounts_logs ...');
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

**Prós:** Sem nova abstração; funciona hoje.  
**Contras:** Código boilerplate repetido em toda operação transacional; alto risco de esquecimento do `client.release()`, levando a esgotamento do pool; dificulta testes unitários.

---

### Opção B — Wrapper funcional `withTransaction`

Uma função utilitária que encapsula o ciclo completo de vida do `PoolClient`:

```typescript
async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Prós:** Elimina boilerplate; garante liberação da conexão; fácil de entender.  
**Contras:** Não integra nativamente ao sistema de DI do NestJS; repositórios precisam aceitar `PoolClient` como parâmetro, o que exige uma convenção explícita.

---

### Opção C — `DatabaseService` injetável com objeto `Transaction` explícito

Um serviço NestJS que encapsula o pool e retorna um objeto de transação com ciclo de vida explícito, espelhando o padrão `startTransaction` / `commit` / `rollback` / `release`:

```typescript
// transaction.ts
export class Transaction {
  constructor(private readonly client: PoolClient) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.client.query<T>(sql, params);
  }

  async commit(): Promise<void> {
    await this.client.query('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.client.query('ROLLBACK');
  }

  async release(): Promise<void> {
    this.client.release();
  }
}

// database.service.ts
@Injectable()
export class DatabaseService {
  constructor(@Inject(POOL_TOKEN) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async startTransaction(): Promise<Transaction> {
    const client = await this.pool.connect();
    await client.query('BEGIN');
    return new Transaction(client);
  }
}
```

O consumidor controla explicitamente o fluxo com `try/catch/finally`:

```typescript
const transaction = await this.db.startTransaction();
try {
  // ações no banco
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
} finally {
  await transaction.release();
}
```

**Prós:** Integra ao DI do NestJS; fluxo de controle legível e explícito; `release` no `finally` garante liberação da conexão em qualquer caminho; fácil de mockar em testes.  
**Contras:** O consumidor deve lembrar de chamar `release` no `finally` — convenção que precisa ser comunicada e verificada em code review.

---

### Opção D — Decorator `@Transactional` com `AsyncLocalStorage`

Um decorator que encapsula o método em `BEGIN`/`COMMIT`/`ROLLBACK` e propaga o `PoolClient` via `AsyncLocalStorage`, eliminando o parâmetro `tx` dos repositórios:

```typescript
// uso no serviço — sem nenhum boilerplate visível
@Transactional()
async createAccount(dto: CreateAccountDto): Promise<Account> {
  const account = await this.accountsRepo.create(dto);       // tx implícito
  await this.auditRepo.log({ accountId: account.id });       // tx implícito
  return account;
}

// repositório busca o client ativo no contexto assíncrono
async create(data: CreateAccountDto): Promise<Account> {
  const client = TransactionContext.get() ?? this.pool;
  const result = await client.query<Account>(sql, [...]);
  return result.rows[0];
}
```

O decorator intercepta a chamada, faz `pool.connect()` + `BEGIN`, armazena o `PoolClient` num `AsyncLocalStorage`, executa o método, e faz `COMMIT` ou `ROLLBACK` + `client.release()`.

**Prós:** código de serviço completamente limpo; nenhum parâmetro `tx` nos repositórios.  
**Contras:** propagação implícita via `AsyncLocalStorage` é difícil de debugar ("o client sumiu" não tem stack trace óbvio); o `TransactionContext` precisa ser acessado em cada repositório — acoplamento invisible; não funciona fora do contexto assíncrono correto (workers, callbacks desanexados); requer implementação de infraestrutura não-trivial (decorator + context store) antes do primeiro repositório existir.

> Com TypeORM, Prisma ou MikroORM esse padrão funciona nativamente porque o ORM já gerencia o contexto internamente. Com raw `pg`, a infraestrutura precisa ser construída do zero.

---

### Opção F — Adotar Knex ou Drizzle

Introduzir um query builder com suporte nativo a transações.

**Prós:** API de transações ergonômica; geração de SQL tipada.  
**Contras:** Adiciona uma dependência significativa; requer migração dos scripts e queries existentes; vai além do escopo atual.

---

## Decisão

**Adotar a Opção C — `DatabaseService` injetável com objeto `Transaction` explícito.**

O `DatabaseService` substitui o uso direto de `POOL_TOKEN` nos serviços de negócio. O `POOL_TOKEN` permanece disponível no módulo para o script de migração e casos de uso de baixo nível que não necessitam da abstração.

### Convenção para Repositórios

Repositórios devem aceitar um `Transaction` opcional. Quando fornecido, executam as queries sobre ele (transação em andamento); quando ausente, delegam ao `DatabaseService` diretamente:

```typescript
@Injectable()
export class AccountsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(data: CreateAccountDto, tx?: Transaction): Promise<Account> {
    const sql = `INSERT INTO accounts (...) VALUES ($1, ...) RETURNING *`;
    const result = tx
      ? await tx.query<Account>(sql, [...])
      : await this.db.query<Account>(sql, [...]);
    return result.rows[0];
  }
}
```

### Uso em Serviços

```typescript
@Injectable()
export class AccountsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly accountsRepo: AccountsRepository,
    private readonly auditRepo: AuditAccountsLogsRepository,
  ) {}

  async createAccount(dto: CreateAccountDto): Promise<Account> {
    const transaction = await this.db.startTransaction();
    try {
      const account = await this.accountsRepo.create(dto, transaction);
      await this.auditRepo.log({ accountId: account.id, event: 'created' }, transaction);
      await transaction.commit();
      return account;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      await transaction.release();
    }
  }
}
```

---

## Consequências

**Positivas:**
- Transações atômicas são seguras por padrão: `ROLLBACK` e `client.release()` sempre executam, mesmo em exceções não tratadas.
- Um único ponto de injeção (`DatabaseService`) reduz acoplamento ao driver `pg` nos módulos de negócio.
- Testabilidade: basta mockar `DatabaseService` para isolar serviços em testes unitários.
- Extensível: logs de queries lentas, tracing OpenTelemetry e métricas podem ser adicionados ao `DatabaseService` sem alterar os consumidores.

**Negativas / Trade-offs:**
- Repositórios precisam adotar a convenção do parâmetro `client?: PoolClient` — isso deve ser comunicado ao time e verificado em code review.
- Transações aninhadas não são suportadas por este padrão; se necessário no futuro, exigirá uma revisão (e.g., savepoints).
- O `DatabaseService` passa a ser um ponto central de falha; sua implementação deve ser cuidadosamente testada.

---

## Arquivos a Criar/Modificar

| Ação | Caminho |
|---|---|
| Criar | `src/database/transaction.ts` — classe `Transaction` |
| Criar | `src/database/database.service.ts` — `DatabaseService` com `startTransaction()` |
| Criar | `src/database/database.service.spec.ts` |
| Modificar | `src/database/database.module.ts` — exportar `DatabaseService` |
| Convencionar | Repositórios: parâmetro `tx?: Transaction` em métodos de escrita |

---

## Referências

- [node-postgres — Transactions](https://node-postgres.com/features/transactions)
- [node-postgres — Pooling](https://node-postgres.com/features/pooling)
- Scripts de migração existentes: `src/database/scripts/run-migration.script.ts`
