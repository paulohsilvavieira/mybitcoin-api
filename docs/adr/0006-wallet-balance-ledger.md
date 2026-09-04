# ADR 0006 — Aggregate Wallet / Balance / Ledger

**Status:** Aceito <!-- Rascunho | Proposto | Aceito | Em Progresso | Implementado | Substituído -->
**Data:** 2026-08-28 (amendado 2026-08-29 — gaps #1–#8 da Validação Estágio 2; aprovado 2026-08-29)
**Autores:** Time de Backend
**Contexto relacionado:** ADR 0001 (UnitOfWork), ADR 0003 (réplica de leitura), ADR 0004 (transporte de sessão / DomainErrorFilter)
**Gerado por:** skill `/adr-architect`

---

## Contexto

O núcleo financeiro da exchange ainda não existe de forma funcional. O módulo `src/modules/financial/`
foi criado no ADR 0001 apenas para demonstrar o padrão `UnitOfWork`: tem as entidades `Transaction` e
`LedgerEntry`, um `ConfirmDepositUseCase` e um endpoint `POST /financial/deposit/confirm`, mas **nenhuma
migration cria as tabelas `transactions`/`ledger_entries`** — o código nunca rodou contra banco. Não há
`Wallet`, não há `Balance`, não há catálogo de ativos, não há as primitivas de movimentação de saldo.

Todos os contextos futuros (Depósitos, Saques, Ordens, Trades, Matching) dependem de um aggregate de
carteira sólido: um lugar único onde saldo se move, sempre com lastro contábil de dupla entrada e sempre
preservando os invariantes financeiros INV-001 a INV-014 (`docs/bussiness/04-carteiras-e-ledger-financeiro.md`)
e os invariantes globais 1, 3, 4, 5, 12, 13, 17, 20 (`docs/bussiness/11-invariantes-globais.md`).

Os documentos de domínio se contradizem em pontos estruturais (cardinalidade da carteira, desenho do
ledger, tipo monetário). Este ADR resolve essas contradições com decisões explícitas do usuário
(seção "Decisões do Usuário") e entrega o aggregate completo: schema, entidades, primitivas de escrita,
consultas de leitura, e a reescrita do `ConfirmDeposit` sobre a nova base.

**Bounded context afetado:** `financial` (renomeado/reorganizado como `wallets`). Cria fronteira de
consumo para `identity` (nenhuma dependência de código — ver abaixo).

---

## Forças em Jogo

- **Fonte única da verdade financeira é o ledger.** Saldo é projeção derivada; nunca um número solto.
  (`docs/architecture/02-...md`: "Saldo — calculado via LedgerEntry — nunca campo balance".)
- **Dupla entrada obrigatória.** Toda transação: `Σ débitos = Σ créditos` (INV-007, global 20).
- **Imutabilidade do ledger.** `ledger_entries` nunca sofre UPDATE/DELETE (INV-014, global 12).
- **Atomicidade.** Mover saldo toca ≥ 2 tabelas (`ledger_entries` + `balances` + `transactions`) →
  `UnitOfWork` obrigatório (ADR 0001).
- **Multi-ativo.** Ativos são BRL, USDT, BTC, ETH, SOL — "satoshi" não generaliza. Precisão inteira
  por ativo, sem float, sem `number`, sem `BigNumber`.
- **Performance de leitura.** Tela de carteira consulta saldo e histórico com frequência → réplica de
  leitura (ADR 0003), projeção materializada de saldo para não fazer `SUM` a cada request.
- **Idempotência.** Reprocessamento de eventos e retries de rede não podem duplicar crédito
  (global 2, 19).
- **Separação mecanismo × política.** As primitivas de saldo são mecanismo interno; KYC, limites e
  autorização são política dos casos de uso de negócio que as invocam.

---

## Decisão

### 1. Modelo do aggregate

- **`Wallet` 1 : 1 `User`.** Um usuário tem exatamente uma carteira. `Wallet` é aggregate root.
- **`Balance` — um registro por ativo dentro da `Wallet`.** `Balance` é entidade filha do aggregate
  `Wallet`; nunca acessada fora dele. Campos `available_minor` e `locked_minor` (`bigint`).
- **`Transaction` é aggregate root** do lado contábil. **`LedgerEntry` é entidade filha de `Transaction`** —
  criada apenas pelo processo de registrar uma transação, nunca isoladamente.
- **`Asset`** — catálogo de ativos suportados, com a escala (casas decimais) de cada um.

`Balance` **não é fonte da verdade** — é projeção materializada, atualizada na **mesma transação**
(`UnitOfWork`) que grava os `ledger_entries`. A reconciliação (fora do escopo deste ADR) valida
`balance == Σ ledger_entries` por conta.

### 2. Desenho do ledger: perna-por-linha com contas em string

Cada `ledger_entry` representa **uma perna** (um `debit` OU um `credit`) sobre uma **conta identificada
por string**. Uma `transaction` agrupa as pernas de uma operação e é balanceada
(`Σ débitos = Σ créditos`).

**Contas de usuário** (entram na projeção `balances`, sujeitas a não-negatividade):

```
USER_AVAILABLE:{userId}:{asset}
USER_LOCKED:{userId}:{asset}
```

**Contas operacionais** (só aparecem no ledger; **sem linha em `balances`**, **sem trava de
não-negativo** — a tesouraria fica "negativa" por construção, pois é a origem do dinheiro no depósito):

```
EXCHANGE:TREASURY:{asset}
EXCHANGE:FEES:{asset}
SETTLEMENT:{asset}
```

`entry_type` na linha é sempre `debit` | `credit`. Os conceitos `LOCK`/`UNLOCK` do doc 03 são
representados como **transferência entre `USER_AVAILABLE` e `USER_LOCKED`** — não como um novo
`entry_type` — para manter a dupla entrada uniforme (ver Rationale).

### 3. Representação monetária: `bigint` em menor-unidade + catálogo `assets`

- Toda coluna monetária é `BIGINT` no banco e `bigint` no TypeScript, na **menor unidade do ativo**.
- A escala vem de `assets.scale`: `BRL` → `2`, `BTC` → `8`. (`ETH`/`USDT`/`SOL` entram quando forem
  semeados; ETH usará escala reduzida, ex. `9`, não `18`, para caber em `BIGINT` — decisão de ADR
  futuro ao semear.)
- **Nomenclatura:** sufixo de coluna passa a ser `_minor` (ex. `amount_minor`, `available_minor`),
  não `_satoshi`. Isto **relaxa a regra literal do `CLAUDE.md`** ("campos SQL devem ter sufixo
  `_satoshi`") — ver seção "Consequências". O `CLAUDE.md` deve ser atualizado junto com este ADR.
- Value Object `Money` (substitui a ideia de `Satoshi`): `{ assetSymbol: string, scale: number,
  amountMinor: bigint }`. Aritmética só entre `Money` do mesmo ativo. Conversão para string decimal
  humana acontece **só na camada de apresentação**.

### 4. Primitivas de movimentação (casos de uso de aplicação)

Cada primitiva executa **1 `transaction` + exatamente 2 `ledger_entries` balanceados +
atualização de `balances`** dentro de um único `uow.run(...)`.

| Primitiva | Perna débito | Perna crédito | Efeito na projeção |
|-----------|--------------|---------------|--------------------|
| `credit(walletId, asset, amount, ref, counter=EXCHANGE:TREASURY)` | `counter:{asset}` | `USER_AVAILABLE:{u}:{asset}` | `available += amount` |
| `debit(walletId, asset, amount, ref, counter=SETTLEMENT)` | `USER_AVAILABLE:{u}:{asset}` | `counter:{asset}` | `available -= amount` (exige `available >= amount`) |
| `lock(walletId, asset, amount, ref)` | `USER_AVAILABLE:{u}:{asset}` | `USER_LOCKED:{u}:{asset}` | `available -= amount; locked += amount` (exige `available >= amount`) |
| `unlock(walletId, asset, amount, ref)` | `USER_LOCKED:{u}:{asset}` | `USER_AVAILABLE:{u}:{asset}` | `locked -= amount; available += amount` (exige `locked >= amount`) |

- `ref` = `{ referenceType: 'DEPOSIT'|'WITHDRAWAL'|'ORDER'|'TRADE'|'ADJUSTMENT', referenceId: string }`.
- `operation` da transação = `'credit'|'debit'|'lock'|'unlock'`.
- **Provisionamento lazy:** se a `Wallet` ou o `Balance` do ativo não existirem, são criados
  (zerados) dentro da própria `UnitOfWork` da operação. Idem na primeira consulta.
- **Concorrência (obrigatório):** toda primitiva, logo no início da `UnitOfWork`, trava a linha do
  balance com `BalanceRepository.findForUpdate(walletId, asset)` (`SELECT ... FOR UPDATE`). Duas
  operações concorrentes no mesmo `(wallet, asset)` serializam; a segunda relê o saldo travado e
  revalida os invariantes. Sem isso, dois `debit` simultâneos leem `available` antigo e gravam saldo
  efetivo negativo (viola INV-001 / global 1). Provisionamento lazy também acontece sob esse lock
  (na ausência de linha, `INSERT ... ON CONFLICT DO NOTHING` seguido de `SELECT ... FOR UPDATE`).
- **Idempotência:** `UNIQUE (reference_type, reference_id, operation)` em `transactions`. Repetição
  exata da tripla é **no-op idempotente** — a primitiva detecta a transação já gravada e retorna o
  estado já aplicado, sem novas pernas.
- **KYC / autorização / limites: NÃO são checados aqui.** É responsabilidade explícita do caso de uso
  de negócio chamador (Depósito, Saque, Ordem, Trade).

### 5. `balanceBefore` / `balanceAfter`

Cada `ledger_entry` de **conta de usuário** grava o saldo corrente **daquela conta**
(`USER_AVAILABLE` ou `USER_LOCKED`) antes e depois da perna. Pernas de **conta operacional** gravam
`NULL` nesses campos. Facilita auditoria linha-a-linha (INV-014).

### 6. `ConfirmDeposit` — caso de uso interno, **sem endpoint HTTP**

`ConfirmDepositUseCase` passa a ser um caso de uso real: recebe `{ depositId, userId, asset,
amountMinor }`, chama `credit(...)` com `ref = { DEPOSIT, depositId }` e `operation = 'credit'`, tudo
em uma `UnitOfWork`.

**Não há rota HTTP para confirmar depósito neste ADR.** O endpoint `POST /financial/deposit/confirm`
existente é **removido** junto com o `FinancialController`. Motivo (gap #1 da Validação Estágio 2):
uma rota de confirmação protegida só pela sessão do usuário deixa qualquer cliente autenticado
creditar a própria carteira com qualquer valor — criação arbitrária de saldo, violação de INV-008 /
global 3. Confirmar depósito é operação **sistêmica**, disparada pelo futuro contexto de Depósitos
on-chain (após N confirmações / checagem de reorg), que importará `ConfirmDepositUseCase` diretamente.
Enquanto esse contexto não existe, o caso de uso é exercitado apenas por testes de integração.

### 7. Consultas de leitura (réplica — ADR 0003)

Os **únicos endpoints HTTP** deste ADR. Ambos escopados ao `userId` da sessão (o usuário só vê a
própria carteira) e protegidos por `SessionAuthGuard` (ADR 0004) — `userId` vem de
`request.user.userId`.

- `GET /wallet/balances` → lista de `{ asset, scale, availableMinor, lockedMinor, totalMinor }`
  (valores como string, pois `bigint` não serializa em JSON). Via `WalletReadRepository`.
- `GET /wallet/ledger?page=&pageSize=` → histórico paginado das pernas das contas do usuário
  (`USER_AVAILABLE` + `USER_LOCKED`), ordenado por `created_at DESC, id DESC`. Via
  `LedgerEntryReadRepository`. `pageSize` default 20, máx 100.

Como não há endpoint mutável neste ADR, a proteção CSRF do `SessionAuthGuard` (que só age em
`POST/PUT/PATCH/DELETE`) não é exercitada aqui — mas o guard permanece por padrão.

### 8. Estrutura de módulo

Um único módulo `src/modules/wallets/` contendo os dois aggregates (`Wallet`, `Transaction`).
O módulo `src/modules/financial/` é **removido inteiro** — nada dele é "movido", tudo é reescrito
sob o novo desenho. Arquivos deletados (gap #6):

- `src/modules/financial/` — o diretório completo: `financial.module.ts`, `financial.controller.ts`,
  `application/confirm-deposit.usecase.ts` + `.spec.ts`, `application/confirm-deposit-with-uow.usecase.ts`,
  `presentation/dtos/*`, `domain/entities/*`, `domain/repositories/*`,
  `infrastructure/persistence/*` (repos + `.spec.ts` + `*.sql.ts`)
- `src/infrastructure/database/unit-of-work.postgres.ts` — código morto já sinalizado em
  `03-estrutura-projeto.md`
- `src/modules/financial/infrastructure/persistence/pg-transaction.repository.ts` e
  `pg-ledger-entry.repository.ts` são importados por
  `src/infrastructure/database/unit-of-work-postgres.service.ts:4-5` — removê-los **quebra o build**
  até `PostgresUnitOfWork` ser reescrito (passo explícito no plano §3) para instanciar os repos de
  `wallets`.

Nada de `financial` sobrevive no `git grep`; o `FinancialModule` sai do `app.module.ts`.

### Schema

```sql
-- assets: catálogo de ativos suportados
assets (
  symbol      VARCHAR(12) PRIMARY KEY,          -- 'BRL', 'BTC'
  name        VARCHAR(64)  NOT NULL,
  scale       SMALLINT     NOT NULL CHECK (scale >= 0 AND scale <= 18),
  status      VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | INACTIVE
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- seed:
-- ('BRL','Real Brasileiro (simulado)',2,'ACTIVE')
-- ('BTC','Bitcoin',8,'ACTIVE')

-- wallets: 1:1 com users
-- FK user_id -> users(id): acoplamento de schema entre contextos ACEITO explicitamente
-- (gap #5) enquanto for monólito único — integridade referencial > pureza de bounded context.
wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- balances: projeção materializada; 1 registro por (wallet, ativo)
balances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        UUID NOT NULL REFERENCES wallets(id),
  asset            VARCHAR(12) NOT NULL REFERENCES assets(symbol),
  available_minor  BIGINT NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  locked_minor     BIGINT NOT NULL DEFAULT 0 CHECK (locked_minor >= 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wallet_id, asset)
);

-- transactions: agrupa as pernas de uma operação.
-- Sem coluna 'status' (gap #7): uma transação só existe se foi commitada com sucesso;
-- falha => rollback da UnitOfWork => nenhuma linha. Não há estado 'failed' persistível.
transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation       VARCHAR(24) NOT NULL,   -- credit | debit | lock | unlock
  reference_type  VARCHAR(24) NOT NULL,   -- DEPOSIT | WITHDRAWAL | ORDER | TRADE | ADJUSTMENT
  reference_id    VARCHAR(64) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reference_type, reference_id, operation)
);

-- ledger_entries: imutável. Sem UPDATE, sem DELETE.
ledger_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID NOT NULL REFERENCES transactions(id),
  account          VARCHAR(96) NOT NULL,   -- USER_AVAILABLE:{u}:{asset} | EXCHANGE:TREASURY:{asset} | ...
  asset            VARCHAR(12) NOT NULL REFERENCES assets(symbol),
  entry_type       VARCHAR(8)  NOT NULL CHECK (entry_type IN ('debit','credit')),
  amount_minor     BIGINT NOT NULL CHECK (amount_minor > 0),
  balance_before_minor BIGINT,             -- NULL para contas operacionais
  balance_after_minor  BIGINT,             -- NULL para contas operacionais
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_entries_tx      ON ledger_entries (transaction_id);
CREATE INDEX idx_ledger_entries_account ON ledger_entries (account, created_at DESC, id DESC);

-- Imutabilidade forçada por TRIGGER, não por REVOKE (gap #4): a aplicação conecta como
-- superuser (DB_USER=postgres em .env.example), que ignora GRANT/REVOKE. Um trigger
-- RAISE EXCEPTION funciona para qualquer role.
CREATE OR REPLACE FUNCTION ledger_entries_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entries_no_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();

CREATE TRIGGER trg_ledger_entries_no_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();
```

Imutabilidade do ledger reforçada em duas camadas: (1) trigger acima no banco; (2) `LedgerEntryRepository`
não declara `update`/`delete` (não compila tentar). Criar um role de aplicação sem privilégio de
mutação fica como melhoria futura (registrada em Consequências).

### Rationale

**Por que perna-por-linha com contas-string e não `walletId + entryType(LOCK/UNLOCK)`?**
Contas operacionais (`EXCHANGE:TREASURY`, `EXCHANGE:FEES`) são necessárias para os invariantes de
conservação global (global 3, 4, 5) e contrapartida de taxa (INV-013, global 17). O modelo
`walletId + entryType` não tem onde pendurar a contraparte da exchange. Perna-por-linha + contas-string
combina o "linha por perna" do doc 03 com o "contas operacionais / DebitAccount-CreditAccount" do doc 04.
É também o que o código esqueleto atual já faz (`ledger_entry.account: string`).

**Por que `LOCK`/`UNLOCK` como transferência e não como `entry_type` próprio?**
Manter `entry_type ∈ {debit, credit}` deixa `Σ débitos = Σ créditos` válido para *toda* transação sem
casos especiais. Um lock é literalmente mover valor de uma conta (disponível) para outra (bloqueada) do
mesmo dono — dupla entrada pura.

**Por que projeção materializada e não `SUM` on-the-fly?**
A tela de carteira lê saldo a cada navegação; `SUM` sobre um ledger que só cresce degrada com o tempo.
A projeção é atualizada na mesma transação, então nunca diverge sem um bug detectável por reconciliação.

**Por que idempotência por `(reference_type, reference_id, operation)` e não `(reference_type,
reference_id)`?** Uma ordem gera `lock` na criação e `debit` no fill — ambos com referência
`(ORDER, orderId)`. Sem `operation` na chave, o segundo colidiria com o primeiro.

**Por que KYC fora das primitivas?** Primitiva é mecanismo. Ajustes administrativos, estornos e
liquidação de trade não devem ser bloqueados por status de KYC do usuário. A verificação vive no caso
de uso de negócio (ex. `RequestWithdrawal` checa KYC antes de chamar `lock`/`debit`).

---

## Impacto nos Bounded Contexts (OBRIGATÓRIO)

| Bounded Context | Impacto | Como se comunica |
|-----------------|---------|------------------|
| identity / account | `wallets` referencia `users(id)` por FK no banco (acoplamento aceito — gap #5). **Nenhum import de código** entre os módulos. `SessionAuthGuard` (do módulo identity) é reusado nas rotas `GET /wallet/*` via providers do módulo NestJS. | FK no schema + guard compartilhado na camada de presentation. Sem chamada de domínio cross-módulo. |
| financial | **Removido inteiro.** Nada é migrado — `Transaction`/`LedgerEntry`/`ConfirmDeposit` são reescritos do zero em `wallets/`. `FinancialController` e a rota `POST /financial/deposit/confirm` **deixam de existir** (gap #1). | N/A (deixa de existir) |
| wallets (novo) | Criado. Dono de `Wallet`, `Balance`, `Transaction`, `LedgerEntry`, `Asset`. Expõe as primitivas `credit/debit/lock/unlock` como casos de uso reutilizáveis pelos contextos futuros. | Contextos futuros (Depósitos, Saques, Ordens, Trades) importam os casos de uso de `wallets/application` ou reagem a eventos. |
| orders / trades / bitcoin (futuros) | Passam a ter fundação de saldo. Nenhuma mudança agora. | Consumirão as primitivas. |
| shared | `shared/unit-of-work.ts` — a interface `Repositories` deixa de apontar para `financial` e passa a expor `walletRepo`, `balanceRepo`, `transactionRepo`, `ledgerRepo` do módulo `wallets`. | Import direto (já era assim). |

**Entidades de domínio afetadas:** `Wallet` (nova), `Balance` (nova), `Asset` (nova),
`Transaction` (movida + revista), `LedgerEntry` (movida + revista), VO `Money` (novo), VO `LedgerAccount` (novo).
**Interfaces de repositório afetadas:** `WalletRepository` / `WalletReadRepository`,
`BalanceRepository`, `TransactionRepository` / `TransactionReadRepository`,
`LedgerEntryRepository` / `LedgerEntryReadRepository`, `AssetRepository` / `AssetReadRepository`.
**Migrations necessárias:** sim — `assets` (+ seed BRL/BTC), `wallets`, `balances`, `transactions`,
`ledger_entries` (+ função e triggers de imutabilidade).

**Documentação a atualizar (gap #2):** `CLAUDE.md` (sufixo `_minor`, VO `Money` no lugar de `Satoshi`)
e `docs/architecture/03-estrutura-projeto.md` (consolidação de `wallets`/`ledger`/`financial` num só
módulo `wallets/`, remoção de `financial/`). Revisar se as skills `ledger-guard` / `arch-guard` leem
essas convenções.

---

## Checklist de Arquitetura (OBRIGATÓRIO)

- [x] Nenhum arquivo em `wallets/domain/` importa de `wallets/infrastructure/` ou `wallets/presentation/`
- [x] Valores monetários usam `BIGINT` no banco e `bigint` no TypeScript (menor-unidade por ativo)
- [x] Erros de domínio são subclasses de `DomainError` (nunca boolean de retorno)
- [x] Operações multi-tabela usam `UnitOfWork` (ADR 0001) — todas as primitivas
- [x] Entidades não recebem dependências de infraestrutura no construtor
- [x] Métodos `find*` retornam entidade ou `null`; `save`/`delete` retornam `void`
- [x] SQL nomeado em `*.sql.ts`, nunca inline
- [x] Leitura desacoplada via `*ReadRepository` na réplica (ADR 0003)
- [x] Únicos endpoints (`GET /wallet/balances`, `GET /wallet/ledger`) protegidos por `SessionAuthGuard`
      (ADR 0004) e escopados ao `userId` da sessão; erros via `DomainErrorFilter`
- [x] Nenhuma rota que credite/mova saldo é exposta ao cliente final (gap #1)
- [x] Concorrência serializada por `SELECT ... FOR UPDATE` na linha de `balances` (gap #3)
- [x] Imutabilidade do ledger por trigger no banco (gap #4)

---

## Plano de Implementação (OBRIGATÓRIO — na ordem)

### 1. Domínio (`src/modules/wallets/domain/`)
- [ ] `value-objects/money.vo.ts` — `Money` (assetSymbol, scale, amountMinor: bigint); `add`, `subtract`
      (lança em negativo), `isZeroOrNegative`; sem float
- [ ] `value-objects/ledger-account.vo.ts` — parsing/format das contas-string; `isUserAccount()`,
      `userId()`, `asset()`, `kind()` (`AVAILABLE`|`LOCKED`|`OPERATIONAL`)
- [ ] `entities/asset.entity.ts` — `Asset` (symbol, name, scale, status)
- [ ] `entities/wallet.entity.ts` — `Wallet` (id, userId); factory `createForUser`
- [ ] `entities/balance.entity.ts` — `Balance` (walletId, asset, availableMinor, lockedMinor);
      métodos `credit`, `debit`, `lock`, `unlock` que aplicam invariantes INV-001..004 e lançam typed errors
- [ ] `entities/transaction.entity.ts` — `Transaction` (id, operation, referenceType, referenceId);
      **sem `status`** (gap #7); factory `create`; agrega as pernas
- [ ] `entities/ledger-entry.entity.ts` — `LedgerEntry` (transactionId, account, asset, entryType,
      amountMinor, balanceBeforeMinor?, balanceAfterMinor?); `amountMinor > 0` obrigatório
- [ ] `errors/` — `InsufficientBalanceError`, `InsufficientLockedBalanceError`, `InvalidAmountError`,
      `AssetNotSupportedError`, `WalletNotFoundError`, `UnbalancedTransactionError`
- [ ] `events/` — `WalletProvisioned`, `BalanceCredited`, `BalanceDebited`, `BalanceLocked`, `BalanceUnlocked`
- [ ] `repositories/` — abstract classes: `AssetRepository`/`AssetReadRepository`,
      `WalletRepository`/`WalletReadRepository`, `BalanceRepository`,
      `TransactionRepository`/`TransactionReadRepository`, `LedgerEntryRepository`/`LedgerEntryReadRepository`.
      `BalanceRepository` declara `findForUpdate(walletId, asset): Promise<Balance | null>` —
      `SELECT ... FOR UPDATE` (gap #3), usado por todas as primitivas. `LedgerEntryRepository` **não**
      declara `update`/`delete` (imutabilidade em código — gap #4). `TransactionRepository` declara
      `findByReference(referenceType, referenceId, operation): Promise<Transaction | null>` (idempotência).
- [ ] `services/post-balances.ts` (domain service) — dada uma operação, monta as 2 pernas + before/after
      e valida `Σ débitos = Σ créditos` (`UnbalancedTransactionError`)

### 2. Aplicação (`src/modules/wallets/application/`)
- [ ] `provision-wallet.ts` — helper interno: garante `Wallet` + `Balance(asset)` dentro de um UoW
      (`INSERT ... ON CONFLICT DO NOTHING` + `findForUpdate`)
- [ ] `credit.usecase.ts` — primitiva `credit` (lock da linha de balance → checa idempotência →
      aplica → grava)
- [ ] `debit.usecase.ts` — primitiva `debit` (counter default `SETTLEMENT:{asset}` — gap #8)
- [ ] `lock.usecase.ts` — primitiva `lock`
- [ ] `unlock.usecase.ts` — primitiva `unlock`
- [ ] `confirm-deposit.usecase.ts` — **caso de uso interno, sem controller** (gap #1); chama `credit`
      (`ref = {DEPOSIT, depositId}`). Exportado do módulo para consumo futuro do contexto de Depósitos.
- [ ] `get-wallet-balances.usecase.ts` — leitura (réplica); provisiona lazy se ausente
- [ ] `get-ledger-history.usecase.ts` — leitura paginada (réplica)
- [ ] passo comum a toda primitiva, nesta ordem dentro do `uow.run`:
      `balanceRepo.findForUpdate` → `transactionRepo.findByReference` (se existe: no-op, retorna estado
      atual) → aplica no aggregate `Balance` → monta 2 pernas (domain service) → `save` tx + pernas + balance

### 3. Infraestrutura (`src/modules/wallets/infrastructure/persistence/`)
- [ ] migrations: `..._create_assets_table.sql` (+ seed BRL/BTC), `..._create_wallets_table.sql`,
      `..._create_balances_table.sql`, `..._create_transactions_table.sql`,
      `..._create_ledger_entries_table.sql`, `..._ledger_entries_immutability_triggers.sql` (gap #4)
- [ ] `*.sql.ts` — `asset.sql.ts`, `wallet.sql.ts`, `balance.sql.ts`, `transaction.sql.ts`,
      `ledger-entry.sql.ts` (constantes nomeadas; reuso entre write e read repos)
- [ ] `pg-*.repository.ts` (write, `QueryExecutor`) e `pg-*-read.repository.ts` (read, `ReadQueryExecutor`)
- [ ] mappers linha↔entidade (`bigint` <-> `BIGINT`; `pg` retorna `BIGINT` como string → `BigInt(...)`)
- [ ] atualizar `src/shared/unit-of-work.ts` — `Repositories` expõe `walletRepo`, `balanceRepo`,
      `transactionRepo`, `ledgerRepo`
- [ ] reescrever `PostgresUnitOfWork` (`src/infrastructure/database/unit-of-work-postgres.service.ts`)
      — hoje importa `PgTransactionRepository`/`PgLedgerEntryRepository` de `financial` (linhas 4-5);
      trocar pelos repos de `wallets` (`walletRepo`, `balanceRepo`, `transactionRepo`, `ledgerRepo`).
      Sem isso o build quebra ao deletar `financial/` (gap #6).
- [ ] remover `src/infrastructure/database/unit-of-work.postgres.ts` (código morto)
- [ ] deletar `src/modules/financial/` inteiro (ver seção "8. Estrutura de módulo" para a lista) e
      remover `FinancialModule` de `src/app.module.ts`

### 4. Presentation (`src/modules/wallets/presentation/`)
- [ ] `dtos/` — `balances-response.dto.ts`, `ledger-history-response.dto.ts`,
      `ledger-history-query.dto.ts` (page/pageSize com `ValidationPipe`). **Sem** DTO de confirmar depósito.
- [ ] `wallet.controller.ts` — **só** `GET /wallet/balances` e `GET /wallet/ledger`;
      `@UseGuards(SessionAuthGuard)`; `userId` de `request.user.userId`; Swagger. **Nenhuma rota `POST`.**
- [ ] `wallets.module.ts` — providers (repos write + read, UoW, use cases incl. `ConfirmDepositUseCase`
      exportado mas não roteado), importa o necessário de identity para o guard
- [ ] `app.module.ts` — remover `FinancialModule`, adicionar `WalletsModule`

### 5. Documentação (gap #2)
- [ ] `CLAUDE.md` — trocar a regra do sufixo `_satoshi` por `_minor` (menor unidade do ativo);
      mencionar `assets.scale` e o VO `Money`; ajustar a seção "Valores monetários"
- [ ] `docs/architecture/03-estrutura-projeto.md` — consolidar `wallets`/`ledger`/`financial` em
      `wallets/`; remover menções a `financial/`
- [ ] verificar/ajustar as skills `ledger-guard` e `arch-guard` se elas assertam `_satoshi` literal

---

## Edge Cases & Erros de Domínio (OBRIGATÓRIO)

| Caso | Erro de domínio | Comportamento decidido |
|------|-----------------|------------------------|
| `debit`/`lock` com `available < amount` | `InsufficientBalanceError(asset, available, requested)` | Rollback total da UoW. HTTP 422. |
| `unlock` com `locked < amount` | `InsufficientLockedBalanceError(asset, locked, requested)` | Rollback total. HTTP 422. |
| `amount <= 0` | `InvalidAmountError` | Rejeita antes de qualquer escrita. HTTP 422. |
| ativo fora do catálogo / `INACTIVE` | `AssetNotSupportedError(symbol)` | Rejeita. HTTP 422. |
| `(reference_type, reference_id, operation)` já processado | — (sem erro) | **No-op idempotente**: retorna o estado já aplicado, não grava novas pernas. HTTP 200/201 normal. |
| `Wallet`/`Balance` inexistente numa primitiva | — (sem erro) | Provisionamento lazy dentro da mesma UoW (`Balance` nasce zerado). |
| `Wallet` inexistente numa consulta | — (sem erro) | Provisiona lazy; retorna saldos zerados / histórico vazio. |
| pernas não batem (`Σ débitos ≠ Σ créditos`) | `UnbalancedTransactionError` | Bug de programação — falha alto, rollback. HTTP 500. Coberto por teste. |
| conta operacional ficaria "negativa" | — (sem erro) | Permitido (INV-001..003 só valem para conta de usuário). |
| `pageSize > 100` | `ValidationPipe` (400) | Clamp/validação no DTO. |
| concorrência: dois `debit` simultâneos no mesmo balance | — | `balanceRepo.findForUpdate` (`SELECT ... FOR UPDATE`) no início de toda primitiva serializa; o segundo relê o saldo travado e revalida INV-001..004. Teste de integração obrigatório. |
| tentativa de `UPDATE`/`DELETE` em `ledger_entries` | exceção do Postgres (trigger) | Trigger `RAISE EXCEPTION` aborta; repo nem expõe método. |

Mapeamento erro→HTTP fica no `DomainErrorFilter` global (ADR 0004) por `error.code`.

---

## Plano de Teste (OBRIGATÓRIO)

- [ ] **Unit (`Money`)**: soma/subtração; subtração que passaria de zero lança; ativos diferentes
      não somam; nunca usa float.
- [ ] **Unit (`LedgerAccount`)**: parse/format de cada tipo de conta; `isUserAccount`, `kind`.
- [ ] **Unit (`Balance`)**: `credit` incrementa; `debit` além do disponível lança
      `InsufficientBalanceError`; `lock` move available→locked preservando total; `unlock` inverso;
      `unlock` além do locked lança; `available/locked/total >= 0` sempre (INV-001..004).
- [ ] **Unit (domain service de pernas)**: monta 2 pernas balanceadas; `balanceBefore/After` corretos
      para conta de usuário e `NULL` para operacional; detecta desbalanceamento.
- [ ] **Unit (use cases, repos mockados)**: cada primitiva grava 1 transaction + 2 entries + atualiza
      balance; segunda chamada com mesma tripla é no-op (não chama `save` de novo);
      `confirm-deposit` credita via `credit`.
- [ ] **Integração (banco real, dentro de transação de teste)**:
  - depósito: `credit` de 0.5 BTC → `balances.available_minor = 50_000_000`, 2 linhas em
    `ledger_entries` (débito TREASURY, crédito USER_AVAILABLE), `Σ débitos = Σ créditos`.
  - `lock` seguido de `unlock` → total inalterado, 4 linhas de ledger.
  - `debit` além do disponível → nada persistido (rollback), erro tipado.
  - idempotência: rodar a mesma primitiva 2x → 1 transaction, 2 entries, saldo aplicado uma vez.
  - **concorrência (gap #3)**: duas UoW paralelas fazendo `debit` do mesmo `(wallet, asset)` com saldo
    que só cobre uma → uma passa, a outra falha com `InsufficientBalanceError`; saldo final nunca negativo.
  - **imutabilidade (gap #4)**: `UPDATE ledger_entries ...` e `DELETE FROM ledger_entries ...` diretos
    no banco → exceção do trigger.
  - reconciliação: `Σ ledger_entries` por conta de usuário == `balances`.
  - `GET /wallet/balances` e `GET /wallet/ledger` retornam da réplica, valores como string.
- [ ] **Negativo/segurança**: `GET /wallet/*` sem cookie de sessão → 401; `GET /wallet/balances` de
      usuário A nunca retorna dados de B (escopo por `userId` da sessão).
- [ ] **Regra de Dependência (gap G)**: teste que instancia as primitivas com repos mockados **sem
      subir o NestJS** — se exigir o container de DI, há acoplamento a infra. (Complementa `/arch-guard`.)

---

## Fluxos (se aplicável)

### Depósito (via `ConfirmDeposit` → `credit`) — sem HTTP

```
1. (futuro) contexto de Depósitos, após N confirmações on-chain, chama
   ConfirmDepositUseCase.execute({ depositId, userId, asset: BTC, amountMinor: 50000000n })

2. → credit(...) → uow.run:
   a. balanceRepo.findForUpdate(walletId, BTC)  → trava a linha (cria zerada se ausente)
   b. transactionRepo.findByReference(DEPOSIT, depositId, 'credit')
      → existe? retorna estado atual (no-op idempotente). FIM.
   c. Balance.credit(Money(BTC, 50000000n))  → available: 0 → 50000000
   d. Transaction.create(operation='credit', ref=DEPOSIT/depositId)
   e. pernas:
        DEBIT  EXCHANGE:TREASURY:BTC 50000000   (before/after = NULL)
        CREDIT USER_AVAILABLE:{userId}:BTC 50000000  (before=0, after=50000000)
   f. transactionRepo.save; ledgerRepo.save(x2); balanceRepo.save
   → COMMIT

3. retorna { transaction, balance } ao chamador. Nenhuma resposta HTTP — não há rota.
```

### Reserva para ordem (uso futuro de `lock`)

```
1. PlaceOrderUseCase (contexto orders, futuro) checa KYC + mercado ativo
2. lock(walletId, BRL, 200000, ref={ORDER, orderId})  → operation='lock'
   DEBIT  USER_AVAILABLE:{u}:BRL 200000  (before=800000, after=600000)
   CREDIT USER_LOCKED:{u}:BRL   200000  (before=0,      after=200000)
   → available -= 2000.00 BRL ; locked += 2000.00 BRL ; total inalterado
```

---

## Consequências

**Positivas:**
- Fundação financeira funcional e testada para todos os contextos seguintes.
- Ledger imutável (trigger) e balanceado por construção; reconciliação trivial (projeção == `SUM`).
- Multi-ativo real, sem float, escala explícita por ativo.
- Idempotência no schema — reprocessamento de eventos é seguro.
- Contas operacionais habilitam taxa (INV-013) e conservação global (global 5) sem retrabalho.
- **Nenhuma superfície HTTP move saldo** — impossível um cliente mintar saldo (gap #1).

**Negativas / Trade-offs:**
- **Diverge do `CLAUDE.md`** no sufixo `_satoshi` → `_minor`. O ADR inclui o passo de atualizar
  `CLAUDE.md` + `03-estrutura-projeto.md` + revisar `ledger-guard`/`arch-guard` (plano §5). Sem esse
  passo, os guards apontam falso-positivo.
- Imutabilidade por trigger (não por role): protege contra a aplicação e contra SQL manual, mas um
  superuser ainda pode `DROP TRIGGER`. Role de aplicação sem privilégio de mutação fica como melhoria
  futura.
- `ConfirmDeposit` sem rota significa que, até o contexto de Depósitos existir, **não há como creditar
  saldo por HTTP** — só via teste ou script. Aceito: creditar saldo à mão não é função de produto.
- Projeção materializada = duas escritas (ledger + balance) por operação; se um bug pular a atualização
  do balance, diverge até a reconciliação rodar. Mitigado por: mesma UoW + teste de reconciliação.
- Provisionamento lazy provisiona no meio de um fluxo financeiro (dentro da UoW da 1ª operação) —
  aceitável, mas significa que "criar usuário" não cria carteira; nenhum evento de identity é ouvido.
- `SELECT ... FOR UPDATE` no balance serializa operações concorrentes do mesmo usuário/ativo —
  correto para um sistema financeiro, mas limita throughput por conta (não é gargalo no uso educacional).
- Contas operacionais sem trava de não-negativo: um bug pode drenar a "tesouraria" indefinidamente sem
  alarme imediato — depende da reconciliação/monitoramento (fora deste ADR).

---

## Decisões do Usuário (rastreabilidade)

> Confirmadas no grelhamento (Passo 2 da skill), 2026-08-28. Não são suposições do arquiteto.

- 2026-08-28 — Cardinalidade da carteira? → **1 `Wallet` por usuário + N `Balance` (1 por ativo)**;
  `Balance` é filho do aggregate `Wallet`. (Resolve conflito doc 03 × doc 04 a favor do doc 03.)
- 2026-08-28 — Desenho do ledger? → **Linha única por perna, com contas em string**
  (`USER_AVAILABLE:{u}:{asset}`, `EXCHANGE:TREASURY:{asset}`, ...); `transaction` agrupa as pernas.
- 2026-08-28 — Escopo de operações deste ADR? → **Primitivas de escrita (`credit/debit/lock/unlock`) +
  leitura (saldos + histórico) + absorver o módulo `financial`.**
- 2026-08-28 — Representação monetária multi-ativo? → **`bigint` em menor-unidade + catálogo `assets`
  com `scale` por ativo.** (Implica sufixo `_minor`, relaxando a regra `_satoshi` do `CLAUDE.md`.)
- 2026-08-28 — Quando `Wallet`/`Balance` são criados? → **Lazy — na primeira operação/consulta que
  precisa**, dentro da própria `UnitOfWork`.
- 2026-08-28 — `balances` × ledger? → **Projeção materializada, atualizada na mesma transação do
  ledger**; ledger é fonte da verdade; `lock`/`unlock` = transferência entre `USER_AVAILABLE` e
  `USER_LOCKED`.
- 2026-08-28 — Catálogo de ativos? → **Criar tabela `assets` neste ADR, seed só `BRL` (scale 2) e
  `BTC` (scale 8)**; CRUD admin fora de escopo.
- 2026-08-28 — Idempotência das primitivas? → **Sim, constraint única na `transaction`** —
  refinada para **`(reference_type, reference_id, operation)`** (o usuário aprovou o refinamento por
  causa da colisão ORDER lock × fill). Duplicata = **no-op idempotente** retornando o resultado anterior.
- 2026-08-28 — Estrutura de módulo? → **Um único módulo `wallets/`** contendo
  `Wallet`+`Balance`+`Transaction`+`LedgerEntry`; absorve `financial/`.
- 2026-08-28 — KYC nas primitivas? → **Não** — responsabilidade do caso de uso chamador
  (depósito/saque/trade). O ADR documenta a fronteira.
- 2026-08-28 — Contas operacionais têm invariante de não-negativo e linha em `balances`? → **Não** —
  só aparecem no ledger; INV-001..003 valem só para conta de usuário.
- 2026-08-28 — `balanceBefore`/`balanceAfter` no ledger? → **Manter**, só para pernas de conta de
  usuário (operacionais = `NULL`).
- 2026-08-28 — `confirm-deposit` após absorvido? → **Reescrever sobre `credit()` + novo schema.**
  (Ver amendamento 2026-08-29 abaixo — o endpoint HTTP foi removido.)
- 2026-08-28 — Frontend desta rodada? → **Página "Carteira": card de saldos por ativo
  (disponível/bloqueado/total) + tabela paginada do histórico do ledger**; auth por cookie de sessão
  (ADR 0004); sem ações de escrita na UI.

### Amendamento 2026-08-29 (gaps da Validação Estágio 2)

- 2026-08-29 — Gap #1: como autorizar a confirmação de depósito? → **Remover o endpoint HTTP.**
  `ConfirmDepositUseCase` permanece como caso de uso interno sobre `credit()`, chamado pelo futuro
  contexto de Depósitos. Nenhuma rota que mova saldo é exposta ao cliente final.
- 2026-08-29 — Gap #5: manter a FK `wallets.user_id → users(id)`? → **Manter** — acoplamento de schema
  pragmático aceito enquanto for monólito único (integridade referencial > pureza de contexto).
- 2026-08-29 — Gaps #2, #3, #4, #6, #7, #8: correções técnicas aplicadas sem decisão de negócio —
  passo de atualização de docs no plano (§5); `BalanceRepository.findForUpdate` + `SELECT FOR UPDATE`
  em toda primitiva; imutabilidade do ledger por trigger (não `REVOKE`); enumeração dos arquivos de
  `financial/` a remover + reescrita do `PostgresUnitOfWork`; remoção da coluna `transactions.status`;
  `debit` com counter default `SETTLEMENT:{asset}`.

---

## Referências

- ADR 0001 — Padrão UnitOfWork para atomicidade
- ADR 0003 — Réplica de leitura PostgreSQL (`XRepository` / `XReadRepository`)
- ADR 0004 — Transporte de sessão via cookie httpOnly, CSRF, `DomainErrorFilter`
- `docs/bussiness/03-modelo-de-dominio.md` — entidades e invariantes
- `docs/bussiness/04-carteiras-e-ledger-financeiro.md` — INV-001 a INV-014, dupla entrada, contas
- `docs/bussiness/11-invariantes-globais.md` — invariantes globais 1–20 + Invariante Suprema
- `docs/architecture/02-clean-architecture-ddd-fundamentos.md` — Regra de Dependência, `Satoshi`/`Money`
- `docs/architecture/03-estrutura-projeto.md` — estrutura de módulo, remoção de `unit-of-work.postgres.ts`

---

## Validação (Estágio 2) — 2026-08-28

Revisão adversarial. Impacto re-derivado do codebase, não do ADR.

### Checklist

| Item | Resultado | Evidência |
|------|-----------|-----------|
| A. Regra de Dependência — entidades/use cases sem import de infra | OK | Plano põe VOs/entidades em `wallets/domain/`, primitivas em `wallets/application/`; repos só via abstract class |
| A. Repositórios via interface de domínio | OK | Seção "Interfaces de repositório afetadas" lista abstract classes; wiring por `useFactory` |
| A. HTTP/logs/filas fora do use case | OK | Controllers em `presentation/`; guard na presentation |
| B. Aggregate root vs filha | OK | `Wallet`→`Balance`, `Transaction`→`LedgerEntry` explícitos |
| B. Value Objects | OK | `Money`, `LedgerAccount` definidos |
| B. Invariantes protegidas pelo aggregate | OK | `Balance.credit/debit/lock/unlock` aplicam INV-001..004; domain service valida `Σd=Σc` |
| B. Domain Events | OK (ressalva) | Eventos definidos; nenhum dispatcher existe no repo (padrão atual: `identity/domain/events/*` só declara) — consistente |
| B. Erros tipados `DomainError` | OK | 6 erros nomeados; `shared/domain.error.ts` existe |
| C. `BIGINT` no schema | OK | Todas as colunas monetárias `BIGINT` |
| C. `bigint` no TS | OK | `Money.amountMinor: bigint`; mapper `BigInt(...)` |
| C. Unidade no nome do campo | OK (com desvio consciente) | `_minor` em vez de `_satoshi` — **diverge do CLAUDE.md**, ver GAP #2 |
| C. Sem `number`/`float` em aritmética financeira | OK | `Money` proíbe |
| D. Multi-tabela usa `UnitOfWork` | OK | Todas as primitivas em `uow.run` |
| D. Rollback em falha parcial | OK | `InsufficientBalanceError` dentro da UoW → rollback total (tabela de edge cases) |
| D. Sem dirty read / concorrência | **GAP #3** | `SELECT FOR UPDATE` citado só na tabela de edge cases, ausente do plano e das interfaces de repo |
| E. Schema consistente com ADR 0002/0003 | OK (com ressalva GAP #5) | FK `wallets.user_id→users(id)` acopla schema entre contextos |
| E. Índices declarados | OK | `idx_ledger_entries_account`, `_tx`; `UNIQUE` em balances/transactions |
| E. `NOT NULL` intencional | OK | Colunas explícitas |
| E. Imutabilidade do ledger via `REVOKE` | **GAP #4** | App conecta como `DB_USER=postgres` (`.env.example`) — superuser ignora `REVOKE`; garantia não funciona |
| F. Registro inexistente | OK | `WalletNotFoundError` + provisionamento lazy |
| F. Zero/negativo | OK | `InvalidAmountError`, CHECK `amount_minor > 0` |
| F. Idempotência | OK | `UNIQUE (reference_type, reference_id, operation)` + no-op |
| F. Falha de integração externa | N/A | Sem RPC/externo neste ADR |
| G. Cobre edge cases | OK | Plano de teste cobre a tabela |
| G. Integração com banco real | OK | Seção "Integração" detalhada |
| G. Teste de Regra de Dependência | GAP #7 (baixo) | Não há passo explícito; coberto por `/arch-guard` fora do ADR |
| H. Ordem domain→app→infra→presentation | OK | Plano segue a ordem |
| H. Passos atômicos e verificáveis | OK (com GAP #6) | Passos ok, mas não enumera a exclusão dos 2 use cases + specs do `financial` |
| **SEGURANÇA — quem pode creditar saldo** | **GAP #1 (ALTO)** | `POST /wallet/deposit/confirm` só com `SessionAuthGuard` → qualquer usuário autenticado credita a própria carteira (mint infinito) |

### Veredito: 🔁 REVISAR

| # | Severidade | Gap | Evidência | Correção exigida |
|---|-----------|-----|-----------|------------------|
| 1 | **ALTO** | `POST /wallet/deposit/confirm` protegido só por `SessionAuthGuard`. Qualquer usuário logado chama e credita a própria wallet com qualquer `amountMinor` → criação arbitrária de saldo (viola INV-008 / global 3). O controller `financial` atual (`financial.controller.ts:15`) nem tem guard. | `financial.controller.ts` sem guard; ADR §7 diz "auth: `SessionAuthGuard`" para todos os endpoints, incl. o de confirmar depósito | Definir a fronteira de autorização do endpoint de confirmação de depósito: (a) removê-lo deste ADR (opção que o usuário não escolheu) — ou (b) restringi-lo a um mecanismo não-usuário (guard de serviço/API key interna, ou role admin), documentando que é operação sistêmica/interna, nunca disparável pelo cliente final. As consultas `GET /wallet/*` (escopadas ao `userId` da sessão) continuam com `SessionAuthGuard`. |
| 2 | MÉDIO | Desvio de convenção documentada (`_satoshi`→`_minor`; `wallets/`+`ledger/`+`financial/` → só `wallets/`) está só em "Consequências", não no plano de implementação. Fica como dívida silenciosa. | `CLAUDE.md` §"Valores monetários" e "Convenções críticas — SQL"; `docs/architecture/03-estrutura-projeto.md` "Organização da Persistência" lista `wallets`/`ledger`/`financial` | Adicionar passo explícito no Plano de Implementação (seção 4 ou nova seção 5 "Documentação"): atualizar `CLAUDE.md` (sufixo `_minor`, VO `Money`), atualizar `docs/architecture/03-estrutura-projeto.md` (consolidação em `wallets/`, remoção de `financial/`), e revisar se as skills `ledger-guard`/`arch-guard` leem essas regras. |
| 3 | MÉDIO | Controle de concorrência (`SELECT ... FOR UPDATE` na linha de `balances`) aparece só na tabela de edge cases. Sem ele, dois `debit`/`lock` simultâneos do mesmo (wallet, asset) podem ambos ler `available` antigo e gravar saldo negativo efetivo (viola INV-001, global 1). | ADR "Edge Cases" linha "concorrência"; ausente do Plano §1 (repo) e §3 (SQL) | Adicionar ao domínio/infra: método `BalanceRepository.findForUpdate(walletId, asset)` com `SELECT ... FOR UPDATE`, usado por todas as primitivas dentro da UoW. Incluir teste de integração de concorrência (duas UoW paralelas). |
| 4 | MÉDIO | Imutabilidade do ledger por `REVOKE UPDATE, DELETE` não funciona: a aplicação conecta como `postgres` (superuser), que ignora GRANT/REVOKE. | `.env.example` (`DB_USER=postgres`); `src/infrastructure/database/scripts/run-migration.script.ts` usa `DB_USER` | Trocar por um **trigger** `BEFORE UPDATE OR DELETE ON ledger_entries` que faz `RAISE EXCEPTION` — funciona independente do role. Manter também a proibição em código (repo sem `update`/`delete`). Opcional: criar role de aplicação sem privilégio de mutação como melhoria futura (registrar). |
| 5 | BAIXO | FK `wallets.user_id → users(id)` acopla o schema de `wallets` ao de `identity`, o que a doc de fundamentos desaconselha ("contextos independentes… comunicação por eventos ou ACL"). O ADR afirma "nenhuma dependência de código" mas não justifica a FK. | `docs/architecture/02-...md` §"Bounded Contexts"; ADR "Impacto nos Bounded Contexts" | Registrar decisão explícita: aceitar a FK como acoplamento pragmático no monólito (integridade referencial > pureza), OU trocar por `user_id UUID NOT NULL` sem FK + validação na aplicação. Uma linha em "Decisões do Usuário". |
| 6 | BAIXO | Plano diz "remover `src/modules/financial/`" mas não enumera: `confirm-deposit.usecase.ts`, `confirm-deposit-with-uow.usecase.ts`, `confirm-deposit.usecase.spec.ts`, os 4 spec files de repo, `financial.controller.ts`, DTOs. `PostgresUnitOfWork` (`unit-of-work-postgres.service.ts`) importa `Pg*Repository` de `financial` — quebra ao remover. | `src/modules/financial/**`; `src/infrastructure/database/unit-of-work-postgres.service.ts:4-5` | Enumerar no plano a lista de arquivos a remover e o passo "reescrever `PostgresUnitOfWork` para instanciar repos de `wallets`" (já citado, mas ligar explicitamente à quebra de import). |
| 7 | BAIXO | `transactions.status` = `confirmed | failed`, mas nada grava `failed` (rollback não persiste). Coluna morta. | ADR "Schema" bloco `transactions` | Remover a coluna `status` (ou documentar um caso futuro concreto que a use). |
| 8 | BAIXO | `credit` tem contraparte default (`EXCHANGE:TREASURY`), `debit` não tem default e o ADR não diz qual conta usar para saque. | ADR §4 tabela de primitivas | Definir o default de `debit` (ex.: `SETTLEMENT:{asset}`) ou marcar `counter` como obrigatório e documentar que o contexto de Saque passa `EXCHANGE:...`/`SETTLEMENT:...`. |

### Cobertura

- **OK:** 24 itens
- **GAP:** 8 (1 ALTO, 3 MÉDIO, 4 BAIXO)
- **N/A:** 1 (falha de integração externa)

### Próximo passo

Rode `/adr-architect` para amendar o ADR endereçando os gaps #1–#4 (bloqueantes) e registrando decisão para #5–#8, depois re-valide.

---

### Amendamento aplicado — 2026-08-29

Todos os 8 gaps endereçados (ver "Decisões do Usuário → Amendamento 2026-08-29" e o corpo do ADR):

| # | Como foi resolvido |
|---|--------------------|
| 1 | Endpoint HTTP de confirmar depósito **removido**; `ConfirmDepositUseCase` vira caso de uso interno. `FinancialController` deletado. Únicas rotas: `GET /wallet/balances`, `GET /wallet/ledger`. |
| 2 | Nova seção 5 do Plano de Implementação: atualizar `CLAUDE.md`, `03-estrutura-projeto.md`, revisar guards. |
| 3 | `BalanceRepository.findForUpdate` + `SELECT ... FOR UPDATE` no início de toda primitiva; teste de concorrência no plano. |
| 4 | `REVOKE` trocado por função + triggers `BEFORE UPDATE/DELETE` no schema; teste de imutabilidade. |
| 5 | FK mantida, decisão explícita registrada + comentário no schema. |
| 6 | Seção 8 enumera os arquivos de `financial/` a remover; plano §3 liga a remoção à reescrita do `PostgresUnitOfWork`. |
| 7 | Coluna `transactions.status` removida do schema e da entidade. |
| 8 | `debit` recebe counter default `SETTLEMENT:{asset}`. |

Pronto para re-validação (`/adr-validator`).

---

## Validação (Estágio 2) — RE-VALIDAÇÃO 2026-08-29

Segunda passada adversarial, após o amendamento. Impacto re-derivado do codebase.

### Gaps da 1ª passada — status

| # | Sev orig. | Status | Evidência do fechamento |
|---|-----------|--------|--------------------------|
| 1 | ALTO | ✅ FECHADO | §6 "sem endpoint HTTP"; §7 "únicos endpoints `GET /wallet/balances` e `GET /wallet/ledger`, escopados ao `userId` da sessão"; plano §4 "nenhuma rota `POST`"; `FinancialController` na lista de deleção (§8). Nenhuma superfície HTTP move saldo. |
| 2 | MÉDIO | ✅ FECHADO | Plano §5 "Documentação": atualizar `CLAUDE.md`, `docs/architecture/03-estrutura-projeto.md`, revisar `ledger-guard`/`arch-guard`. |
| 3 | MÉDIO | ✅ FECHADO | §4 bullet "Concorrência (obrigatório)"; `BalanceRepository.findForUpdate` no plano §1; passo comum às primitivas ("`balanceRepo.findForUpdate` → ..."); teste de concorrência no plano de teste. |
| 4 | MÉDIO | ✅ FECHADO | Schema: função `ledger_entries_immutable()` + `trg_ledger_entries_no_update` / `_no_delete`. Migration `..._ledger_entries_immutability_triggers.sql`. Teste de imutabilidade. Verificado contra `.env.example` (`DB_USER=postgres`) — trigger funciona para superuser, `REVOKE` não. |
| 5 | BAIXO | ✅ FECHADO | Comentário no schema de `wallets`; "Decisões do Usuário → Amendamento 2026-08-29"; tabela de impacto atualizada. |
| 6 | BAIXO | ✅ FECHADO | §8 enumera os arquivos de `financial/`; plano §3 "reescrever `PostgresUnitOfWork` … Sem isso o build quebra ao deletar `financial/`" com referência a `unit-of-work-postgres.service.ts:4-5` (verificado — importa `PgTransactionRepository`/`PgLedgerEntryRepository` de `financial`). |
| 7 | BAIXO | ✅ FECHADO | Schema `transactions` sem `status`, com comentário; plano §1 "`Transaction` … **sem `status`**". |
| 8 | BAIXO | ✅ FECHADO | §4 tabela: `debit(..., counter=SETTLEMENT)`; plano §2 "counter default `SETTLEMENT:{asset}`". |

### Checklist (itens relevantes ao amendamento)

| Item | Resultado | Evidência |
|------|-----------|-----------|
| A. Use case sem import de infra | OK | Primitivas em `application/`, repos por abstract class; teste de Regra de Dependência adicionado ao plano |
| A. HTTP fora do use case | OK | `ConfirmDepositUseCase` sem controller; só `GET` no `wallet.controller.ts` |
| B. Aggregate root vs filha | OK | `Wallet`→`Balance`, `Transaction`→`LedgerEntry` |
| B. Value Objects | OK | `Money`, `LedgerAccount` |
| B. Invariante protegida pelo aggregate | OK | `Balance.credit/debit/lock/unlock` (INV-001..004); domain service valida `Σd=Σc` |
| B. Erros tipados | OK | 6 erros nomeados subclasses de `DomainError` |
| C. `BIGINT` schema / `bigint` TS | OK | Todas as colunas monetárias; `Money.amountMinor: bigint` |
| C. Unidade explícita no nome | OK (desvio consciente registrado) | `_minor` + `assets.scale`; plano §5 atualiza `CLAUDE.md` |
| D. Multi-tabela com `UnitOfWork` | OK | Todas as primitivas |
| D. Rollback / dirty read | OK | `uow.run` + `SELECT ... FOR UPDATE` na linha de `balances` |
| E. Schema consistente com ADR 0002/0003 | OK | FK `wallets.user_id→users(id)` (decisão registrada); read via `ReadQueryExecutor` (verificado o padrão em `pg-session-read.repository.ts:1`) |
| E. Índices | OK (ver Obs. #2) | `idx_ledger_entries_account (account, created_at DESC, id DESC)`, `idx_ledger_entries_tx`, `UNIQUE` em balances/transactions |
| E. `NOT NULL` intencional | OK | `balance_before/after_minor` nullable com intenção documentada |
| F. Registro inexistente / zero / duplicado | OK | Tabela de edge cases + `InvalidAmountError` + no-op idempotente |
| F. Falha externa | N/A | Sem integração externa neste ADR |
| G. Cobre edge cases + integração real + Regra de Dependência | OK | Plano de teste inclui concorrência, imutabilidade, reconciliação, teste sem NestJS |
| H. Ordem domain→app→infra→presentation | OK | Plano segue; §5 (docs) ao final |
| **Wiring do guard** | Obs. #1 (BAIXO) | `IdentityModule` não tem `exports` — `SessionAuthGuard`/`ValidateSession` não são exportados |

### Veredito: ✅ APROVA

Zero gaps CRÍTICO/ALTO/MÉDIO. Os 8 gaps da 1ª passada estão fechados com evidência. Duas observações
BAIXO para o executor endereçar durante a implementação (não bloqueiam):

| # | Sev | Observação | Correção sugerida |
|---|-----|------------|-------------------|
| 1 | BAIXO | `IdentityModule` (`src/modules/identity/identity.module.ts:133`) não declara `exports`. `SessionAuthGuard` injeta `ValidateSession`. `WalletsModule` não conseguirá usar o guard sem que `IdentityModule` exporte ambos. | O executor deve: adicionar `exports: [SessionAuthGuard, ValidateSession]` ao `IdentityModule` **ou** reconstruir a cadeia do guard dentro do `WalletsModule`. Registrar a escolha. |
| 2 | BAIXO | `GET /wallet/ledger` filtra as pernas do usuário por `account` string (`LIKE 'USER_AVAILABLE:{u}:%'`). Funciona com o índice btree (prefixo), mas é frágil e acopla a query ao formato da conta. | Opcional: adicionar coluna `wallet_id UUID` (nullable, FK) em `ledger_entries`, populada só para pernas `USER_*`, com índice `(wallet_id, created_at DESC, id DESC)`. Query vira `WHERE wallet_id = $1`. O executor decide; se mantiver `LIKE`, documentar o formato canônico de conta como contrato. |

### Cobertura

- **OK:** 17 itens de checklist + 8 gaps fechados
- **Obs. não-bloqueantes:** 2 (BAIXO)
- **N/A:** 1 (falha de integração externa)

### Próximo passo

ADR pronto para implementação. Rode `/adr-executor`. O executor deve tratar as Obs. #1 e #2 acima ao
chegar nas camadas de infra/presentation.
