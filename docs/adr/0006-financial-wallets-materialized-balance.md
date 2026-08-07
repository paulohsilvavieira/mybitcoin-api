# ADR 0006 — Financial: Saldos Materializados (Wallets) e Consulta de Saldos

**Status:** Em Progresso — PR: https://github.com/paulohsilvavieira/mybitcoin-api/pull/6

**PR:** —

**Data:** 2026-08-06

**Autores:** Time de Backend

**Contexto relacionado:** ADR 0001 (UnitOfWork), ADR 0003 (Réplica de Leitura — padrão `XRepository`/`XReadRepository`), `docs/bussiness/04-carteiras-e-ledger-financeiro.md` (INV-001 a INV-014)

**Gerado por:** skill `/adr-architect`

---

## Contexto

O bounded context `financial` hoje só tem o fluxo de confirmação de depósito (`ConfirmDepositUseCase`/`ConfirmDepositWithUowUseCase`): ele cria uma `Transaction`, confirma seu status e grava dois `LedgerEntry` (débito em `EXCHANGE:TREASURY:*`, crédito em `USER:<id>:*`). Não existe, hoje, nenhuma forma de consultar "quanto o usuário tem" — nem endpoint, nem tabela de saldo. Todo saldo, se existisse leitura, teria que ser derivado somando `ledger_entries` em tempo real, o que não escala e não é o que o time quer.

Esta ADR fecha essa lacuna: introduz o conceito de **carteira (wallet) materializada** — uma linha por `(usuário, ativo)` com o saldo já calculado — e o endpoint `GET /financial/balances` que a expõe.

**Descoberta de código, feita antes deste ADR, que muda o escopo:**

1. **`transactions` e `ledger_entries` não têm migration.** `src/modules/financial/infrastructure/persistence/transaction.sql.ts` e `ledger-entry.sql.ts` fazem `SELECT`/`INSERT` contra essas duas tabelas, mas `src/infrastructure/database/migrations/` só tem `users`, `sessions` e `login_attempts`. O bounded context `financial` nunca funcionou contra um banco real — só existe hoje sob mocks de repositório (`ConfirmDepositUseCase.spec.ts`) e testes de integração que aparentemente nunca rodaram a migration correspondente. Como a tabela `wallets` desta ADR depende de `transaction_id` (FK para `transactions`), e como este ADR precisa de migration nova de qualquer forma, a criação de `transactions` e `ledger_entries` entra nesta mesma migration — não é uma decisão de negócio nova, é infraestrutura que já deveria existir e que bloqueia qualquer teste de integração real do módulo `financial`, incluindo o desta própria ADR.
2. **`Transaction` não tem campo `asset`.** O código de `ConfirmDepositWithUowUseCase` monta a conta do ledger como `` `USER:${transaction.accountId}:${transaction.type.toUpperCase()}` `` — mas `type` é `'deposit'`/`'withdraw'` (o *tipo* da operação), não um código de ativo (`BTC`, `BRL`). Hoje isso produz contas como `USER:<id>:DEPOSIT`, que não correspondem ao modelo `USER:<id>:<ASSET>` de `docs/bussiness/04-carteiras-e-ledger-financeiro.md`. Não dá pra materializar saldo por ativo em cima de uma conta que não carrega o ativo corretamente — este ADR precisa corrigir isso (adicionar `asset` a `Transaction`) para a wallet saber em qual linha `(user_id, asset)` aplicar o crédito.
3. **O endpoint HTTP usa o use case sem `UnitOfWork`.** `FinancialModule` registra os dois use cases (`ConfirmDepositUseCase` e `ConfirmDepositWithUowUseCase`), mas `FinancialController` injeta e chama apenas `ConfirmDepositUseCase` — o que grava `transaction` + 2 `ledger_entries` em três `INSERT`s sequenciais sem transação, violando a regra de Atomicidade do projeto (`CLAUDE.md`) já antes desta ADR. Como esta ADR precisa adicionar um quarto write (a `wallet`) ao mesmo fluxo, mantê-lo fora de UoW pioraria a janela de inconsistência. Este ADR troca o controller para `ConfirmDepositWithUowUseCase` e deixa `ConfirmDepositUseCase` (a versão sem UoW) marcada como código morto a remover — ver Consequências.
4. **`src/infrastructure/database/unit-of-work.postgres.ts` é código morto.** Esse arquivo não está registrado em nenhum `Module` do NestJS — `DatabaseModule` (`src/infrastructure/database/database.module.ts:14,33`) provê `UnitOfWork` a partir de `PostgresUnitOfWork` importado de `unit-of-work-postgres.service.ts`, arquivo distinto. `docs/architecture/03-estrutura-projeto.md` já lista `unit-of-work.postgres.ts` como arquivo a ser removido. Qualquer instrução desta ADR (ou de qualquer ADR) que edite `unit-of-work.postgres.ts` não tem efeito nenhum em runtime — a implementação real a editar é `unit-of-work-postgres.service.ts`.
5. **`Transaction` não sabe reidratar seu próprio `id`.** `Transaction.create` sempre gera um `id` novo via `crypto.randomUUID()`; não existe `Transaction.restore`. `PgTransactionRepository.toDomain` e `PgTransactionReadRepository.toDomain` (`src/modules/financial/infrastructure/persistence/pg-transaction.repository.ts`, `pg-transaction-read.repository.ts`) chamam `Transaction.create(...)` ao montar a entidade a partir de uma linha do banco — ou seja, todo `findById` retorna uma `Transaction` com um `id` diferente do `row.id` original. Como `saveTransactionQuery` é um upsert por `id` (`ON CONFLICT (id) DO UPDATE`), um ciclo `findById → confirm() → save()` insere uma segunda linha em vez de atualizar a original. Essa ADR é a primeira a rodar esse fluxo contra a tabela `transactions` de verdade (que ela mesma cria), então é o ponto certo para corrigir — ver Decisão, item 2.5.

---

## Forças em Jogo

- INV-001/002/003 (`docs/bussiness/04-carteiras-e-ledger-financeiro.md`) — saldo disponível, bloqueado e total nunca podem ser negativos
- INV-004 — `total = available + locked` deve valer sempre, mesmo que hoje `locked` só assuma `0`
- INV-005 — toda atualização de wallet precisa ter `ledger_entry` correspondente; não pode haver caminho que credite `wallets.available_satoshi` sem passar pelo ledger
- INV-006/INV-007 — `ledger_entry` sempre com `transaction_id`; débitos e créditos da mesma transação sempre batem
- INV-014 — `ledger_entries` são imutáveis; a materialização em `wallets` não pode virar desculpa para permitir `UPDATE`/`DELETE` em `ledger_entries` — a wallet é uma **projeção**, o ledger continua sendo a fonte da verdade auditável
- Atomicidade (`CLAUDE.md`) — escrita em `transactions` + `ledger_entries` + `wallets` no mesmo fluxo tem que ser um único `UnitOfWork.run`
- ADR 0003 — leitura de saldo (`GET /financial/balances`) deve ir para a réplica (`READ_POOL_TOKEN`/`ReadQueryExecutor`), nunca para o primary
- O usuário decidiu adiar a migração do modelo de conta (`USER:<id>:<ASSET>` → `USER_AVAILABLE`/`USER_LOCKED`) para quando order book/saque existirem — este ADR não pode antecipar essa mudança
- `locked_satoshi` precisa existir na tabela (schema pronto para o futuro) mas nenhum fluxo o movimenta ainda — sempre `0`
- O endpoint retorna todos os ativos que o usuário já movimentou numa única chamada — não há endpoint por ativo

---

## Decisão

### 1. Migration nova cobre o que falta em `financial` + a tabela `wallets`

Gerar o arquivo com o script já existente do projeto, seguindo a convenção de nomenclatura `<timestamp>_<snake_case>.sql` usada pelas migrations atuais (`src/infrastructure/database/migrations/`):

```bash
pnpm migration:create create_financial_core_tables
```

Isso cria, nesta ordem, as três tabelas que faltam para o bounded context `financial` funcionar contra um banco real:

```sql
CREATE TABLE transactions (
  id               UUID PRIMARY KEY,
  account_id       UUID NOT NULL REFERENCES users(id),
  type             VARCHAR(20) NOT NULL,
  asset            VARCHAR(10) NOT NULL,
  amount_satoshi   BIGINT NOT NULL CHECK (amount_satoshi > 0),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_account_id ON transactions (account_id);

CREATE TABLE ledger_entries (
  id               UUID PRIMARY KEY,
  transaction_id   UUID NOT NULL REFERENCES transactions(id),
  account          VARCHAR(255) NOT NULL,
  type             VARCHAR(10) NOT NULL CHECK (type IN ('debit', 'credit')),
  amount_satoshi   BIGINT NOT NULL CHECK (amount_satoshi > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries (transaction_id);
CREATE INDEX idx_ledger_entries_account ON ledger_entries (account);

-- INV-014: ledger_entries é apenas-append. Trigger de banco em vez de só
-- confiar no repositório (`PgLedgerEntryRepository` não expõe update/delete
-- hoje, mas isso não impede um INSERT futuro descuidado ou acesso direto).
CREATE FUNCTION forbid_ledger_entries_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only (INV-014): % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entries_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_entries_mutation();

CREATE TABLE wallets (
  id                 UUID PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES users(id),
  asset              VARCHAR(10) NOT NULL,
  available_satoshi  BIGINT NOT NULL DEFAULT 0 CHECK (available_satoshi >= 0),
  locked_satoshi     BIGINT NOT NULL DEFAULT 0 CHECK (locked_satoshi >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, asset)
);

CREATE INDEX idx_wallets_user_id ON wallets (user_id);
```

Notas de projeto:
- `id` de `transactions`/`ledger_entries`/`wallets` sem `DEFAULT gen_random_uuid()`, consistente entre as três tabelas: as entidades já geram o UUID em `crypto.randomUUID()` na camada de domínio (`Transaction.create`, `LedgerEntry.create`, `Wallet.create`) e o repositório insere esse valor explicitamente — igual ao padrão hoje. `wallets.id` seguia inicialmente `DEFAULT gen_random_uuid()` numa versão anterior desta ADR; foi removido por inconsistência: se o banco gerasse o `id`, o objeto `Wallet` em memória (que já carrega um `id` gerado por `Wallet.create()` antes do `INSERT`) divergiria do `id` persistido. Sem `DEFAULT`, `PgWalletRepository` sempre insere o `id` que a entidade já gerou — mesmo padrão de `PgTransactionRepository`/`PgLedgerEntryRepository`.
- `amount_satoshi > 0` em `transactions`/`ledger_entries` reflete a regra já imposta em `LedgerEntry.create` (lança erro se `amountSatoshi <= 0n`); o `CHECK` é defesa em profundidade, não uma regra nova.
- `wallets.available_satoshi >= 0`/`locked_satoshi >= 0` são a materialização em SQL de INV-001/INV-002.
- `UNIQUE (user_id, asset)` é a garantia estrutural de "uma carteira por ativo por usuário" — impede duas linhas divergentes para o mesmo par.
- Trigger de bloqueio de `UPDATE`/`DELETE` em `ledger_entries` é nova neste ADR (não existia antes porque a tabela não existia). Decisão do arquiteto, não pedida explicitamente pelo usuário — listada em "Decisões do Usuário" como ponto a confirmar, é reversível (basta não incluir o trigger na migration) se o time preferir confiar só na disciplina do código de aplicação.

### 2. `Transaction` ganha o campo `asset`

`Transaction.create` passa a exigir `asset: string` (ex.: `'BTC'`), guardado ao lado de `type`. `ConfirmDepositWithUowUseCase` para de usar `transaction.type.toUpperCase()` na conta do ledger e passa a usar `transaction.asset.toUpperCase()`:

```typescript
account: `USER:${transaction.accountId}:${transaction.asset.toUpperCase()}`
```

`ConfirmDepositInputDTO` não muda — `asset` é definido no momento em que a `Transaction` de depósito é criada (fora do escopo desta ADR, que só cobre confirmação; hoje não existe use case de "iniciar depósito" no código, então o teste de integração cria a `Transaction` diretamente). Isso é consistente com o fato de o fluxo de início de depósito on-chain (`docs/bussiness/09-depositos-e-saques.md`) ainda não estar implementado.

### 2.5. `Transaction` ganha `restore()` — corrige bug de hidratação com `id` novo

Hoje `Transaction` só tem `create()`, que sempre gera um `id` novo (`crypto.randomUUID()`). `PgTransactionRepository.toDomain` e `PgTransactionReadRepository.toDomain` usam `Transaction.create(...)` para reconstruir a entidade a partir de uma linha do banco — o que descarta `row.id` e atribui um `id` novo à entidade em memória. Como `saveTransactionQuery` é um upsert por `id` (`ON CONFLICT (id) DO UPDATE`), o ciclo `findById(X) → transaction.confirm() → transactionRepo.save(transaction)` do próprio `ConfirmDepositWithUowUseCase` insere uma **segunda linha** (`id` novo, `status='confirmed'`) em vez de atualizar a linha `X` original (que fica `pending` para sempre), e os `ledger_entries` gravados na sequência referenciam esse `id` novo — não o `transactionId` que o cliente enviou no `POST /financial/deposit/confirm`. Esta ADR é a primeira a expor esse bug contra um banco real, porque é ela quem cria a tabela `transactions` e a FK `ledger_entries.transaction_id → transactions.id`.

Correção — mesmo padrão já usado para `Wallet.restore` (item 3, abaixo): `Transaction` ganha um segundo factory method que reidrata sem gerar novo `id`:

```typescript
static restore(params: {
  id: string;
  accountId: string;
  type: string;
  asset: string;
  amountSatoshi: bigint;
  status: TransactionStatus;
  createdAt: Date;
}): Transaction {
  return new Transaction(
    params.id,
    params.accountId,
    params.type,
    params.asset,
    params.amountSatoshi,
    params.status,
    params.createdAt,
  );
}
```

`PgTransactionRepository.toDomain` e `PgTransactionReadRepository.toDomain` trocam `Transaction.create({...})` por `Transaction.restore({ id: row.id, ... })`, preservando o `id` da linha lida. `Transaction.create` continua existindo e sendo usado só para criar transações novas (onde gerar `id` é o comportamento correto).

### 3. Nova entidade de domínio `Wallet`

`src/modules/financial/domain/entities/wallet.entity.ts`:

```typescript
export class Wallet {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly asset: string,
    private _availableSatoshi: bigint,
    private _lockedSatoshi: bigint,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  get availableSatoshi(): bigint { return this._availableSatoshi; }
  get lockedSatoshi(): bigint { return this._lockedSatoshi; }
  get totalSatoshi(): bigint { return this._availableSatoshi + this._lockedSatoshi; } // INV-004

  creditAvailable(amountSatoshi: bigint): void {
    Wallet.assertValidCreditAmount(amountSatoshi);
    this._availableSatoshi += amountSatoshi;
    this._updatedAt = new Date();
  }

  static assertValidCreditAmount(amountSatoshi: bigint): void {
    if (amountSatoshi <= 0n) throw new InvalidCreditAmountError(amountSatoshi);
  }

  static create(params: { userId: string; asset: string }): Wallet { /* available=0n, locked=0n */ }
  static restore(params: { /* todas as colunas */ }): Wallet { /* reidratação vinda do repositório */ }
}
```

**Nota (Re-Validação, rodada 3, Gap #1):** a instância `creditAvailable(amountSatoshi)` acima — que soma em memória e reatribui `_availableSatoshi` — **não é mais o caminho usado para persistir crédito de depósito** (ver item 4/5 abaixo, que passam a usar um incremento atômico SQL-side). Ela continua existindo porque: (1) é a unidade de teste do invariante "crédito de valor não-positivo é rejeitado" (`Wallet.creditAvailable(0n)`/`creditAvailable(-1n)` no Plano de Teste, unit puro sem banco); (2) `Wallet.assertValidCreditAmount` — extraído desta rodada para poder ser chamado sem precisar de uma instância de `Wallet` em memória — é reusado tanto pelo método de instância quanto pelo use case (item 5) antes de acionar o repositório. A soma em memória (`_availableSatoshi += amountSatoshi`) não é descartada por ser inútil; é descartada porque, no caminho de persistência real, quem calcula o valor final é o SQL (`available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi`), não o TypeScript — a instância mutada em memória nunca é serializada de volta ao banco pelo novo `WalletRepository.creditAvailable`.

`InvalidCreditAmountError` (`src/modules/financial/domain/errors/invalid-credit-amount.error.ts`) segue o padrão de erro tipado do projeto (`CLAUDE.md`, "Erros de domínio — sempre tipados"):

```typescript
export class InvalidCreditAmountError extends DomainError {
  readonly code = 'INVALID_CREDIT_AMOUNT';

  constructor(readonly amountSatoshi: bigint) {
    super(`Credit amount must be positive, got ${amountSatoshi}`);
  }
}
```

Esse é o único erro novo introduzido por esta ADR (código novo, sem dívida herdada) — diferente de `LedgerEntry.create`/`Transaction.confirm`, que hoje lançam `Error` genérico e continuam fora de escopo aqui (dívida pré-existente, não agravada por esta ADR).

Só `creditAvailable` é implementado agora — não há `debitAvailable`/`lock`/`unlock` porque não há caso de uso (saque, ordem) que os precise; isso é decisão explícita do usuário (pergunta 3). Adicionar esses métodos antecipadamente seria implementar comportamento sem consumidor e sem invariante testável hoje.

### 4. `WalletRepository` (write) e `WalletReadRepository`

**Redesenhado na Re-Validação (Estágio 2, rodada 3), Gap #1** — a versão original desta seção (`save(wallet: Wallet): Promise<void>` fazendo `INSERT ... ON CONFLICT DO UPDATE SET available_satoshi = $x` com o valor absoluto já somado em memória) tinha uma race condition real: `ON CONFLICT DO UPDATE` nunca falha por violação de unicidade — ele espera o lock da linha e aplica o `SET`, então duas confirmações de depósito concorrentes do mesmo `(user_id, asset)` produzem *lost update* (a segunda sobrescreve o valor calculado pela primeira, silenciosamente, sem erro). A alegação anterior de que a `UNIQUE (user_id, asset)` faria o segundo `INSERT` "falhar" estava incorreta — `ON CONFLICT DO UPDATE` é desenhado justamente para não falhar nesse caso.

Correção — o crédito passa a ser um **incremento atômico calculado inteiramente no SQL** (abordagem (a) do gap, escolhida em vez de `SELECT ... FOR UPDATE` porque também cobre o caso "wallet ainda não existe": um `SELECT ... FOR UPDATE` sozinho não serializa dois `Wallet.create()` concorrentes que colidem no mesmo `INSERT`/`ON CONFLICT`, então o incremento SQL-side resolve os dois casos — achar-ou-criar e creditar — com uma única instrução, sem depender de round-trip de leitura antes do write, coerente com o driver `pg` puro do projeto):

```typescript
// domain/repositories/wallet.repository.ts
export abstract class WalletRepository {
  abstract findByUserIdAndAsset(userId: string, asset: string): Promise<Wallet | null>;

  // Incremento atômico SQL-side — substitui o antigo save(wallet) de valor absoluto.
  // Cria a linha com available_satoshi = amountSatoshi se (user_id, asset) ainda não existe;
  // soma amountSatoshi ao valor já persistido se existe. Nunca lê-calcula-sobrescreve em memória.
  abstract creditAvailable(params: {
    userId: string;
    asset: string;
    amountSatoshi: bigint;
  }): Promise<Wallet>;
}

// domain/repositories/wallet-read.repository.ts
export abstract class WalletReadRepository {
  abstract findAllByUserId(userId: string): Promise<Wallet[]>;
}
```

`findByUserIdAndAsset` permanece na interface (usado pelo teste de integração "retorna `null` quando não existe" do Plano de Teste e como leitura pontual auxiliar), mas **não é mais usado no caminho de escrita** do `ConfirmDepositWithUowUseCase` — o achar-ou-criar que antes vivia no use case (item 5, versão anterior) agora vive inteiramente dentro do `INSERT ... ON CONFLICT` de `creditAvailable`.

`PgWalletRepository.creditAvailable` (write, primary, dentro de UoW):

```typescript
// wallet.sql.ts
export const CREDIT_WALLET_AVAILABLE_QUERY = `
  INSERT INTO wallets (id, user_id, asset, available_satoshi, locked_satoshi, created_at, updated_at)
  VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
  ON CONFLICT (user_id, asset) DO UPDATE
    SET available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi,
        updated_at = NOW()
  RETURNING *;
`;
```

```typescript
// pg-wallet.repository.ts
async creditAvailable(params: {
  userId: string;
  asset: string;
  amountSatoshi: bigint;
}): Promise<Wallet> {
  const candidateId = crypto.randomUUID(); // só é usado se a linha ainda não existir (caminho INSERT)
  const row = await this.db.query(CREDIT_WALLET_AVAILABLE_QUERY, [
    candidateId,
    params.userId,
    params.asset,
    params.amountSatoshi.toString(),
  ]);
  return Wallet.restore({ /* mapeia row[0], BigInt(row.available_satoshi), ... */ });
}
```

`available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi` faz o Postgres somar o valor persistido ao valor da linha que colidiu — sob duas transações concorrentes, a segunda a adquirir o lock da linha soma sobre o resultado já commitado da primeira (não sobre um valor lido antes de ambas), então nenhum crédito se perde. Como o `id` da coluna não é tocado pela cláusula `DO UPDATE`, `candidateId` só "vence" quando a linha é criada pela primeira vez; em conflito, o `id` existente da linha é preservado. `PgWalletReadRepository` (read, réplica, via `ReadQueryExecutor`) continua só implementando `findAllByUserId`, sem mudança.

### 5. `ConfirmDepositWithUowUseCase` credita a wallet no mesmo UoW

`Repositories` (`src/shared/unit-of-work.ts`) ganha `walletRepo: WalletRepository`. A implementação real de `UnitOfWork` usada em produção é `PostgresUnitOfWork` em `src/infrastructure/database/unit-of-work-postgres.service.ts` — é esse arquivo (não `src/infrastructure/database/unit-of-work.postgres.ts`, que é código morto não registrado em nenhum `Module` do NestJS, conforme `docs/architecture/03-estrutura-projeto.md`) que `PostgresUnitOfWork.run` precisa editar para instanciar `PgWalletRepository(transactionDatabase)` ao lado de `PgTransactionRepository`/`PgLedgerEntryRepository`, usando a mesma conexão de transação:

```typescript
// src/infrastructure/database/unit-of-work-postgres.service.ts
const repositories: Repositories = {
  transactionRepo: new PgTransactionRepository(transactionDatabase),
  ledgerRepo: new PgLedgerEntryRepository(transactionDatabase),
  walletRepo: new PgWalletRepository(transactionDatabase),
};
```

`ConfirmDepositWithUowUseCase.execute` passa a:

```typescript
await this.uow.run(async ({ transactionRepo, ledgerRepo, walletRepo }) => {
  const transaction = await transactionRepo.findById(input.transactionId);
  if (!transaction) throw new TransactionNotFoundError(input.transactionId);

  transaction.confirm();

  const debit = LedgerEntry.create({ /* EXCHANGE:TREASURY:<ASSET>, débito */ });
  const credit = LedgerEntry.create({ /* USER:<id>:<ASSET>, crédito */ });

  await transactionRepo.save(transaction);
  await ledgerRepo.save(debit);
  await ledgerRepo.save(credit);

  Wallet.assertValidCreditAmount(transaction.amountSatoshi);
  await walletRepo.creditAvailable({
    userId: transaction.accountId,
    asset: transaction.asset,
    amountSatoshi: transaction.amountSatoshi,
  });
});
```

**Redesenhado na Re-Validação (Estágio 2, rodada 3), Gap #1.** A versão anterior desta seção fazia achar-ou-criar em memória (`findByUserIdAndAsset` → `Wallet.create` se `null` → `wallet.creditAvailable(amount)` somando em TypeScript → `walletRepo.save(wallet)` gravando o valor absoluto) e alegava que `UNIQUE (user_id, asset)` protegia contra corrida porque o segundo `INSERT` "falharia". Essa alegação estava errada: com `save` implementado como `INSERT ... ON CONFLICT DO UPDATE`, o segundo `INSERT` nunca falha — ele apenas espera o lock e sobrescreve com o valor (já obsoleto) calculado em memória pela segunda transação, perdendo o crédito da primeira sem qualquer erro. Duas confirmações de depósito concorrentes do mesmo `(user, asset)` produziam *lost update* real.

A correção elimina o passo de "ler, somar em memória, escrever valor absoluto" inteiramente: `walletRepo.creditAvailable(...)` é uma única chamada que resolve achar-ou-criar e credita atomicamente dentro do próprio SQL (`available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi`, ver item 4). `Wallet.assertValidCreditAmount` (extraído do antigo corpo de `creditAvailable` de instância, ver item 3) valida o valor antes de acionar o repositório, preservando a regra de domínio "crédito de valor não-positivo é rejeitado" sem precisar de uma instância de `Wallet` em memória para isso. `UNIQUE (user_id, asset)` continua na tabela, mas agora como garantia estrutural do schema (nenhuma segunda linha divergente é fisicamente possível), não como o mecanismo que impede a perda de saldo sob concorrência — esse mecanismo é o incremento SQL-side em si.

### 6. `FinancialController` passa a usar `ConfirmDepositWithUowUseCase`

`POST /financial/deposit/confirm` troca a injeção de `ConfirmDepositUseCase` por `ConfirmDepositWithUowUseCase`. `ConfirmDepositUseCase` (a versão sem `UnitOfWork`) é removida do controller e do `FinancialModule` — ver Consequências sobre por que não é só "deixar como está".

### 7. Endpoint `GET /financial/balances`

Novo use case `GetBalancesUseCase` (`application/get-balances.usecase.ts`), injeta `WalletReadRepository`:

```typescript
export class GetBalancesUseCase {
  constructor(private readonly walletReadRepo: WalletReadRepository) {}

  async execute(input: { userId: string }): Promise<BalanceResult[]> {
    const wallets = await this.walletReadRepo.findAllByUserId(input.userId);
    return wallets.map((w) => ({
      asset: w.asset,
      available: w.availableSatoshi,
      locked: w.lockedSatoshi,
      total: w.totalSatoshi,
    }));
  }
}
```

Controller: `GET /financial/balances`, `@UseGuards(SessionAuthGuard)` (ADR 0004), `userId` de `req.user.userId` (mesmo padrão de `identity.controller.ts:303/311/344`). Retorna `[]` (200, lista vazia) se o usuário nunca moveu nenhum ativo — não é erro, é o caso normal de conta nova.

**Fiação de DI entre módulos — adicionada na Re-Validação (Estágio 2, rodada 3), Gap #2.** `SessionAuthGuard` depende de `ValidateSession` no construtor; ambos são providers de `IdentityModule` (`identity.module.ts`), que hoje **não tem `exports:`** — nada desse módulo é visível para outros. `FinancialModule` (`financial.module.ts`) também não importa `IdentityModule`. Sem correção, `@UseGuards(SessionAuthGuard)` em `FinancialController` quebra o bootstrap do Nest por dependência não resolvida assim que a aplicação sobe — o endpoint nunca chega a existir em runtime. Não há `APP_GUARD` global no projeto e nenhum outro módulo hoje importa `IdentityModule` (confirmado por busca no código) — `financial` é o primeiro consumidor cross-module do guard.

Correção, duas mudanças mínimas:

```typescript
// src/modules/identity/identity.module.ts
@Module({
  // ...
  providers: [/* ... inalterado, SessionAuthGuard já é provider aqui ... */],
  exports: [SessionAuthGuard],
})
export class IdentityModule {}
```

```typescript
// src/modules/financial/financial.module.ts
import { IdentityModule } from '@/modules/identity/identity.module';

@Module({
  imports: [IdentityModule],
  controllers: [FinancialController],
  providers: [/* ... inalterado ... */],
})
export class FinancialModule {}
```

Exportar só `SessionAuthGuard` é suficiente — o Nest resolve `ValidateSession` (dependência do guard) internamente, porque `ValidateSession` já é provider do próprio `IdentityModule` que declara e exporta o guard; não é necessário exportar `ValidateSession` separadamente nem re-declará-lo em `FinancialModule`. Alternativa de mais longo prazo (fora do escopo mínimo desta ADR, registrada como nota) seria mover `SessionAuthGuard`/`AuthenticatedRequest` para `shared/` caso mais módulos de negócio precisem do guard — hoje a correção mínima (export + import) resolve sem redesenho de camada compartilhada.

`BalanceDto`:
```typescript
export class BalanceDto {
  @ApiProperty({ example: 'BTC' }) asset!: string;
  @ApiProperty({ example: '150000' }) available!: string; // bigint → string, mesmo padrão de pg-*.repository.ts
  @ApiProperty({ example: '0' }) locked!: string;
  @ApiProperty({ example: '150000' }) total!: string;
}
```

`bigint` nunca é serializado diretamente em JSON (não é suportado nativamente) — a conversão `bigint.toString()` acontece na borda controller/DTO, mesmo padrão já usado em `pg-transaction.repository.ts:39` e `pg-ledger-entry.repository.ts:27` para persistência.

### Rationale

- **Wallet como projeção, não como fonte da verdade** — `ledger_entries` continua sendo o que audita o sistema (INV-014); `wallets` é uma tabela derivada, recalculável a qualquer momento a partir do ledger caso divergir (reconciliação, `docs/bussiness/04-carteiras-e-ledger-financeiro.md`, seção "Reconciliação Interna"). Se essa ADR precisasse escolher entre "wallets é a verdade" e "ledger é a verdade", a segunda é a única compatível com INV-014.
- **`locked_satoshi` na tabela desde já, sem fluxo que o movimente** — decisão explícita do usuário (pergunta 3): evita uma migration `ALTER TABLE` quando ordens/saques existirem, sem forçar um domínio de "lock" sem caso de uso real hoje. `Wallet.totalSatoshi` já soma os dois campos (INV-004), então o dia em que um fluxo futuro chamar um método `lock()` a ser adicionado, o "total" já está correto sem mudança de schema.
- **Achar-ou-criar em vez de provisionar wallet no cadastro do usuário** — coerente com a resposta do usuário à pergunta 4 ("lista de saldos por ativo que o usuário tem/já movimentou"): se o usuário nunca depositou nada, ele não tem linha nenhuma em `wallets`, e o endpoint retorna lista vazia. Criar 4+ linhas zeradas no cadastro (uma por ativo suportado) seria antecipar um catálogo de ativos que não existe no código hoje. **Atualizado na rodada 3:** o achar-ou-criar continua existindo como comportamento observável (primeira wallet de um `(user, asset)` nasce na primeira confirmação de depósito), mas deixou de ser um passo em duas etapas no use case (`findByUserIdAndAsset` → `Wallet.create` se `null`) — agora é resolvido dentro do próprio `INSERT ... ON CONFLICT` de `WalletRepository.creditAvailable` (ver item 4), o que também fecha a race condition do Gap #1.
- **Crédito de wallet como incremento atômico SQL-side, não "ler, somar em memória, sobrescrever"** — decisão da Re-Validação (Estágio 2, rodada 3), Gap #1: a versão anterior gravava o valor absoluto já somado em `Wallet.creditAvailable` via `UPDATE available_satoshi = $x`, o que perde crédito sob confirmações concorrentes do mesmo `(user, asset)` (`ON CONFLICT DO UPDATE` nunca falha, apenas serializa e sobrescreve). `available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi` move o cálculo para dentro do SQL, onde o Postgres serializa as duas transações via lock de linha e cada uma soma sobre o valor já commitado da anterior — nenhum crédito é perdido, sem precisar de `SELECT ... FOR UPDATE` explícito nem mudar o fluxo do use case além de trocar `save(wallet)` por `creditAvailable(params)`.
- **`SessionAuthGuard` exportado por `IdentityModule` e importado por `FinancialModule`** — decisão da Re-Validação (Estágio 2, rodada 3), Gap #2: `SessionAuthGuard` depende de `ValidateSession`, ambos providers só de `IdentityModule`, que não tinha `exports`. Sem essa fiação, `@UseGuards(SessionAuthGuard)` em `FinancialController` quebraria o bootstrap do Nest (dependência não resolvida) assim que a aplicação subisse. A correção é a menor mudança possível — `exports: [SessionAuthGuard]` + `imports: [IdentityModule]` — sem redesenhar onde o guard vive; mover o guard para `shared/` fica registrado como alternativa de mais longo prazo, não necessária para este ADR.
- **Migration de `transactions`/`ledger_entries` incluída aqui, não em ADR separado** — decisão do usuário: como `wallets.user_id`/lógica de crédito dependem de `transaction_id` existir de verdade no banco, e como este ADR já precisa de uma migration nova, adicionar as duas tabelas faltantes aqui evita um ADR "0006-b" só para destravar o que já deveria existir.
- **Trocar `ConfirmDepositUseCase` por `ConfirmDepositWithUowUseCase` no controller** — consequência direta de adicionar um quarto write (`wallets`) ao mesmo fluxo: manter dois use cases divergentes (um atômico, um não) e escrever em `wallets` só a partir do atômico criaria uma segunda porta de entrada (`ConfirmDepositUseCase`, se algum dia religada a uma rota) que confirma depósito sem nunca creditar saldo — inconsistência silenciosa, pior que o que existe hoje.

---

## Impacto nos Bounded Contexts

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| financial | Tabelas `transactions`/`ledger_entries` passam a existir de fato (migration nova, antes ausente); nova tabela `wallets`; `Transaction` ganha campo `asset`; nova entidade `Wallet`; novas interfaces `WalletRepository`/`WalletReadRepository` (+ implementações Pg) — `WalletRepository.creditAvailable` substitui `save` como incremento atômico SQL-side (rodada 3, Gap #1); `UnitOfWork.Repositories` ganha `walletRepo`; `ConfirmDepositWithUowUseCase` credita wallet via `walletRepo.creditAvailable`; `FinancialController` troca de use case de confirmação, ganha `GET /financial/balances` e passa a importar `IdentityModule` (rodada 3, Gap #2); `ConfirmDepositUseCase` (não-UoW) removida | Import direto (mesmo módulo) + import de `IdentityModule` |
| identity | **Atualizado na rodada 3 (Gap #2):** `IdentityModule` ganha `exports: [SessionAuthGuard]` — antes desta correção o módulo não exportava nada. `GET /financial/balances` consome `SessionAuthGuard`/`req.user.userId` já existentes (ADR 0004/0005), mas só passa a resolver via DI depois desse export; `financial` é o primeiro consumidor cross-module do guard | Import de módulo (`FinancialModule` importa `IdentityModule`) + uso do guard exportado |
| shared | `UnitOfWork`/`Repositories` (`src/shared/unit-of-work.ts`) ganha o campo `walletRepo` — assinatura existente muda (todo consumidor de `Repositories` precisa saber do novo campo, mas nenhum outro módulo consome hoje) | Edição de arquivo existente |
| infrastructure (compartilhada) | `PostgresUnitOfWork` (`src/infrastructure/database/unit-of-work-postgres.service.ts` — implementação realmente registrada no DI, não `unit-of-work.postgres.ts`) instancia `PgWalletRepository`; migrations novas em `src/infrastructure/database/migrations/`; remoção do arquivo morto `unit-of-work.postgres.ts` (aproveitando o PR, conforme já recomendado por `docs/architecture/03-estrutura-projeto.md`) | Edição de arquivo existente + arquivo novo + remoção de arquivo morto |

**Entidades de domínio afetadas:** `Transaction` (campo novo `asset`, não retrocompatível — `Transaction.create` sem `asset` deixa de compilar, teste `confirm-deposit.usecase.spec.ts` precisa ser atualizado; ganha também `Transaction.restore` para corrigir bug de hidratação de `id`, ver Decisão item 2.5); nova entidade `Wallet`
**Domain Events:** nenhum novo — fora de escopo (o projeto não tem event bus/event store, dívida já registrada no ADR 0004)
**Interfaces de repositório afetadas:** novas `WalletRepository`, `WalletReadRepository`; `Repositories` (UnitOfWork) ganha campo `walletRepo`
**Migrations necessárias:** sim — uma migration nova cria `transactions`, `ledger_entries` (ambas ausentes hoje) e `wallets`

---

## Checklist de Arquitetura

- [x] Nenhum arquivo em `financial/domain/` importa de `financial/infrastructure/` ou `financial/presentation/` — `Wallet`, `WalletRepository`, `WalletReadRepository` são classes/abstract classes puras
- [x] Valores monetários usam `BIGINT`/`bigint` — `wallets.available_satoshi`/`locked_satoshi` são `BIGINT`; `Wallet.availableSatoshi`/`lockedSatoshi` são `bigint`; conversão para `string` só na borda DTO/repositório
- [x] Erros de domínio são subclasses de `DomainError` — `Wallet.creditAvailable` com valor `<= 0` lança `InvalidCreditAmountError extends DomainError` (código novo desta ADR, sem dívida herdada); nenhum `boolean`/`null` usado para indicar falha
- [x] Operações multi-tabela usam `UnitOfWork` — confirmação de depósito agora escreve em `transactions` + `ledger_entries` + `wallets` dentro de um único `uow.run`; leitura de saldo não escreve em nada
- [x] SQL fica em `*.sql.ts`, nunca inline em repositório — `wallet.sql.ts` novo segue o padrão de `transaction.sql.ts`/`ledger-entry.sql.ts`
- [x] Repositório: `WalletRepository` sem prefixo `I`, `PgWalletRepository extends WalletRepository`; `find*` retorna entidade ou `null`; **atualizado (rodada 3, Gap #1):** `creditAvailable` retorna `Wallet` (não `void`) — é uma exceção deliberada à convenção "save retorna void" porque o incremento é resolvido no banco (`RETURNING *`), então o caller precisa do estado pós-incremento para qualquer uso subsequente; não há mais `save(wallet): Promise<void>` genérico na interface
- [x] Leitura tolerante a lag vai para a réplica — `WalletReadRepository`/`PgWalletReadRepository` usa `ReadQueryExecutor`/`READ_POOL_TOKEN` (ADR 0003); escrita (`WalletRepository`) fica no primary/dentro de UoW
- [x] **Concorrência sem lost update (rodada 3, Gap #1)** — `WalletRepository.creditAvailable` faz o incremento inteiramente em SQL (`available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi`); nenhum valor absoluto pré-calculado em memória é gravado, então duas confirmações concorrentes do mesmo `(user_id, asset)` sempre somam, nunca se sobrescrevem
- [x] **DI resolvível entre módulos (rodada 3, Gap #2)** — `IdentityModule` exporta `SessionAuthGuard`; `FinancialModule` importa `IdentityModule`; sem isso o `@UseGuards(SessionAuthGuard)` de `GET /financial/balances` quebraria o bootstrap do Nest

---

## Plano de Implementação

### 1. Infraestrutura compartilhada (`src/infrastructure/database/`)
- [ ] Gerar a migration via `pnpm migration:create create_financial_core_tables` (script `src/infrastructure/database/scripts/create-migration.script.ts`, produz `<timestamp>_create_financial_core_tables.sql` seguindo a convenção já usada em `migrations/`)
- [ ] Preencher a migration: `transactions`, `ledger_entries` (com trigger de imutabilidade), `wallets` (todas com `id` sem `DEFAULT gen_random_uuid()`, gerado pela camada de domínio) — ver SQL na Decisão, item 1
- [ ] `src/shared/unit-of-work.ts`: `Repositories` ganha `walletRepo: WalletRepository`
- [ ] `src/infrastructure/database/unit-of-work-postgres.service.ts` (implementação real, registrada em `database.module.ts` — **não** `unit-of-work.postgres.ts`): `PostgresUnitOfWork.run` instancia `PgWalletRepository(transactionDatabase)` ao lado dos demais repositórios
- [ ] Remover `src/infrastructure/database/unit-of-work.postgres.ts` (código morto, não referenciado por nenhum `Module`)

### 2. Domínio (`src/modules/financial/domain/`)
- [ ] `entities/transaction.entity.ts`: `Transaction.create` ganha parâmetro `asset: string`; getter `asset` na entidade; novo `Transaction.restore(params)` que reidrata sem gerar `id` novo (ver Decisão, item 2.5)
- [ ] `entities/wallet.entity.ts`: entidade `Wallet` (`create`, `restore`, `creditAvailable`, `assertValidCreditAmount` estático, getters `availableSatoshi`/`lockedSatoshi`/`totalSatoshi`); `creditAvailable`/`assertValidCreditAmount` lançam `InvalidCreditAmountError` (rodada 3: `assertValidCreditAmount` extraído para poder validar sem instância, usado pelo use case antes de acionar o incremento SQL-side — ver item 4/5 abaixo)
- [ ] `errors/invalid-credit-amount.error.ts`: `InvalidCreditAmountError extends DomainError`
- [ ] `repositories/wallet.repository.ts`: abstract class `WalletRepository` (`findByUserIdAndAsset`, `creditAvailable(params): Promise<Wallet>` — **atualizado rodada 3, Gap #1:** substitui `save(wallet): Promise<void>`, que gravava valor absoluto e permitia lost update sob concorrência)
- [ ] `repositories/wallet-read.repository.ts`: abstract class `WalletReadRepository` (`findAllByUserId`)
- [ ] `repositories/index.ts`: exportar as duas novas interfaces

### 3. Infraestrutura do módulo (`src/modules/financial/infrastructure/persistence/`)
- [ ] `wallet.sql.ts`: `findWalletByUserIdAndAssetQuery`, `CREDIT_WALLET_AVAILABLE_QUERY` (**atualizado rodada 3:** `INSERT ... ON CONFLICT (user_id, asset) DO UPDATE SET available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi, updated_at = NOW() RETURNING *` — incremento atômico, não mais `SET available_satoshi = $x` com valor absoluto), `findWalletsByUserIdQuery`
- [ ] `pg-wallet.repository.ts`: `PgWalletRepository extends WalletRepository`, implementa `creditAvailable` (gera `candidateId` via `crypto.randomUUID()` para o caminho de `INSERT`, executa `CREDIT_WALLET_AVAILABLE_QUERY`, mapeia a linha retornada via `Wallet.restore`), `bigint.toString()` na escrita / `BigInt(row.x)` na leitura, mesmo padrão de `pg-transaction.repository.ts`
- [ ] `pg-wallet-read.repository.ts`: `PgWalletReadRepository extends WalletReadRepository`, injeta `ReadQueryExecutor`
- [ ] Atualizar `transaction.sql.ts`: incluir coluna `asset` em `findTransactionByIdQuery`/`saveTransactionQuery`
- [ ] Atualizar `pg-transaction.repository.ts`/`pg-transaction-read.repository.ts`: mapear `asset` de/para `Transaction`; trocar `toDomain` de `Transaction.create(...)` para `Transaction.restore({ id: row.id, ... })`, preservando o `id` da linha lida (corrige o bug de duplicação descrito na Decisão, item 2.5)

### 4. Aplicação (`src/modules/financial/application/`)
- [ ] `confirm-deposit-with-uow.usecase.ts`: usar `transaction.asset` na conta do ledger; **atualizado rodada 3, Gap #1:** chamar `Wallet.assertValidCreditAmount(transaction.amountSatoshi)` seguido de `walletRepo.creditAvailable({ userId, asset, amountSatoshi })` dentro do mesmo `uow.run` — sem `findByUserIdAndAsset`/`Wallet.create`/`save` em três passos
- [ ] `get-balances.usecase.ts`: novo use case, injeta `WalletReadRepository`
- [ ] Remover `confirm-deposit.usecase.ts` (versão sem UoW) e seu spec — ver Consequências

### 5. Presentation (`src/modules/financial/presentation/`)
- [ ] `dtos/balance.dto.ts`: `BalanceDto` (`asset`, `available`, `locked`, `total`, todos `string`)
- [ ] `dtos/get-balances-response.dto.ts`: `BalanceDto[]`
- [ ] `financial.controller.ts`:
  - [ ] `POST /financial/deposit/confirm` injeta `ConfirmDepositWithUowUseCase` em vez de `ConfirmDepositUseCase`
  - [ ] `GET /financial/balances` — `@UseGuards(SessionAuthGuard)`, `userId` de `req.user.userId`, chama `GetBalancesUseCase`, `200` com `BalanceDto[]` (`[]` se vazio)
- [ ] `financial.module.ts`: registrar `WalletRepository`/`WalletReadRepository`/`PgWalletRepository`/`PgWalletReadRepository` (padrão do `TransactionRepository`/`TransactionReadRepository` já existente no módulo), registrar `GetBalancesUseCase`, remover provider de `ConfirmDepositUseCase`; **novo (rodada 3, Gap #2):** `imports: [IdentityModule]`
- [ ] **Novo (rodada 3, Gap #2)** `identity.module.ts`: adicionar `exports: [SessionAuthGuard]` ao `@Module(...)` — hoje o módulo não tem `exports`; sem isso `FinancialModule` não resolve `SessionAuthGuard` via DI e o bootstrap do Nest quebra
- [ ] Swagger: `@ApiOperation`/`@ApiOkResponse`/`@ApiCookieAuth` (ADR 0004) para `GET /financial/balances`, seguindo o padrão de `identity.controller.ts`

---

## Edge Cases & Erros de Domínio

| Caso | Erro de domínio | Comportamento decidido |
|------|----------------|----------------------|
| Usuário sem nenhuma wallet (nunca movimentou nada) | — (não é erro) | `GET /financial/balances` → `200 []` |
| Confirmação de depósito para `(user, asset)` sem wallet ainda | — (não é erro) | **Atualizado (rodada 3, Gap #1):** `walletRepo.creditAvailable(...)` resolve achar-ou-criar dentro do próprio `INSERT ... ON CONFLICT` — não há mais passo separado de `findByUserIdAndAsset` + `Wallet.create` no use case |
| Duas confirmações concorrentes do mesmo `(user, asset)`, com ou sem wallet prévia | — (tratado pelo incremento atômico) | **Reescrito (rodada 3, Gap #1) — a versão anterior estava incorreta:** `UNIQUE (user_id, asset)` **não** faz o segundo `INSERT` falhar quando a query é um `ON CONFLICT DO UPDATE` — ele espera o lock e aplica o `UPDATE`. A garantia real vem de `available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi`: cada transação soma sobre o valor já commitado da anterior, nunca sobre um valor lido antes de ambas. Resultado: as duas confirmações somam corretamente no saldo final, nenhuma se perde, sem erro/abort em nenhuma delas (diferente da alegação anterior de que a segunda transação abortaria) |
| `Wallet.creditAvailable`/`Wallet.assertValidCreditAmount` com valor `<= 0` | `InvalidCreditAmountError extends DomainError` | Lança, não retorna `boolean` — `LedgerEntry.create`/`Transaction.confirm` continuam lançando `Error` genérico (dívida pré-existente, fora de escopo aqui; código novo desta ADR não herda o padrão problemático) |
| `findById`/`toDomain` de `Transaction` lido do banco | — (corrigido nesta ADR) | `Transaction.restore` preserva `row.id`; `Transaction.create` só é usado para transações novas — evita duplicação de linha no upsert de `saveTransactionQuery` |
| `GET /financial/balances` sem sessão válida | — (guard rejeita antes do use case) | `401` (`SessionAuthGuard`, ADR 0004) |
| `GET /financial/balances`/qualquer rota de `financial` no bootstrap da aplicação | Falha de resolução de DI do Nest se não corrigido | **Novo (rodada 3, Gap #2):** `IdentityModule` exporta `SessionAuthGuard`, `FinancialModule` importa `IdentityModule` — sem isso o Nest não resolve `SessionAuthGuard` (que depende de `ValidateSession`, provider interno de `IdentityModule`) e a aplicação não sobe |
| `Transaction.create` chamada sem `asset` (código legado que ainda não foi atualizado) | Erro de compilação TypeScript | Não é um edge case de runtime — é o próprio objetivo da mudança de assinatura: nenhum caller pode mais esquecer o ativo |
| `locked_satoshi` de uma wallet | — | Sempre `0` — nenhum fluxo neste ADR o movimenta (decisão do usuário, pergunta 3) |

---

## Plano de Teste

- [ ] Unit (`Wallet`): `create` inicia `available=0n`/`locked=0n`; `creditAvailable` soma corretamente; `creditAvailable(0n)`/`creditAvailable(-1n)` lança `InvalidCreditAmountError`; `assertValidCreditAmount(0n)`/`assertValidCreditAmount(-1n)` lança o mesmo erro sem precisar de instância (rodada 3); `totalSatoshi` sempre `available + locked` (INV-004)
- [ ] Unit (`Transaction`): `create` exige `asset`; `asset` exposto via getter; `create` sempre gera `id` novo; `restore` preserva o `id` recebido em vez de gerar um novo (regressão do bug de hidratação corrigido nesta ADR)
- [ ] Unit (`ConfirmDepositWithUowUseCase`, atualizado): confirma transação + grava 2 `ledger_entries` + credita wallet, tudo dentro de `uow.run`; chama `Wallet.assertValidCreditAmount` antes de `walletRepo.creditAvailable`; conta do ledger usa `transaction.asset`, não `transaction.type`; **atualizado (rodada 3):** o mock de `walletRepo.creditAvailable` é chamado com `{ userId, asset, amountSatoshi }`, não mais `findByUserIdAndAsset`/`save` em passos separados
- [ ] Unit (`GetBalancesUseCase`): retorna lista mapeada de `Wallet[]`; lista vazia quando `WalletReadRepository` não retorna nada
- [ ] Integração (`PgTransactionRepository`/`PgTransactionReadRepository`): `findById` após `save` retorna a `Transaction` com o **mesmo `id`** da chamada original (regressão direta do bug de hidratação); um ciclo `findById → confirm() → save()` faz `UPDATE` da linha existente, não `INSERT` de uma segunda linha (`SELECT count(*) FROM transactions WHERE account_id = ...` permanece `1`)
- [ ] Integração (`PgWalletRepository`): `creditAvailable` cria a linha na primeira chamada (`available_satoshi = amountSatoshi`, wallet inexistente vira existente); `creditAvailable` chamado duas vezes em sequência para o mesmo `(user_id, asset)` soma (`available_satoshi` final = soma das duas chamadas, não sobrescreve nem duplica linha); `findByUserIdAndAsset` retorna `null` quando não existe
- [ ] **Novo (rodada 3, Gap #1) — Integração de concorrência real (`PgWalletRepository`):** disparar duas chamadas de `creditAvailable` para o **mesmo** `(user_id, asset)` **em paralelo** (`Promise.all`, cada uma em sua própria conexão/transação), com valores conhecidos (ex.: `100n` e `50n`, wallet inicial em `0` ou pré-existente com `1000n`); após ambas resolverem, `SELECT available_satoshi FROM wallets WHERE user_id = ... AND asset = ...` deve refletir a **soma exata** das duas (`150n`, ou `1150n` no caso pré-existente) — nenhuma das duas pode "vencer" sobrescrevendo a outra. Este é o teste de regressão direto do Gap #1 (lost update) encontrado na rodada 3 de validação; sem ele, uma futura reintrodução do padrão "ler, somar em memória, `SET` valor absoluto" passaria despercebida pelos demais testes (que não exercitam concorrência real)
- [ ] Integração (`PgWalletReadRepository`): `findAllByUserId` lê da réplica (`READ_POOL_TOKEN`), retorna todos os ativos do usuário
- [ ] Integração (migration): `ledger_entries` rejeita `UPDATE`/`DELETE` via trigger (INV-014); `wallets` rejeita `available_satoshi < 0`/`locked_satoshi < 0` via `CHECK` (INV-001/INV-002); `UNIQUE (user_id, asset)` rejeita segunda linha duplicada por qualquer caminho de escrita que não seja `ON CONFLICT` (ex.: dois `INSERT` diretos fora de `creditAvailable`, se algum código futuro tentar)
- [ ] Integração (INV-008 — não criação espontânea de saldo, fluxo `wallets`): após `POST /financial/deposit/confirm`, `wallets.available_satoshi` do usuário/ativo aumenta exatamente o valor de um `ledger_entry` do tipo `credit` associado ao mesmo `transaction_id` — nenhum incremento em `wallets` sem o `ledger_entry` de crédito correspondente
- [ ] Integração (INV-009 — não destruição espontânea de saldo, fluxo `wallets`): repetir o teste acima e confirmar que `Σ(ledger_entries.amount_satoshi WHERE account = 'USER:<id>:<ASSET>' AND type = 'credit') - Σ(... type = 'debit')` bate exatamente com `wallets.available_satoshi` após a confirmação — nenhuma divergência entre a projeção (`wallets`) e a soma do ledger (fonte da verdade, INV-014)
- [ ] Integração (`financial.controller`, `GET /financial/balances`): sem sessão → `401`; com sessão e sem movimentação → `200 []`; com sessão e depósito confirmado antes → `200` com o ativo depositado, `available` batendo com o valor depositado, `locked` = `"0"`
- [ ] Integração (`financial.controller`, `POST /financial/deposit/confirm`): fluxo completo com banco real confirma transação, grava ledger e credita wallet atomicamente; forçar erro após o `ledgerRepo.save` (ex.: mock de `walletRepo.creditAvailable` lançando) e verificar que `transaction`/`ledger_entries` também não persistem (rollback do `UnitOfWork`)
- [ ] **Novo (rodada 3, Gap #2) — Bootstrap do módulo:** teste de compilação do `AppModule`/`TestingModule` (`Test.createTestingModule({ imports: [FinancialModule, IdentityModule, ...] }).compile()`, ou equivalente via `NestFactory.create` em teste e2e) confirmando que a aplicação sobe sem `UnknownElementException`/erro de resolução de dependência — regressão direta do Gap #2 (sem `exports`/`imports` corretos, este teste falha no `compile()`)

---

## Fluxos

```
1. POST /financial/deposit/confirm { transactionId, confirmations }
   → ConfirmDepositWithUowUseCase.execute() dentro de uow.run:
     - transactionRepo.findById(transactionId) → 404 lógico se null (TransactionNotFoundError)
       (findById reidrata via Transaction.restore, preservando o id original — ver Decisão 2.5)
     - transaction.confirm()
     - ledgerRepo.save(debit EXCHANGE:TREASURY:<ASSET>)
     - ledgerRepo.save(credit USER:<id>:<ASSET>)
     - Wallet.assertValidCreditAmount(amountSatoshi)
     - walletRepo.creditAvailable({ userId: accountId, asset, amountSatoshi })
       (incremento atômico SQL-side — achar-ou-criar e creditar em uma única instrução,
        ver Decisão item 4/5, corrige a race condition do Gap #1 da rodada 3)
   → 201 { status: 'confirmed' }
   → Qualquer erro no meio: rollback de transaction + ledger_entries + wallet (UnitOfWork)

2. GET /financial/balances
   → SessionAuthGuard valida sessão, popula req.user
   → GetBalancesUseCase.execute({ userId }) → WalletReadRepository.findAllByUserId (réplica)
   → 200 [{ asset, available, locked: '0', total }, ...]  (ou [] se nunca movimentou nada)
```

---

## Consequências

**Positivas:**
- Fecha a lacuna real de "o sistema financeiro não funciona contra um banco de verdade" — `transactions`/`ledger_entries` passam a existir fisicamente, destravando qualquer teste de integração honesto do módulo `financial`
- Saldo passa a ser uma leitura O(1) (`SELECT` por `user_id`) em vez de agregação de `ledger_entries` a cada consulta — sustenta volume de leitura sem sobrecarregar a réplica
- Corrige um bug latente (`account` usando `type` em vez de `asset`) antes que ele produza dados incorretos em produção — hoje ainda não há produção rodando, é o momento mais barato de corrigir
- Corrige um segundo bug latente, mais grave, encontrado na validação desta ADR: `PgTransactionRepository`/`PgTransactionReadRepository` hidratavam `Transaction` via `create()`, descartando `row.id` e gerando um `id` novo a cada leitura — o que duplicaria linhas de `transactions` (e desalinharia `ledger_entries.transaction_id`) assim que o fluxo de confirmação de depósito rodasse contra banco real. `Transaction.restore` fecha essa lacuna antes que ela chegue a produção
- Elimina o caminho não-atômico de confirmação de depósito (`ConfirmDepositUseCase` sem UoW) que já violava a regra de Atomicidade do projeto antes mesmo desta ADR
- Schema de `wallets` já vem com `locked_satoshi` pronto — quando order book/saque existirem, não há `ALTER TABLE`, só um método novo em `Wallet` e o use case correspondente
- `PostgresUnitOfWork` agora é editado no arquivo realmente conectado ao DI (`unit-of-work-postgres.service.ts`), e o arquivo morto (`unit-of-work.postgres.ts`) é removido nesta mesma ADR — sem essa correção, `walletRepo` nunca chegaria a existir em runtime e o crédito de saldo quebraria silenciosamente (INV-005)
- **(Rodada 3)** Corrige uma race condition real e silenciosa de perda de saldo sob crédito concorrente — o design anterior (`save(wallet)` com valor absoluto) passaria despercebido em qualquer teste que não exercitasse concorrência real, e produziria saldo divergente do ledger (violação de INV-001/005/008/009) sem log, exceção ou sinal de erro algum. O incremento SQL-side fecha essa lacuna antes de chegar a produção
- **(Rodada 3)** Corrige um bug de bootstrap que só se manifestaria em runtime real (Nest falha ao instanciar `FinancialController`) — sem essa correção, `GET /financial/balances` nunca chegaria a subir, e o erro só apareceria ao rodar a aplicação, não em testes unitários isolados

**Negativas / Trade-offs:**
- `wallets` é uma projeção derivada do ledger — se algum código futuro escrever em `wallets` fora de um `UnitOfWork` que também grave o `ledger_entry` correspondente, INV-005 quebra silenciosamente (a wallet mostra saldo que o ledger não sustenta). Não há proteção de banco contra isso hoje (diferente de INV-014, que ganhou trigger) — fica como risco documentado, mitigável por `arch-guard`/`ledger-guard` em cada PR futuro que toque `wallets`
- Reconciliação `wallets` × `Σ ledger_entries` (`docs/bussiness/04-carteiras-e-ledger-financeiro.md`, seção "Reconciliação Interna") não é implementada nesta ADR — é mencionada na documentação de negócio mas não há job/rotina que a execute; dívida técnica que já existia e que este ADR não fecha
- Remover `ConfirmDepositUseCase` (versão sem UoW) é uma mudança maior que o pedido original do usuário (só queria saldo) — decisão do arquiteto para não deixar dois use cases divergentes que confirmam o mesmo depósito com garantias diferentes; se o time preferir só marcar como deprecated em vez de remover, é reversível (ver "Decisões do Usuário")
- Mudança de assinatura de `Transaction.create` (parâmetro `asset` obrigatório) quebra compilação de qualquer código existente que crie `Transaction` sem esse campo — hoje só `confirm-deposit.usecase.spec.ts`/`confirm-deposit-with-uow.usecase.spec.ts` (a atualizar), mas é uma mudança não retrocompatível a ter em mente
- **(Rodada 3)** `WalletRepository` perde o método genérico `save(wallet): Promise<void>` em favor de `creditAvailable(params): Promise<Wallet>` — uma interface mais estreita, específica para o único caso de uso hoje (crédito de depósito). Se um fluxo futuro precisar persistir uma `Wallet` já mutada em memória por outro motivo (ex.: `lock`/`unlock` de saldo para ordens), esse fluxo vai precisar de um método de repositório próprio (ex.: `lockAmount(params): Promise<Wallet>`), também atômico SQL-side — não dá para reaproveitar um `save` genérico sem reintroduzir o mesmo risco de race condition corrigido aqui
- **(Rodada 3)** `FinancialModule` passa a importar `IdentityModule` — primeiro acoplamento cross-module do projeto entre bounded contexts de negócio (antes só existiam módulos de infraestrutura compartilhada). É a correção mínima necessária para o guard funcionar; se mais módulos de negócio precisarem de `SessionAuthGuard` no futuro, vale reconsiderar mover o guard para `shared/` em vez de repetir o padrão "importar `IdentityModule` inteiro só pelo guard" módulo a módulo

---

## Decisões do Usuário

> Confirmadas no grelhamento (Passo 2 da skill). Não são suposições do arquiteto.

- 2026-08-06 — Representação do saldo → Materializado: tabela `wallets` (`available_satoshi`, `locked_satoshi` por `user_id`+`asset`), atualizada no mesmo `UnitOfWork` que grava o `ledger_entry`
- 2026-08-06 — Modelo de contas do ledger → Manter `USER:<id>:<ASSET>` por enquanto; não migrar para `USER_AVAILABLE`/`USER_LOCKED` agora — adiar para quando order book/saque existirem
- 2026-08-06 — Escopo de `locked` agora → Retornar `locked=0`; coluna `locked_satoshi` já existe no schema, mas nenhum fluxo a movimenta ainda (não há ordens/saques implementados)
- 2026-08-06 — Granularidade do endpoint → `GET /financial/balances` retorna todos os ativos numa única chamada (lista de saldos por ativo que o usuário tem/já movimentou)
- 2026-08-06 — Consistência de leitura → Réplica de leitura (`READ_POOL_TOKEN`, padrão `XReadRepository` do ADR 0003)
- 2026-08-06 — Migrations faltando de `transactions`/`ledger_entries` → Tratado como escopo desta própria ADR (impacto/mudança de infraestrutura), não como decisão de negócio nova — incluído na mesma migration que cria `wallets`, por dependência de FK (`wallets` não depende diretamente, mas `ledger_entries.transaction_id → transactions.id` é pré-requisito para o fluxo de confirmação de depósito funcionar de ponta a ponta)

**Pendente de aprovação explícita do usuário (não confirmado no grelhamento, decisão do arquiteto que precisa de sinal verde antes da implementação):**
- Trigger de banco (`forbid_ledger_entries_mutation`) bloqueando `UPDATE`/`DELETE` em `ledger_entries` — reforço de INV-014 no nível de banco, além da disciplina de código
- Remoção de `ConfirmDepositUseCase` (versão sem `UnitOfWork`) e troca do controller para `ConfirmDepositWithUowUseCase` — necessária porque o quarto write (`wallets`) não pode ficar de fora da atomicidade, mas é uma mudança de superfície maior que "adicionar consulta de saldo"
- Adição do campo `asset` a `Transaction.create` (correção do bug de `type` sendo usado como ativo na conta do ledger) — necessária para a wallet materializar o ativo certo, mas é uma mudança de assinatura não retrocompatível

**Confirmadas após `/adr-validator` (veredito REVISAR, 2026-08-06) — usuário aprovou corrigir todos os gaps, críticos e menores:**
- Gap #1 (crítico) — Editar `unit-of-work-postgres.service.ts` (arquivo real, registrado no DI), não `unit-of-work.postgres.ts` (código morto); `walletRepo` entra no `Repositories` efetivamente usado em produção; arquivo morto é removido nesta mesma ADR
- Gap #2 (crítico) — `Transaction` ganha `restore()`; `PgTransactionRepository`/`PgTransactionReadRepository` passam a usar `restore()` (preservando `row.id`) em vez de `create()` ao hidratar do banco
- Gap #3 (médio) — Plano de Implementação explicita `pnpm migration:create create_financial_core_tables` como forma de gerar o arquivo de migration
- Gap #4 (médio) — `wallets.id` perde `DEFAULT gen_random_uuid()`, ficando consistente com `transactions.id`/`ledger_entries.id` (todas com `id` gerado pela camada de domínio, inserido explicitamente pelo repositório)
- Gap #5 (médio) — `Wallet.creditAvailable` lança `InvalidCreditAmountError extends DomainError` em vez de `Error` genérico (código novo desta ADR não herda a dívida de `LedgerEntry.create`/`Transaction.confirm`)
- Gap #6 (baixo) — Plano de Teste ganha dois casos de integração dedicados a INV-008 (não criação espontânea de saldo) e INV-009 (não destruição espontânea de saldo) no caminho de escrita em `wallets`

**Confirmadas após `/adr-validator` (Re-Validação Independente, rodada 3, veredito REVISAR, 2026-08-06) — usuário pediu escrutínio adicional e aprovou corrigir ambos os gaps críticos encontrados:**
- Gap #1 (crítico) — Crédito de `wallets` redesenhado de "achar-ou-criar em memória + `save(wallet)` com valor absoluto" para incremento atômico SQL-side (`WalletRepository.creditAvailable`, `INSERT ... ON CONFLICT DO UPDATE SET available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi`). Escolhida a abordagem (a) do gap (incremento SQL-side) em vez de (b) (`SELECT ... FOR UPDATE`) porque (a) também resolve o caso "wallet ainda não existe" sem depender de round-trip de leitura antes do write, e não exige mudança de fluxo no `UnitOfWork` além de trocar a chamada de repositório no use case
- Gap #2 (crítico) — `IdentityModule` ganha `exports: [SessionAuthGuard]`; `FinancialModule` ganha `imports: [IdentityModule]` — sem essa fiação o Nest não resolveria `SessionAuthGuard` (que depende de `ValidateSession`, provider interno de `IdentityModule`) e o bootstrap da aplicação quebraria assim que `GET /financial/balances` fosse declarado com `@UseGuards(SessionAuthGuard)`

---

## Referências

- `docs/bussiness/04-carteiras-e-ledger-financeiro.md` — INV-001 a INV-014, Modelo de Contas, Reconciliação
- `docs/bussiness/09-depositos-e-saques.md` — fluxo de depósito on-chain (fora de escopo desta ADR além da confirmação)
- ADR 0001 — Padrão UnitOfWork
- ADR 0003 — Réplica de leitura, padrão `XRepository`/`XReadRepository`
- ADR 0004 — Transporte de sessão (`SessionAuthGuard`, `DomainErrorFilter`)
- `CLAUDE.md` — convenções críticas (bigint, erros tipados, UnitOfWork, SQL fora de repositório)
- `docs/architecture/03-estrutura-projeto.md` — confirma `unit-of-work.postgres.ts` como código morto a remover; convenção de nomenclatura de migrations

---

## Validação (Estágio 2) — 2026-08-06

**Veredito:** 🔁 **REVISAR**

### Checklist

| Bloco | Resultado | Observação |
|---|---|---|
| A. Regra de Dependência | OK | `Wallet`, `WalletRepository`, `WalletReadRepository` são domínio puro; nenhum import de infra/apresentação previsto |
| B. DDD — aggregate/VOs/eventos | OK / N/A | `Wallet` como aggregate root único é adequado; ausência de VOs e domain events é justificada e consistente com o padrão já usado por `Transaction`/`LedgerEntry` |
| B. DDD — erros tipados | GAP (médio) | ver Gap #5 |
| C. Precisão monetária | OK | `BIGINT`/`bigint` consistentes, sufixo `_satoshi`, conversão só na borda DTO/repositório |
| D. Atomicidade (UnitOfWork) | **GAP (crítico)** | ver Gap #1 — ADR edita o arquivo errado |
| E. Schema de banco | GAP (médio) | ver Gap #4 — inconsistência de `DEFAULT gen_random_uuid()` |
| F. Edge cases e erros | **GAP (crítico)** | ver Gap #2 — bug de hidratação de `Transaction` não é endereçado, e a ADR é quem primeiro expõe esse bug contra banco real |
| G. Plano de teste | GAP (médio/baixo) | ver Gaps #3 e #6 |
| H. Plano de implementação | GAP (herda #1) | ordem das camadas está correta (infra compartilhada → domínio → infra módulo → aplicação → presentation); o passo 1 só está incorreto no arquivo-alvo |

### Gaps

| # | Severidade | Gap | Evidência | Correção exigida |
|---|-----------|-----|-----------|-------------------|
| 1 | CRÍTICO | O ADR instrui editar `src/infrastructure/database/unit-of-work.postgres.ts` para instanciar `PgWalletRepository(tx)` — mas esse arquivo é **código morto**, não conectado ao DI do NestJS. O `PostgresUnitOfWork` realmente usado em produção é `src/infrastructure/database/unit-of-work-postgres.service.ts`. Se implementado como escrito, `walletRepo` nunca existe no `Repositories` real entregue a `ConfirmDepositWithUowUseCase`, e o crédito de wallet nunca acontece (quebra silenciosa de INV-005) ou o código quebra em runtime (`repos.walletRepo` undefined) | ADR linhas 175, 258, 284; `src/infrastructure/database/database.module.ts:14-15,33-34` (registra `PostgresUnitOfWork` a partir de `unit-of-work-postgres.service.ts`); `docs/architecture/03-estrutura-projeto.md:398-400` ("Um arquivo anterior (`unit-of-work.postgres.ts`) existe no repositório mas é código morto... Deve ser removido") | Trocar toda referência no ADR (Contexto, Decisão item 5, Impacto, Plano de Implementação item 1) de `unit-of-work.postgres.ts` para `unit-of-work-postgres.service.ts`. Aproveitar a migration/PR para remover o arquivo morto, como já recomendado independentemente pela doc de arquitetura |
| 2 | CRÍTICO | `Transaction` não tem `restore`; `PgTransactionRepository.toDomain` e `PgTransactionReadRepository.toDomain` chamam `Transaction.create(...)`, que gera um `id` **novo** via `crypto.randomUUID()` em vez de reidratar `row.id`. Como `saveTransactionQuery` é upsert por `id` (`ON CONFLICT (id) DO UPDATE`), o fluxo desta própria ADR (`findById(X)` → hidrata com id `Y≠X` → `confirm()` → `save()`) **insere uma segunda linha** (`id=Y`, `status=confirmed`) em vez de atualizar a original (`id=X`, fica `pending` para sempre), e os `ledger_entries` passam a referenciar `Y`, não o `transactionId` que o cliente enviou. Esta ADR é a primeira a rodar esse fluxo contra um banco real (a tabela nunca existiu antes) e a acrescentar a FK `ledger_entries.transaction_id → transactions.id` — o bug estava latente e esta ADR o ativa. A própria ADR já resolve esse padrão para `Wallet` (propõe `Wallet.restore`, linha 148) mas não estende a mesma correção a `Transaction`, apesar do Plano (item 3) já tocar os dois repositórios de `transaction` para mapear o novo campo `asset` | `src/modules/financial/infrastructure/persistence/pg-transaction.repository.ts:46-52`; `pg-transaction-read.repository.ts:31-37`; `src/modules/financial/domain/entities/transaction.entity.ts:24-37` (sem parâmetro `id`); `src/modules/financial/infrastructure/persistence/transaction.sql.ts:22-24` (`ON CONFLICT (id) DO UPDATE`); ADR linhas 297-298 (plano que toca esses arquivos mas não menciona o bug) | Adicionar `Transaction.restore({ id, accountId, type, asset, amountSatoshi, status, createdAt })` (mesmo padrão proposto para `Wallet.restore`) e trocar `toDomain` nos dois repositórios para usá-lo, preservando `row.id`. Sem isso, `GET /financial/balances` pode até funcionar, mas o fluxo de confirmação de depósito duplica transações silenciosamente assim que rodar contra o banco real criado por esta mesma ADR |
| 3 | MÉDIO | O Plano de Implementação (item 1) não explicita que a migration deve ser gerada via `pnpm migration:create create_financial_core_tables` (script existente, `src/infrastructure/database/scripts/create-migration.script.ts`), seguindo o padrão de nome `<timestamp>_<snake_case>.sql` já usado pelas migrations existentes | `package.json:23` (`migration:create`); `src/infrastructure/database/migrations/` (ex.: `1785790561398_add_seq_to_login_attempts.sql`) | Adicionar ao Plano de Implementação item 1: "gerar a migration via `pnpm migration:create create_financial_core_tables`" para evitar um arquivo `.sql` solto fora da convenção de nomenclatura/timestamp |
| 4 | MÉDIO | `wallets.id` usa `DEFAULT gen_random_uuid()`, enquanto `transactions.id`/`ledger_entries.id` — na mesma migration — explicitamente **não** usam esse default, com justificativa própria de que "as entidades já geram o UUID... e o repositório insere esse valor" (Decisão item 1, notas). Se `Wallet.create()` segue o mesmo padrão de `Transaction`/`LedgerEntry` (gerar `id` no domínio), o `DEFAULT` em `wallets.id` é inconsistente e nunca é de fato usado — ou, se o upsert de `PgWalletRepository` omitir a coluna `id` na primeira inserção, o `id` gerado em memória diverge do `id` real persistido pelo banco, e o objeto `Wallet` retornado ao caller carrega um id que não corresponde à linha gravada | ADR linha 91 (`wallets.id ... DEFAULT gen_random_uuid()`) vs linhas 53/65 (`transactions.id`/`ledger_entries.id` sem default) e nota da linha 105 | Remover `DEFAULT gen_random_uuid()` de `wallets.id` por consistência com o resto da própria migration, garantindo que `PgWalletRepository` sempre insere o `id` gerado pela entidade — ou, se a intenção for deixar o banco gerar, explicitar isso na ADR e adicionar `RETURNING id` ao upsert para popular a entidade corretamente |
| 5 | MÉDIO | `Wallet.creditAvailable` (método **novo**, introduzido por esta ADR) lança `Error` genérico em vez de subclasse de `DomainError`, violando a convenção crítica do `CLAUDE.md` ("Erros de domínio — sempre tipados"). O ADR reconhece o padrão problemático na tabela de Edge Cases como "fora de escopo", mas isso vale para o código legado (`LedgerEntry.create`); para código novo não há justificativa de dívida herdada | ADR linha 142 (`throw new Error('Credit amount must be positive')`); ADR linha 323 (Edge Cases, reconhece mas não corrige); `CLAUDE.md`, seção "Erros de domínio — sempre tipados" | No mínimo o método novo (`Wallet.creditAvailable`) deve lançar um erro tipado (ex.: `InvalidCreditAmountError extends DomainError`). Se o time decidir manter `Error` genérico mesmo assim, essa decisão precisa constar explicitamente em "Decisões do Usuário", não apenas numa nota de rodapé da tabela de Edge Cases |
| 6 | BAIXO | Plano de Teste não cobre explicitamente INV-008/INV-009 (nenhuma criação/destruição espontânea de saldo) para o novo caminho de escrita em `wallets` — só testa o caminho feliz de soma e o rollback por falha em `walletRepo.save` | ADR linhas 330-340 (Plano de Teste) vs `docs/bussiness/04-carteiras-e-ledger-financeiro.md` INV-008/INV-009 | Adicionar um teste de integração que valide que toda alteração em `wallets.available_satoshi` tem exatamente um `ledger_entry` de crédito/débito de mesmo valor associado à mesma `transaction_id` (não só o caminho feliz) |

### Cobertura

- **OK:** Regra de Dependência, modelagem de aggregate/VOs/eventos, precisão monetária (bigint/BIGINT), padrão `XRepository`/`XReadRepository` (ADR 0003), uso de `SessionAuthGuard`/`req.user.userId` (ADR 0004), SQL fora do repositório, nomenclatura de repositório sem prefixo `I`
- **GAP:** atomicidade real do UnitOfWork (arquivo errado), hidratação de `Transaction` (bug de identidade pré-existente ativado por esta ADR), consistência de `DEFAULT` no schema, erros tipados no método novo, granularidade do plano de teste para INV-008/009, explicitação do comando de geração de migration
- **N/A:** Domain Events (justificado — projeto não tem event bus), Value Objects novos (não exigidos pelo escopo)

### Próximo passo

Rodar `/adr-architect` para amendar o ADR endereçando os Gaps #1 e #2 (críticos, bloqueantes) — no mínimo corrigir o arquivo-alvo do UnitOfWork e adicionar `Transaction.restore`/corrigir a hidratação nos dois repositórios de `transaction`. Gaps #3-#6 podem ser aceitos com decisão explícita do usuário registrada no ADR, mas não devem ser resolvidos silenciosamente durante a implementação. Depois de amendado, re-validar com `/adr-validator` antes de `/adr-executor`.

---

## Amendamento — 2026-08-06

Usuário aprovou corrigir todos os 6 gaps listados acima (2 críticos, 4 menores). Todas as seções do corpo do ADR (Contexto, Decisão, Impacto, Checklist de Arquitetura, Plano de Implementação, Edge Cases, Plano de Teste, Consequências, Decisões do Usuário, Referências) foram atualizadas — ver seção "Decisões do Usuário" acima ("Confirmadas após `/adr-validator`") para o mapeamento gap → correção aplicada. O corpo do ADR acima já reflete o estado pós-amendamento; este bloco de Validação (Estágio 2) permanece como registro histórico do que foi encontrado. Próximo passo: re-rodar `/adr-validator` antes de `/adr-executor`.

---

## Re-Validação (Estágio 2, pós-amendamento) — 2026-08-06

**Veredito:** ✅ **APROVA**

Re-derivação independente contra o código real (não confiei no texto do amendamento) — cada correção foi conferida lendo os arquivos que ela afirma alterar/referenciar, não apenas o diff do ADR.

### Re-checagem dos 2 gaps críticos

| Gap original | Verificação feita | Resultado |
|---|---|---|
| #1 — arquivo errado de UoW | Lidos `src/infrastructure/database/database.module.ts:14-15,33-34` (`UnitOfWork` provido via `useClass: PostgresUnitOfWork` importado de `unit-of-work-postgres.service.ts`) e `src/infrastructure/database/unit-of-work.postgres.ts` (existe, mas não é importado por nenhum `Module`/arquivo do projeto — `grep` por `unit-of-work.postgres` só retorna ele mesmo). `docs/architecture/03-estrutura-projeto.md:400` confirma explicitamente que é código morto a remover. O ADR amendado (linhas 227-236, 346-347) agora referencia e edita exclusivamente `unit-of-work-postgres.service.ts` e lista a remoção do arquivo morto no Plano de Implementação item 1 | **Confirmado corrigido** — arquivo-alvo é o certo |
| #2 — `Transaction` sem `restore()` | Lidos `transaction.entity.ts:24-37` (`create` sempre `crypto.randomUUID()`, sem `restore`), `pg-transaction.repository.ts:46-52` e `pg-transaction-read.repository.ts:31-37` (ambos `toDomain` chamam `Transaction.create(...)`, descartando `row.id`) e `transaction.sql.ts:21-24` (`saveTransactionQuery` é upsert `ON CONFLICT (id) DO UPDATE`) — bug real e exatamente como descrito: um ciclo `findById → confirm() → save()` duplicaria a linha. `Transaction.restore(params)` proposto (linhas 136-155) usa exatamente os mesmos 6 campos do construtor privado atual + `asset` (novo nesta ADR), na mesma ordem posicional — construtor compatível, sem ambiguidade. Plano (item 3) troca `toDomain` dos dois repositórios para `Transaction.restore({ id: row.id, ... })`, preservando `row.id` | **Confirmado corrigido** — fecha o bug de duplicação antes de rodar contra banco real |

### Checagem de regressão (a correção não quebrou nada)

- Único outro consumidor de `Transaction.create`/`Transaction.restore` fora dos dois repositórios é `confirm-deposit.usecase.spec.ts` (mock, não usa `restore`) — `grep -rn "Transaction.create\|Transaction.restore" src` confirma que não há terceiro caller a atualizar
- `Repositories` (`src/shared/unit-of-work.ts`) hoje só tem `transactionRepo`/`ledgerRepo`; único consumidor de `UnitOfWork` fora da própria infra é `ConfirmDepositWithUowUseCase` — adicionar `walletRepo` não quebra nenhum outro use case existente (`grep -rln "UnitOfWork" src` confirma a lista fechada de arquivos afetados)
- `saveTransactionQuery` faz `ON CONFLICT (id) DO UPDATE SET status = $5` — com `Transaction.restore` preservando `id`, o upsert agora de fato atualiza a linha em vez de inserir uma segunda; nenhuma mudança de schema necessária para essa correção funcionar
- `InvalidCreditAmountError` segue byte a byte o padrão já usado em `src/modules/identity/domain/errors/*.error.ts` (`readonly code`, `extends DomainError`, mensagem estática/parametrizada no `super()`) — não introduz um padrão novo de erro
- `wallets.id` sem `DEFAULT gen_random_uuid()` fica consistente com `transactions.id`/`ledger_entries.id` na mesma migration; nenhuma das três tabelas depende da extensão `pgcrypto` (diferente de `users`/`sessions`/`login_attempts`, que usam `DEFAULT gen_random_uuid()` e já dependem dela) — não há regressão de extensão de banco
- `pnpm migration:create create_financial_core_tables` — nome passa na validação do script (`/^[a-z0-9_]+$/`, `src/infrastructure/database/scripts/create-migration.script.ts:15`), gera arquivo `<timestamp>_create_financial_core_tables.sql` na convenção existente
- Testes de INV-008/INV-009 adicionados ao Plano de Teste são adicionais ao caminho feliz já previsto — não substituem nem contradizem os testes existentes

### Checklists completos (rerun integral, não só os itens antes marcados GAP)

| Bloco | Resultado | Evidência |
|---|---|---|
| A. Regra de Dependência | OK | `Wallet`, `WalletRepository`, `WalletReadRepository` propostos como domínio puro; `grep -r "from '.*application\|infrastructure\|presentation'" src/modules/financial/domain/` hoje não retorna nada, e o plano não introduz import nesse sentido |
| B. DDD — aggregate/VO/eventos | OK / N/A | `Wallet` como aggregate root único por `(user_id, asset)` é adequado ao escopo; ausência de VO/eventos justificada e consistente com `Transaction`/`LedgerEntry` já existentes |
| B. DDD — erros tipados | **OK (corrigido)** | `Wallet.creditAvailable` agora lança `InvalidCreditAmountError extends DomainError` (confirmado no padrão de `identity/domain/errors`) |
| C. Precisão monetária | OK | `BIGINT`/`bigint` consistentes em `wallets`/`Wallet`, sufixo `_satoshi`, conversão só na borda DTO (`BalanceDto`) e repositório (`toString()`/`BigInt()`), mesmo padrão de `pg-transaction.repository.ts`/`pg-ledger-entry.repository.ts` |
| D. Atomicidade (UnitOfWork) | **OK (corrigido)** | Arquivo-alvo confirmado (`unit-of-work-postgres.service.ts`); `walletRepo` passa a existir no `Repositories` real entregue a `ConfirmDepositWithUowUseCase`; achar-ou-criar wallet dentro do mesmo `uow.run`; `UNIQUE (user_id, asset)` como rede de segurança para corrida |
| E. Schema de banco | **OK (corrigido)** | `id` sem `DEFAULT` consistente nas 3 tabelas novas; FKs corretas (`transactions.account_id → users.id`, `ledger_entries.transaction_id → transactions.id`, `wallets.user_id → users.id`); índices em `account_id`, `transaction_id`, `account`, `user_id`; `UNIQUE (user_id, asset)` |
| F. Edge cases e erros | **OK (corrigido)** | Bug de hidratação de `Transaction` endereçado via `restore()`; wallet inexistente tratado (achar-ou-criar); concorrência tratada via `UNIQUE` + abort de transação; valor `<=0` em `creditAvailable` tratado com erro tipado |
| G. Plano de teste | **OK (corrigido)** | Cobre unit (`Wallet`, `Transaction.restore`, `ConfirmDepositWithUowUseCase`, `GetBalancesUseCase`) e integração com banco real (upsert idempotente, trigger INV-014, CHECK INV-001/002, `UNIQUE`, INV-008/INV-009, rollback de UoW, ciclo `findById→confirm→save` sem duplicar linha) |
| H. Plano de implementação | OK | Ordem correta: infra compartilhada (migration + UoW) → domínio → infra do módulo → aplicação → presentation; cada passo é atômico e verificável isoladamente |

### Cobertura

- **OK:** todos os 8 blocos do checklist, incluindo os 6 que antes tinham gap
- **GAP:** nenhum
- **N/A:** Domain Events (projeto não tem event bus, dívida já registrada em ADR 0004); Value Objects novos (não exigidos pelo escopo atual)

### Próximo passo

ADR pronto para implementação. Rodar `/adr-executor`.

---

## Re-Validação Independente (Estágio 2, rodada 3) — 2026-08-06

**Veredito:** 🔁 **REVISAR**

Rodada solicitada explicitamente pelo usuário, tratada como escrutínio adicional antes da aprovação definitiva — não como sinal de suspeita sobre as 2 rodadas anteriores. Reli o ADR do zero (incluindo as seções de Validação/Re-Validação/Amendamento já registradas) e re-verifiquei cada afirmação contra o código real, sem assumir os vereditos anteriores como corretos. As duas rodadas anteriores continuam corretas em tudo que verificaram — mas encontraram 2 gaps novos, não cobertos antes, ambos críticos.

### Reconfirmação do que as rodadas 1-2 já validaram (sem regressão)

Reli e re-testei contra o código real, não apenas contra o texto do ADR:

- `src/infrastructure/database/database.module.ts:15,33-34` — `UnitOfWork` provido via `useClass: PostgresUnitOfWork` de `unit-of-work-postgres.service.ts`; `src/infrastructure/database/unit-of-work-postgres.service.ts:1-22` já tem exatamente a forma que o Plano de Implementação item 1 propõe editar (só falta `walletRepo`). Arquivo morto `unit-of-work.postgres.ts` confirmado sem nenhum import em `src/` (`grep -rn "unit-of-work.postgres" src/` só retorna arquivos com o nome `unit-of-work-postgres`, nunca o morto). **OK, sem regressão.**
- `src/modules/financial/infrastructure/persistence/pg-transaction.repository.ts:46-52` e `pg-transaction-read.repository.ts:31-38` — confirmado: `toDomain` ainda chama `Transaction.create(...)`, descartando `row.id`; `transaction.sql.ts:24` (`ON CONFLICT (id) DO UPDATE SET status = $5`) confirma que o upsert depende do `id` preservado. Bug real, `Transaction.restore` proposto pelo ADR é a correção certa. **OK, sem regressão.**
- `src/modules/identity/presentation/identity.controller.ts:281,299,303,311,317,343-344` — uso real de `@UseGuards(SessionAuthGuard)` + `req.user.userId` confirmado, mesmo padrão que o ADR propõe para `GET /financial/balances`. **Padrão de guard correto — mas ver Gap #2 abaixo: o padrão está certo, a fiação de DI entre módulos não foi endereçada.**
- `src/modules/financial/domain/repositories/transaction.repository.ts:3-6` e `pg-ledger-entry.repository.ts` — nomenclatura `XRepository`/`PgXRepository extends XRepository`, sem prefixo `I`, confirmada; `financial.module.ts` injeta `DatabaseService`/`ReadQueryExecutor` (que por sua vez encapsulam `WRITE_POOL_TOKEN`/`READ_POOL_TOKEN` em `database.module.ts:24-31`) — mesmo padrão que `WalletRepository`/`WalletReadRepository` seguiriam. **OK, sem regressão.**
- `src/infrastructure/database/scripts/run-migration.script.ts:47-63` — cada migration roda como uma única string passada a `client.query(sql)` dentro de `BEGIN`/`COMMIT` manual; o protocolo "simple query" do `pg` executa múltiplos statements (incluindo `CREATE FUNCTION ... $$ ... $$ LANGUAGE plpgsql` seguido de `CREATE TRIGGER`) na mesma chamada, igual a rodar o arquivo via `psql`. DDL é transacional no Postgres, então `BEGIN` envolvendo `CREATE TABLE`/`CREATE FUNCTION`/`CREATE TRIGGER` funciona sem ressalvas. Sintaxe do trigger (`BEFORE UPDATE OR DELETE ... FOR EACH ROW EXECUTE FUNCTION forbid_ledger_entries_mutation()`, função `RETURNS TRIGGER` que sempre `RAISE EXCEPTION`) está correta e cobre `UPDATE` e `DELETE`. **OK — item (a) e (b) do pedido do usuário, confirmados corretos.**
- `src/shared/domain.error.ts` e `src/modules/identity/domain/errors/*.error.ts` — `InvalidCreditAmountError` proposto segue exatamente o padrão (`readonly code`, `extends DomainError`, mensagem no `super()`). **OK, sem regressão.**

### Gaps novos (não cobertos pelas rodadas 1 e 2)

| # | Severidade | Gap | Evidência | Correção exigida |
|---|-----------|-----|-----------|-------------------|
| 1 | **CRÍTICO** | **Race condition real em crédito concorrente de wallet — não apenas no find-or-create, mas em qualquer crédito concorrente ao mesmo `(user_id, asset)`.** `PgWalletRepository.save` é descrito (Decisão item 4, linha 223) como `INSERT ... ON CONFLICT (user_id, asset) DO UPDATE SET available_satoshi = $x, locked_satoshi = $y` — ou seja, grava o **valor absoluto** já somado em memória por `Wallet.creditAvailable` (`wallet.entity.ts`, linhas 179-183: `this._availableSatoshi += amountSatoshi`), não um incremento calculado no banco. `findByUserIdAndAsset` (`findWalletByUserIdAndAssetQuery`) roda sob `BEGIN` simples (`database.service.ts:21`, sem `SELECT ... FOR UPDATE`, isolamento padrão READ COMMITTED). Sequência de corrida com duas confirmações de depósito concorrentes do mesmo `(user, asset)`, wallet já existente com `available=1000`: Tx1 lê `1000`, calcula `1000+100=1100`; Tx2 lê `1000` (antes de Tx1 commitar), calcula `1000+50=1050`; Tx1 faz `UPDATE ... SET available_satoshi=1100` e commita; Tx2 colide em `ON CONFLICT`, **espera o lock, e quando adquire aplica `SET available_satoshi=1050`** (valor pré-calculado, já obsoleto) — **sobrescreve o crédito de Tx1 sem erro nenhum**. Resultado final: `available=1050`, quando deveria ser `1150`. **Isso contradiz diretamente a própria linha 262 do ADR** ("o segundo `INSERT` falha por violação de unicidade... nunca perde saldo silenciosamente") — `ON CONFLICT DO UPDATE` nunca falha por violação de unicidade, é *desenhado* para não falhar; a garantia que o ADR afirma ter simplesmente não existe para esse desenho de upsert. Quebra INV-001/005/008/009 silenciosamente sob concorrência, sem qualquer log/exceção — o pior tipo de bug financeiro (perda de saldo sem rastro) | ADR linhas 179-183 (`Wallet.creditAvailable` soma em memória), 223 (upsert com valor absoluto), 262 (alegação de segurança incorreta); `src/infrastructure/database/database.service.ts:19-24` (`runInTransaction` = `BEGIN` simples, sem `FOR UPDATE`); `docs/bussiness/04-carteiras-e-ledger-financeiro.md` INV-001/005/008/009 | O upsert de crédito precisa ser atômico no banco, não uma sobrescrita de valor pré-computado em memória. Duas opções: **(a)** trocar `SET available_satoshi = $x` por incremento SQL-side, `SET available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi` — exige que `WalletRepository` exponha um método dedicado de crédito (ex.: `creditAvailable(userId, asset, amountSatoshi)`) em vez de `save(wallet)` genérico que persiste um snapshot absoluto; **(b)** manter `save(wallet)` genérico mas fazer `findByUserIdAndAsset` usar `SELECT ... FOR UPDATE` dentro do `uow.run` para serializar leitores concorrentes do mesmo `(user_id, asset)` — nota: **(b)** sozinho não cobre o caso em que a wallet ainda não existe (duas transações concorrentes que fazem `Wallet.create()` porque nenhuma encontrou linha ainda colidem do mesmo jeito no `INSERT`/`ON CONFLICT`), então **(a)** é a correção estruturalmente correta para o caminho de crédito |
| 2 | **CRÍTICO** | **`SessionAuthGuard` não é resolvível pelo DI do `FinancialModule` como o ADR propõe.** O Plano (item 5, seção Presentation) instrui `GET /financial/balances` a usar `@UseGuards(SessionAuthGuard)`, mas `SessionAuthGuard` (`src/modules/identity/presentation/guards/session-auth.guard.ts:22-23`) depende de `ValidateSession` no construtor, e ambos são providers registrados **apenas** dentro de `IdentityModule` (`identity.module.ts:110-114,133`). `IdentityModule` **não tem `exports:`** (nenhuma chave `exports` no `@Module(...)`, confirmado lendo o arquivo inteiro) — nada é exposto para outros módulos. `FinancialModule` (`financial.module.ts:1-58`) **não importa `IdentityModule`** e `AppModule` (`app.module.ts:9-14`) registra os dois módulos lado a lado, sem relação de import entre eles. Nenhum `APP_GUARD` global registra `SessionAuthGuard` (`main.ts` não tem `useGlobalGuards`/`APP_GUARD`). Se implementado como o ADR descreve, o Nest lança `UnknownElementException`/erro de resolução de dependência no bootstrap da aplicação assim que `FinancialController` tentar usar `SessionAuthGuard` — o endpoint nunca sobe | `src/modules/identity/identity.module.ts:31-136` (sem `exports`); `src/modules/identity/presentation/guards/session-auth.guard.ts:21-23` (`constructor(private readonly validateSession: ValidateSession)`); `src/modules/financial/financial.module.ts` (sem `imports: [IdentityModule]`); `src/app.module.ts:9-14` (módulos irmãos, não aninhados); ADR linha 284 (`@UseGuards(SessionAuthGuard)`) | Adicionar ao Plano de Implementação: `IdentityModule` precisa exportar `SessionAuthGuard` (`exports: [SessionAuthGuard]`, e transitivamente o Nest resolve `ValidateSession` internamente pois ele já é provider do próprio módulo que declara o guard) e `FinancialModule` precisa `imports: [IdentityModule]`. Alternativa mais barata a médio prazo (fora do escopo mínimo desta ADR, mas vale registrar como nota): mover `SessionAuthGuard`/`AuthenticatedRequest` para `shared/` se mais módulos de negócio forem precisar dele — hoje `financial` seria o primeiro consumidor cross-module, então a correção mínima (export + import) resolve sem redesenho |

### Nota — não-bloqueante (severidade baixa, registrar mas não travar aprovação)

- **Conversão bigint→string na borda do `GET /financial/balances`:** o ADR mostra `GetBalancesUseCase.execute` retornando campos `bigint` (`available: w.availableSatoshi`, etc.) e `BalanceDto` com campos `string`, mas a Decisão (item 7) não mostra explicitamente o código do controller fazendo o mapeamento `bigint.toString()` — só a frase "conversão acontece na borda controller/DTO" (linha 300). Diferente do caminho de escrita, onde `pg-transaction.repository.ts:39`/`pg-ledger-entry.repository.ts:27` já mostram `.toString()` em código real hoje. Na prática isso não é bloqueante: se o controller tentar retornar `BalanceResult[]` (bigint) diretamente tipado como `BalanceDto[]` (string), o TypeScript recusa compilar — o compilador força o desenvolvedor a escrever a conversão. Registrar como lembrete de implementação, não como gap.

### Cobertura

- **OK (reconfirmado nesta rodada, sem regressão):** arquivo-alvo do `UnitOfWork`, `Transaction.restore`, sintaxe da migration (incluindo trigger PL/pgSQL cobrindo UPDATE e DELETE), nomenclatura `XRepository`/`XReadRepository` e uso de `DatabaseService`/`ReadQueryExecutor` (que encapsulam `WRITE_POOL_TOKEN`/`READ_POOL_TOKEN`), erros tipados (`InvalidCreditAmountError`), uso de `SessionAuthGuard`/`req.user.userId` como *padrão* de código (idêntico ao usado em `identity.controller.ts`)
- **GAP CRÍTICO (novo):** race condition de saldo sob crédito concorrente (upsert de valor absoluto em vez de incremento atômico) — quebra INV-001/005/008/009 silenciosamente; fiação de DI do `SessionAuthGuard` entre módulos (`IdentityModule` não exporta, `FinancialModule` não importa) — endpoint não sobe como especificado
- **BAIXO (não-bloqueante):** explicitar a conversão bigint→string no controller do `GET /financial/balances` no Plano de Implementação (autoprotegido por TypeScript, mas vale documentar)
- **N/A:** Domain Events, Value Objects novos (mesma justificativa das rodadas anteriores, ainda válida)

### Próximo passo

Rodar `/adr-architect` para amendar o ADR endereçando os Gaps #1 e #2 (críticos, bloqueantes):
1. Redesenhar o caminho de crédito de `wallets` para incremento atômico no banco (SQL-side), não sobrescrita de valor pré-computado em memória — e explicitar isso no teste de integração de concorrência (duas confirmações de depósito simultâneas do mesmo `(user, asset)`, ambas devem refletir no saldo final, nenhuma pode se perder).
2. Adicionar `exports: [SessionAuthGuard]` a `IdentityModule` e `imports: [IdentityModule]` a `FinancialModule` no Plano de Implementação.

Depois de amendado, re-validar com `/adr-validator` antes de `/adr-executor`. Esta rodada diverge do veredito da rodada 2 (que era APROVA) porque investigou dois ângulos que a rodada 2 não cobriu com profundidade suficiente: concorrência real no upsert de `wallets` (a rodada 2 aceitou a alegação textual do ADR sobre a `UNIQUE constraint` sem simular a semântica de `ON CONFLICT DO UPDATE`) e resolução de DI do guard entre módulos (a rodada 2 verificou que o *padrão de uso* do guard era idêntico ao de `identity.controller.ts`, mas não verificou que esse padrão só funciona dentro do próprio módulo que declara o guard).

---

## Amendamento — Rodada 3 (2026-08-06)

Usuário aprovou corrigir os 2 gaps críticos listados acima. Todas as seções do corpo do ADR foram atualizadas (Decisão itens 3/4/5/7, Rationale, Impacto nos Bounded Contexts, Checklist de Arquitetura, Plano de Implementação itens 2/3/4/5, Edge Cases & Erros de Domínio, Plano de Teste, Fluxos, Consequências, Decisões do Usuário) — ver "Decisões do Usuário" acima ("Confirmadas após `/adr-validator` (Re-Validação Independente, rodada 3...)") para o mapeamento gap → correção aplicada. O corpo do ADR já reflete o estado pós-amendamento; os três blocos de Validação/Re-Validação acima (rodada 1, rodada 2, rodada 3) permanecem como registro histórico do que cada rodada encontrou e verificou — nenhum foi editado retroativamente.

### Resumo do que mudou nesta rodada

1. **Gap #1 — crédito de wallet deixa de ser "ler em memória, somar, sobrescrever valor absoluto" e passa a ser incremento atômico SQL-side.**
   - `WalletRepository` perde `save(wallet): Promise<void>`, ganha `creditAvailable(params: { userId, asset, amountSatoshi }): Promise<Wallet>`.
   - `wallet.sql.ts` troca `upsertWalletQuery` (`SET available_satoshi = $x`) por `CREDIT_WALLET_AVAILABLE_QUERY` (`SET available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi ... RETURNING *`).
   - `Wallet` ganha `assertValidCreditAmount` estático (extraído do corpo de `creditAvailable` de instância) para validar o valor antes de acionar o repositório, sem precisar de uma instância em memória.
   - `ConfirmDepositWithUowUseCase` troca `findByUserIdAndAsset → Wallet.create ?? → creditAvailable → save` (4 passos, com race condition) por `Wallet.assertValidCreditAmount(amount)` seguido de uma única chamada a `walletRepo.creditAvailable(...)`.
   - Plano de Teste ganha um caso de integração dedicado a concorrência real (`Promise.all` de duas `creditAvailable` no mesmo `(user_id, asset)`, verificando que o saldo final é a soma exata, não o valor de uma sobrescrevendo a outra).

2. **Gap #2 — `SessionAuthGuard` passa a ser resolvível pelo DI do `FinancialModule`.**
   - `IdentityModule` ganha `exports: [SessionAuthGuard]`.
   - `FinancialModule` ganha `imports: [IdentityModule]`.
   - Confirmado no código atual que nenhum outro módulo do projeto ainda importa `IdentityModule` — `financial` é o primeiro consumidor cross-module do guard; não havia precedente a seguir, a correção segue o padrão de export/import mínimo do próprio NestJS.
   - Plano de Teste ganha um caso de bootstrap (`Test.createTestingModule(...).compile()` ou equivalente) que falha sem a correção e passa com ela — regressão direta do gap.

### Coerência geral pós-3-rodadas de amendamento

Reli o ADR do início ao fim após aplicar as duas correções desta rodada, checando que nenhuma seção ficou contradizendo outra:

- **Contexto:** os 5 achados de código originais (migrations ausentes, `Transaction` sem `asset`, controller sem UoW, arquivo morto de UoW, `Transaction` sem `restore`) continuam válidos e não são afetados pelos gaps desta rodada — são achados ortogonais.
- **Forças em Jogo:** já listava INV-001/005/007/014 e Atomicidade como forças relevantes; nenhuma força nova precisou ser adicionada — os dois gaps desta rodada são violações dessas mesmas forças já reconhecidas, não forças não mapeadas.
- **Decisão:** itens 3 (`Wallet`), 4 (`WalletRepository`), 5 (use case) e 7 (controller) atualizados de forma consistente entre si — a assinatura de `WalletRepository.creditAvailable` proposta no item 4 é exatamente a que o item 5 chama; o guard exportado no item 7 é exatamente o que o Plano de Implementação item 5 instrui exportar/importar.
- **Impacto nos Bounded Contexts:** a linha `identity` deixou de dizer "nenhuma mudança de código" (afirmação que a rodada 3 provou falsa) e passou a registrar o `exports` novo; a linha `financial` registra a troca de `save` por `creditAvailable` e o novo `imports: [IdentityModule]`.
- **Checklist de Arquitetura:** os itens de Atomicidade/UnitOfWork e Repositório foram atualizados para refletir que `creditAvailable` retorna `Wallet` (exceção documentada e justificada à convenção "save retorna void" do `CLAUDE.md`, porque o valor pós-incremento só existe depois do `RETURNING` do banco) — não é uma violação silenciosa da convenção, é uma exceção nomeada e explicada.
- **Plano de Implementação, Edge Cases, Plano de Teste, Fluxos, Consequências, Decisões do Usuário:** todos atualizados em conjunto, com referências cruzadas explícitas a "rodada 3, Gap #1"/"Gap #2" para rastreabilidade — qualquer leitor consegue seguir de um gap na Validação até a exata linha do corpo do ADR que o corrige.
- Nenhuma seção do ADR ainda afirma que `UNIQUE (user_id, asset)` impede lost update por si só — essa alegação (que era a raiz do Gap #1) foi removida de todos os lugares em que aparecia (Decisão item 5 antiga, Edge Cases), substituída pela explicação correta do incremento SQL-side.

### Próximo passo

Rodar `/adr-validator` novamente antes de `/adr-executor`, para confirmar de forma independente que as correções desta rodada 3 fecham os 2 gaps sem introduzir regressão nos pontos já validados nas rodadas 1 e 2.

---

## Re-Validação Independente (Estágio 2, rodada 4) — 2026-08-06

**Veredito:** ✅ **APROVA**

Rodada solicitada explicitamente pelo usuário, com a mesma postura cética da rodada 3 — releitura do ADR do zero, sem herdar nenhuma conclusão das rodadas 1-3, incluindo os pontos que elas já deram como corretos. Todo o código citado abaixo foi lido diretamente no estado atual do repositório (o bounded context `financial` ainda não tem `Wallet`/`WalletRepository`/migration — o ADR segue no estágio "Proposto", pré-implementação; o que existe hoje no código é exatamente o "estado anterior" que o ADR descreve corrigir).

### Reconfirmação do que as rodadas 1-3 já validaram (sem regressão)

- `src/infrastructure/database/unit-of-work-postgres.service.ts:1-22` — arquivo real registrado em `database.module.ts:15,33` (`useClass: PostgresUnitOfWork`); `unit-of-work.postgres.ts` confirmado sem nenhuma referência em `src/` fora de si mesmo. **OK.**
- `src/modules/financial/infrastructure/persistence/pg-transaction.repository.ts:46-51` e `pg-transaction-read.repository.ts:31-36` — `toDomain` ainda chama `Transaction.create(...)`, descartando `row.id`; `transaction.sql.ts:22-24` (`ON CONFLICT (id) DO UPDATE SET status = $5`) confirma o bug de duplicação que `Transaction.restore` corrige. **OK.**
- `src/modules/identity/identity.module.ts:31-136` — hoje **sem `exports:`**; `src/modules/financial/financial.module.ts:1-58` **sem `imports: [IdentityModule]`**; `src/app.module.ts:9-14` regista os dois como módulos irmãos. A correção proposta (linhas 348-367 do ADR) resolve exatamente essa lacuna. Verifiquei também o sentido inverso: `identity.module.ts` não importa nada de `financial/` — **sem risco de dependência circular** entre os dois módulos.
- `src/modules/identity/presentation/guards/session-auth.guard.ts:22-56` — `SessionAuthGuard` só checa CSRF para `MUTATING_METHODS` (`POST/PUT/PATCH/DELETE`); `GET /financial/balances` é `GET`, então o guard aplica apenas a validação de cookie de sessão, igual ao padrão de `GET /me` em `identity.controller.ts:317-344`. **OK, consistente.**

### Verificação específica do amendamento da rodada 3 (pontos (a)-(e) pedidos)

**(a) Sintaxe da `CREDIT_WALLET_AVAILABLE_QUERY` e CHECK constraints.** `INSERT ... ON CONFLICT (user_id, asset) DO UPDATE SET available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi, updated_at = NOW() RETURNING *` (ADR linhas 245-252) é sintaxe Postgres válida: referenciar `nome_da_tabela.coluna` dentro da cláusula `SET` de um `DO UPDATE` é o idioma padrão documentado do Postgres para upsert incremental, e `ON CONFLICT (user_id, asset)` casa corretamente com a constraint de tabela `UNIQUE (user_id, asset)` (linha 106) mesmo sem nome explícito — Postgres infere o alvo do conflito pelo conjunto de colunas, não pelo nome da constraint. Testei mentalmente a semântica de concorrência sob `READ COMMITTED` (isolamento padrão do driver `pg`, confirmado em `database.service.ts:19-24`, que só faz `BEGIN`/`COMMIT` simples): duas transações que colidem em `INSERT ... ON CONFLICT DO UPDATE` sob a mesma linha **serializam via lock de linha** — a segunda espera o commit da primeira e então aplica o `SET` sobre o valor **já commitado**, não sobre um valor lido antes de ambas. Esse é o comportamento documentado do Postgres para exatamente esse padrão (é o mecanismo que substitui `SELECT ... FOR UPDATE` para upsert). Confirma a correção do Gap #1 da rodada 3. Quanto ao `CHECK (available_satoshi >= 0)` (linha 102): como `creditAvailable` só é chamado com `amountSatoshi > 0` (validado por `Wallet.assertValidCreditAmount` antes da chamada, e o próprio `transactions.amount_satoshi CHECK > 0` já garante isso na origem), o incremento nunca pode produzir um valor negativo — a constraint nunca é violada nesse caminho, então não há necessidade de tratamento de erro específico para essa combinação. **Não é gap: o ADR não precisa de handler dedicado porque o caminho que violaria a constraint é estruturalmente inalcançável no fluxo desenhado.**
**(b) `Wallet.assertValidCreditAmount` estático — a entidade ainda é um agregado com sentido?** Sim, com uma ressalva já documentada pelo próprio ADR (nota da linha 194): `creditAvailable` de instância (soma em memória) fica **inalcançável no caminho de produção** — só é exercitado por teste unitário puro. O invariante de negócio ("crédito não-positivo é rejeitado") continua sendo *definido* pela entidade `Wallet` (não pelo use case ou pelo repositório), só que sua *invocação* no fluxo real passa a ser estática, antes de acionar o repositório, em vez de via mutação de uma instância hidratada. Isso é uma tensão real com o princípio "invariante protegido pelo próprio agregado através de uma instância", mas o ADR já reconhece essa tensão explicitamente e a justifica (o cálculo final é feito pelo Postgres, não pelo TypeScript, então não há instância útil para mutar no caminho de escrita). Registro como observação de severidade **BAIXA/MÉDIA**, não bloqueante — já está documentado no próprio ADR, não é uma lacuna nova.
**(c) `creditAvailable` retorna `Promise<Wallet>` via `restore()` ou `create()`?** ADR linha 269 mostra explicitamente `Wallet.restore({ /* mapeia row[0], ... */ })` — **não** `Wallet.create(...)`. Isso evita exatamente o bug que existia em `Transaction` (regenerar `id`): como o `RETURNING *` da query devolve o `id` real da linha (seja o `candidateId` recém-gerado no caminho de `INSERT`, seja o `id` pré-existente preservado no caminho de `DO UPDATE`, já que a cláusula `SET` não toca a coluna `id`), `Wallet.restore` preserva esse `id` fielmente. **Confirmado correto, sem o bug que a rodada 1 encontrou em `Transaction`.**
**(d) Sintaxe `exports`/`imports` e dependência circular.** `exports: [SessionAuthGuard]` em `identity.module.ts` (ADR linha 352) e `imports: [IdentityModule]` em `financial.module.ts` (ADR linha 362) são sintaxe padrão do `@Module()` do NestJS — sem erros de forma. Busquei no código atual (`identity.module.ts`, `identity.controller.ts`, `sessions.controller.ts`, e todo `src/modules/identity/`) por qualquer import de `@/modules/financial/*`: nenhum resultado. **Sem dependência circular** — o acoplamento é estritamente unidirecional (`financial` → `identity`).
**(e) O teste de concorrência descrito realmente prova a correção?** O Plano de Teste (linha 490) especifica `Promise.all`, "cada uma em sua própria conexão/transação", contra o **mesmo** `(user_id, asset)`, valores conhecidos, e asserta a soma exata via `SELECT` após ambas resolverem. Verifiquei a mecânica de concorrência real disponível: `DatabaseService.query()` (`database.service.ts:13-17`) delega a `pool.query()` do driver `pg`, que adquire uma conexão livre do pool a cada chamada — logo, duas chamadas de `creditAvailable` disparadas via `Promise.all` (sem `await` sequencial entre elas) de fato competem por conexões distintas do pool e executam a instrução `INSERT ... ON CONFLICT` concorrentemente no servidor Postgres, não apenas na aparência do código JS. Mesmo sem um `BEGIN`/`COMMIT` explícito por chamada (cada `creditAvailable` é uma única instrução autocommit), o lock de linha do Postgres durante a execução da própria instrução já é suficiente para serializar as duas — o teste como descrito exercita a race condition real e provaria sua ausência (ou presença) de forma confiável. **Não é um teste "sequencial disfarçado" — é concorrência real ao nível do servidor.**

### Gaps novos encontrados nesta rodada

Nenhum gap crítico ou alto novo. Duas observações de severidade baixa/média, ambas já qualificadas como não-bloqueantes:

| # | Severidade | Observação | Evidência | Ação sugerida |
|---|-----------|-------------|-----------|----------------|
| 1 | BAIXA | `Wallet.assertValidCreditAmount(transaction.amountSatoshi)` no use case (Decisão item 5, linha 304) é, na prática, uma validação redundante hoje: `transaction.amountSatoshi` já é garantidamente `> 0` antes de chegar ali, pela combinação do `CHECK (amount_satoshi > 0)` em `transactions` (linha 66) e por `LedgerEntry.create` já ter lançado antes se fosse `<= 0` (`ledger-entry.entity.ts:17-19`, que roda antes na mesma função). Não é um bug — é defesa em profundidade intencional — mas vale deixar registrado que hoje esse `assertValidCreditAmount` nunca dispara em produção pelo caminho de depósito. | ADR linha 304; `src/modules/financial/domain/entities/ledger-entry.entity.ts:17-19`; migration linha 66 | Nenhuma correção obrigatória — apenas nota de entendimento, não altera o Plano |
| 2 | BAIXA | `POST /financial/deposit/confirm` continua sem qualquer guard de sessão/KYC (nem hoje, nem depois do ADR) — só `GET /financial/balances` ganha `SessionAuthGuard`. `docs/bussiness/09-depositos-e-saques.md:33-59` sugere que a confirmação de depósito nasce de um fluxo de monitoramento/blockchain (não de uma chamada de usuário via sessão), o que tornaria a ausência de guard intencional — mas o ADR não declara essa premissa explicitamente em nenhuma seção. Não é uma regressão introduzida por este ADR (o endpoint já não tinha guard antes), mas como o ADR mexe justamente nesse controller (troca de use case, adiciona `imports: [IdentityModule]`), seria o momento natural de registrar a decisão em vez de deixá-la implícita. | `src/modules/financial/presentation/financial.controller.ts:14-19` (sem `@UseGuards` em nenhum lugar do arquivo); `docs/bussiness/09-depositos-e-saques.md:33-59` | Não bloqueante — sugerido registrar uma frase nas "Decisões do Usuário" ou "Consequências" confirmando que a ausência de guard em `POST /financial/deposit/confirm` é intencional (endpoint interno/de sistema), não uma omissão |

### Cobertura

- **OK (reconfirmado nesta rodada 4, sem regressão):** arquivo-alvo do `UnitOfWork`; `Transaction.restore`; sintaxe e semântica de concorrência de `CREDIT_WALLET_AVAILABLE_QUERY`; `Wallet.restore` (não `create`) preservando `id` do `RETURNING *`; `exports`/`imports` entre `IdentityModule`/`FinancialModule` sem dependência circular; validade do teste de concorrência com `Promise.all`; nomenclatura `XRepository`/`XReadRepository`; erros tipados; migration/trigger PL/pgSQL; padrão de guard idêntico ao já usado em `identity.controller.ts`
- **BAIXO (não-bloqueante, novo nesta rodada):** redundância documentável de `assertValidCreditAmount` no caminho de depósito; ausência de guard em `POST /financial/deposit/confirm` não declarada como decisão explícita
- **N/A:** Domain Events, Value Objects novos, catálogo de ativos (mesma justificativa das rodadas anteriores — catálogo de ativos não existe no código hoje em nenhum módulo, dívida pré-existente e não agravada por este ADR)

### Próximo passo

ADR pronto para implementação. Rodar `/adr-executor`. As duas observações de severidade baixa acima podem ser endereçadas como pequenos ajustes de texto durante a execução (não exigem nova rodada de `/adr-validator`), a critério do usuário.
