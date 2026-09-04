# ADR 0007 — Catálogo de Ativos, Pares de Mercado e Autorização de Administrador

**Status:** Proposto <!-- Rascunho | Proposto | Aceito | Em Progresso | Implementado | Substituído -->
**Data:** 2026-08-28
**Autores:** Time de Backend
**Contexto relacionado:** ADR 0001 (UnitOfWork), ADR 0003 (réplica de leitura), ADR 0004 (transporte de sessão / `DomainErrorFilter`), ADR 0005 (login/logout, `ValidationPipe` global)
**Gerado por:** skill `/adr-architect`

---

## Contexto

O sistema hoje tem dois bounded contexts implementados: `identity` (cadastro, login, sessão, bloqueio por tentativas) e `financial` (transações e ledger de dupla entrada). Não existe:

- **Catálogo de ativos** — nenhuma tabela lista quais moedas a exchange suporta (BTC, BRL, USDT, ETH). O doc `docs/bussiness/03-modelo-de-dominio.md` referencia "catálogo de ativos" como pré-condição de `Balance`, `Deposit`, `Withdrawal` e `Market`, mas ele nunca foi materializado.
- **Pares de negociação (`Market`)** — não há como registrar que "BTC/BRL" é negociável, com que precisão de preço e quantidade, e se está ativo. O order book, o matching engine e a validação de `Order` dependem disso (`docs/bussiness/05-mercados-de-negociacao.md`, `06`, `07`).
- **Autorização por papel** — todo endpoint autenticado hoje trata qualquer sessão válida como igual (`SessionAuthGuard`). Operações de configuração da exchange (criar mercado, cadastrar ativo) precisam ser restritas a operadores da plataforma, e esse conceito não existe.

Esta decisão introduz os três de uma vez porque são interdependentes: um `Market` referencia dois `assets`; criar `Market` e `assets` exige autorização de administrador.

A abordagem de camadas segue `docs/architecture/04-quando-usar-clean-architecture.md`, que classifica explicitamente "Criar par de mercado (BTC/USDT)" e "Cadastrar nova moeda" como **fluxo simples** (configuração do sistema, não toca saldo/ledger/on-chain). Portanto os módulos `market` e `asset` usam a estrutura simplificada (service + repositório, sem abstract repository nem use case pattern). A **autorização de administrador**, por ser concern de segurança, é tratada como mecanismo transversal em `identity`.

---

## Forças em Jogo

- O doc de domínio dita `Decimal(38,18)` para valores, mas o `CLAUDE.md` e os invariantes financeiros mandam `bigint`/inteiro. `Market` e `Asset` não têm campo monetário — só precisões inteiras (`pricePrecision`, `quantityPrecision`, `scale`). O conflito não se materializa aqui, mas a semântica escolhida (número de casas decimais) precisa ser compatível com o `bigint` que `Order`/`Trade` vão usar no futuro.
- Introduzir autorização não pode quebrar nenhum endpoint existente — `SessionAuthGuard` continua como está; o `AdminGuard` é aditivo e roda **depois** dele.
- O catálogo de ativos poderia ser um ADR próprio, mas a FK de `markets` para `assets` e a validação cruzada de precisão (`market.pricePrecision ≤ quoteAsset.scale`) tornam o acoplamento forte o suficiente para tratá-los juntos.
- Consistência com ADR 0003: leituras vão para a réplica (`ReadQueryExecutor`), escritas para o primário (`QueryExecutor`). Módulos simples ainda seguem o split `XRepository` / `XReadRepository`.
- `symbol` de mercado derivado de `baseAsset + '/' + quoteAsset` elimina uma classe inteira de inconsistência (symbol que não bate com os assets).
- Nenhuma operação desta decisão escreve em mais de uma tabela na mesma transação → `UnitOfWork` não é necessário (ver Checklist).

---

## Decisão

### Visão geral

Três entregas coordenadas:

1. **Módulo `asset`** (`src/modules/asset/`) — catálogo de ativos suportados. CRUD de administrador + leitura pública paginada.
2. **Módulo `market`** (`src/modules/market/`) — pares de negociação. CRUD de administrador (criar, ativar/inativar, editar precisões) + leitura pública paginada (só `ACTIVE`).
3. **Autorização de administrador em `identity`** — tabela `administrators`, `AdminGuard`, promoção de admin via SQL/seed manual (sem endpoint nesta rodada).

### Módulo `asset`

**Entidade `Asset`** (`asset/domain/entities/asset.entity.ts`):

| Campo | Tipo TS | Descrição |
|-------|---------|-----------|
| `symbol` | `string` | PK. Uppercase, `^[A-Z0-9]{2,10}$`. Ex.: `BTC`, `BRL`, `USDT`. |
| `name` | `string` | Nome legível. Ex.: `Bitcoin`. 1–100 chars. |
| `scale` | `number` | Casas decimais máximas que o ativo suporta. Inteiro `0–18`. |
| `status` | `AssetStatus` | `ACTIVE` \| `INACTIVE`. |
| `createdAt` / `updatedAt` | `Date` | |

- Métodos de domínio: `Asset.create({...})`, `Asset.reconstitute({...})`, `activate()`, `deactivate()`, `rename(name)`.
- **`scale` é imutável após a criação** (emenda 2026-08-29, gap ALTO #1). Não há `changeScale`. Corrigir `scale` errado = desativar o asset e cadastrar outro. Isso remove a dependência `asset → market` e quebra a circularidade de módulos.

**Operações:**

| Método | Rota | Autorização | Efeito |
|--------|------|-------------|--------|
| `GET` | `/assets` | pública | Lista paginada. `?status=` opcional (default: todos). |
| `GET` | `/assets/:symbol` | pública | Detalhe. `404` se não existe. |
| `POST` | `/admin/assets` | `AdminGuard` | Cria asset. `409` se symbol já existe. |
| `PATCH` | `/admin/assets/:symbol` | `AdminGuard` | Edita **apenas `name`** (emenda 2026-08-29 — `scale` imutável). |
| `PATCH` | `/admin/assets/:symbol/status` | `AdminGuard` | `{ status: 'ACTIVE' \| 'INACTIVE' }`. |

Sem `DELETE` — ativo é desativado, nunca removido (preserva integridade histórica de markets/ledger futuros).

### Módulo `market`

**Entidade `Market`** (`market/domain/entities/market.entity.ts`):

| Campo | Tipo TS | Descrição |
|-------|---------|-----------|
| `id` | `string` (UUID) | PK. |
| `symbol` | `string` | Único. Derivado: `` `${baseAsset}/${quoteAsset}` ``. Imutável. |
| `baseAsset` | `string` | FK → `assets.symbol`. Imutável. |
| `quoteAsset` | `string` | FK → `assets.symbol`. Imutável. |
| `status` | `MarketStatus` | `ACTIVE` \| `INACTIVE`. Nasce `ACTIVE`. |
| `pricePrecision` | `number` | Casas decimais permitidas no preço (expresso em `quoteAsset`). Inteiro `0–18`. |
| `quantityPrecision` | `number` | Casas decimais permitidas na quantidade (expressa em `baseAsset`). Inteiro `0–18`. |
| `createdAt` / `updatedAt` | `Date` | |

- Métodos de domínio: `Market.create({...})`, `Market.reconstitute({...})`, `activate()`, `deactivate()`, `changePrecisions({ pricePrecision?, quantityPrecision? })`.
- `Market.create` valida na própria entidade: `baseAsset !== quoteAsset` (senão `SameAssetMarketError`), precisões `0–18` (senão `InvalidPrecisionError`). A **existência e o status dos assets** e a regra `precision ≤ asset.scale` são validadas no **service** (dependem de outro agregado).
- `symbol` é computado no factory `create` a partir de `baseAsset`/`quoteAsset`; o cliente **não** envia `symbol`.

**Operações:**

| Método | Rota | Autorização | Efeito |
|--------|------|-------------|--------|
| `GET` | `/markets` | pública | Lista paginada, **somente `ACTIVE`**. |
| `GET` | `/markets/:base/:quote` | pública | Detalhe (qualquer status). `404` se não existe. Dois segmentos de path — nenhum `/` codificado (emenda 2026-08-29, gap ALTO #2). Ex.: `GET /markets/BTC/BRL`. |
| `GET` | `/admin/markets` | `AdminGuard` | Lista paginada, **todos os status**. `?status=` opcional. |
| `POST` | `/admin/markets` | `AdminGuard` | Cria market. Body: `{ baseAsset, quoteAsset, pricePrecision, quantityPrecision }`. |
| `PATCH` | `/admin/markets/:base/:quote/status` | `AdminGuard` | `{ status: 'ACTIVE' \| 'INACTIVE' }`. Transição livre nos dois sentidos. |
| `PATCH` | `/admin/markets/:base/:quote/precisions` | `AdminGuard` | `{ pricePrecision?, quantityPrecision? }`. Ao menos um campo. |

> `symbol` (`"BASE/QUOTE"`) continua existindo como campo derivado da entidade e como coluna `UNIQUE` no banco; ele só nunca aparece em **path** de URL. Internamente os repositórios podem seguir buscando por `symbol` (montado a partir de `:base`/`:quote`) ou por `(base_asset, quote_asset)`.

Sem `DELETE`. `baseAsset`/`quoteAsset`/`symbol` nunca mudam após criação.

> **Nota de acoplamento futuro (matching engine):** hoje não existem `Order` nem `Trade`, então precisões e status podem ser alterados livremente. Quando o order book existir, `changePrecisions` e `deactivate` precisarão considerar ordens abertas — isso será tratado no ADR do matching engine, não aqui. Registrado como consequência.

### Autorização de administrador (`identity`)

**Tabela `administrators`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `UUID` PK | |
| `user_id` | `UUID` | FK → `users.id`, `UNIQUE`, `ON DELETE CASCADE`. |
| `role` | `VARCHAR(30)` | Enum de aplicação: por ora só `SUPER_ADMIN`. |
| `created_at` | `TIMESTAMPTZ` | |

- Um administrador **é** um `user` existente promovido. Não há autenticação separada — o admin loga pelo fluxo normal (ADR 0005) e sua sessão é a mesma.
- **Promoção nesta rodada:** via SQL/seed manual (`INSERT INTO administrators ...`). Sem endpoint `POST /admin/admins`.
- **`AdminGuard`** (`identity/presentation/guards/admin.guard.ts`): roda **após** `SessionAuthGuard` (que já populou `request.user.userId`). Consulta `AdministratorReadRepository.findByUserId(userId)`. Se `null` → `ForbiddenException` (403). Se existe → anexa `request.admin = { id, role }` e libera. Não distingue `role` nesta rodada (qualquer linha em `administrators` autoriza).
- Uso: `@UseGuards(SessionAuthGuard, AdminGuard)` nos controllers `/admin/*`.
- `AdministratorReadRepository` lê da réplica (ADR 0003).

**Novo erro tipado:** `AdminAccessDeniedError` (`code = 'ADMIN_ACCESS_DENIED'`), mapeado a `403` no `DomainErrorFilter`. Mensagem estática, sem vazar se o user existe. (O guard pode lançar `ForbiddenException` do Nest diretamente; usar o erro tipado quando a negação vier de service.)

**Endpoint de status de admin (emenda 2026-08-29, gap MÉDIO #6):** `GET /auth/me/admin-status`, protegido por `@UseGuards(SessionAuthGuard, AdminGuard)`, no `IdentityController`. Retorna `200 { role: 'SUPER_ADMIN' }` se o user da sessão é admin; `403` (via `AdminGuard`) se não é; `401` se não há sessão. O frontend chama esse endpoint uma vez após o login e trata `403` como "não é admin" (esconde a área administrativa). O `GET /auth/me` **não muda** — `MeResponseDto`, `GetCurrentUser` e o use case ficam intactos, evitando acoplar identidade a `administrators` no caminho quente de toda requisição.

**FK `administrators.user_id` → `ON DELETE CASCADE` (decisão consciente, emenda 2026-08-29, gap BAIXO #9):** diferente de `login_attempts` (ADR 0005, `ON DELETE SET NULL` para auditoria), aqui a exclusão do user remove o vínculo de admin. Aceito: a lista de admins é operacional, não um registro de auditoria histórico; quem precisar de trilha de "quem já foi admin" adiciona uma tabela de auditoria dedicada num ADR futuro.

### Paginação (compartilhada)

`GET /assets`, `GET /markets`, `GET /admin/markets`:

- Query: `?limit=<1..100, default 20>&offset=<>=0, default 0>`.
- Resposta: `{ data: [...], pagination: { total, limit, offset } }`.
- Ordenação estável: `created_at ASC, symbol ASC` (markets) / `symbol ASC` (assets).
- `limit` fora de `1–100` ou `offset < 0` → `400` (via `ValidationPipe` + DTO com `class-validator`).

### Schema

> **Ordem de aplicação das migrations (emenda 2026-08-29, gap BAIXO #7):** o runner (`run-migration.script.ts`) aplica arquivos em ordem alfabética do nome, que começa com `Date.now()`. As 3 migrations DEVEM ser criadas nesta ordem (timestamps crescentes): **(1) `assets` → (2) `markets`** (FK `markets.base_asset/quote_asset → assets.symbol`) → **(3) `administrators`** (independe, referencia `users` que já existe). Ao criar os arquivos com `pnpm migration:create`, gerar um de cada vez para garantir o `Date.now()` monotônico.

```sql
-- Migration 1: create_assets_table
CREATE TABLE assets (
  symbol      VARCHAR(10) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  scale       SMALLINT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_assets_symbol_format CHECK (symbol ~ '^[A-Z0-9]{2,10}$'),
  CONSTRAINT chk_assets_scale_range   CHECK (scale BETWEEN 0 AND 18),
  CONSTRAINT chk_assets_status        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX idx_assets_status ON assets (status);  -- emenda 2026-08-29 (gap BAIXO #8): GET /assets?status= filtra por status

-- Seed inicial (mesma migration)
INSERT INTO assets (symbol, name, scale) VALUES
  ('BTC',  'Bitcoin',       8),
  ('BRL',  'Real',          2),
  ('USDT', 'Tether',        6),
  ('ETH',  'Ether',        18);
```

```sql
-- Migration 2: create_markets_table
CREATE TABLE markets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol              VARCHAR(21) NOT NULL,
  base_asset          VARCHAR(10) NOT NULL REFERENCES assets(symbol),
  quote_asset         VARCHAR(10) NOT NULL REFERENCES assets(symbol),
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  price_precision     SMALLINT NOT NULL,
  quantity_precision  SMALLINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_markets_status              CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT chk_markets_distinct_assets     CHECK (base_asset <> quote_asset),
  CONSTRAINT chk_markets_price_precision     CHECK (price_precision BETWEEN 0 AND 18),
  CONSTRAINT chk_markets_quantity_precision  CHECK (quantity_precision BETWEEN 0 AND 18)
);

CREATE UNIQUE INDEX idx_markets_symbol ON markets (symbol);
CREATE UNIQUE INDEX idx_markets_pair   ON markets (base_asset, quote_asset);
CREATE INDEX        idx_markets_status ON markets (status);
```

```sql
-- Migration 3: create_administrators_table
CREATE TABLE administrators (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL DEFAULT 'SUPER_ADMIN',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_administrators_role CHECK (role IN ('SUPER_ADMIN'))
);
```

### Rationale

**Por que tabela `administrators` separada e não `users.role`?**
Decisão do usuário (2026-08-28). Mantém a tabela `users` focada em identidade/autenticação; a lista de operadores da plataforma é pequena, auditável isoladamente e não polui todo `SELECT` de user. A coluna `role` já existe para evoluir sem nova migration estrutural.

**Por que `symbol` derivado e não enviado pelo cliente?**
Decisão do usuário. Impossível criar um market cujo `symbol` não corresponda aos assets. O cliente manda só `baseAsset`/`quoteAsset`.

**Por que criar `assets` agora e não adiar?**
Decisão do usuário. `markets.base_asset`/`quote_asset` são FK reais para `assets(symbol)`; a validação `market.pricePrecision ≤ quoteAsset.scale` exige o `scale` do asset. Sem o catálogo, `market` aceitaria pares com moedas inexistentes.

**Por que abordagem simples (sem use case / abstract repository)?**
`docs/architecture/04-quando-usar-clean-architecture.md` lista o caso explicitamente como simples. Não toca saldo, ledger, on-chain nem acesso de usuário final. Um bug aqui bloqueia configuração, não move valor. A autorização (que **é** segurança) fica em `identity`, que já é Clean Architecture.

**Por que `scale`/precisão como número de casas decimais e não tick/step size?**
Decisão do usuário; alinhado ao doc de domínio (`Integer`). Um valor em `bigint` de menor unidade com `scale = N` representa `valor / 10^N` unidades. `Order`/`Trade` no futuro guardam `bigint` e usam `pricePrecision`/`quantityPrecision` para validar o input do usuário e formatar a saída.

---

## Impacto nos Bounded Contexts (OBRIGATÓRIO)

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| `identity` | **Novo:** tabela `administrators`, `Administrator` (entidade leve), `AdministratorReadRepository` + impl PG, `AdminGuard`, `AdminAccessDeniedError`, entrada nova no `DomainErrorFilter` (`ADMIN_ACCESS_DENIED → 403`), endpoint `GET /auth/me/admin-status`. `IdentityModule` — que **hoje não tem bloco `exports`** — passa a exportar **`AdminGuard`, `AdministratorReadRepository`, `SessionAuthGuard`, `ValidateSession`** (emenda 2026-08-29, gap MÉDIO #5). Nenhuma mudança em `users`, `MeResponseDto`, `GetCurrentUser`, sessão ou login. | `market`/`asset` importam `IdentityModule` e usam `AdminGuard` via `@UseGuards`. |
| `financial` | Nenhum. `assets` **não** é referenciado por `financial` nesta rodada (o ADR 0006 de wallets/balances é independente e pode adotar a FK depois). Ver nota de coordenação de merge com a branch `feat/0006-wallet-balances` nas Consequências (gap BAIXO #10). | — |
| `bitcoin` | Nenhum (contexto ainda não existe). | — |
| `market` (novo) | Módulo inteiro novo. Depende de `asset` (validação de existência/status do asset + `scale` para a regra de precisão) e de `identity` (`AdminGuard`). | Import de `AssetReadRepository` (exportado por `AssetModule`; mesmo processo, mesmo DB) — sem evento nem ACL, pois é configuração síncrona e simples. **Dependência unidirecional `market → asset`** (emenda 2026-08-29 — `asset` deixou de depender de `market` ao tornar `scale` imutável). |
| `asset` (novo) | Módulo inteiro novo. Depende **só** de `identity` (`AdminGuard`). Exporta `AssetReadRepository`. Não conhece `market`. | — |

**Entidades de domínio afetadas:** `Asset` (nova), `Market` (nova), `Administrator` (nova, em `identity`).
**Interfaces de repositório afetadas:** `AssetRepository` / `AssetReadRepository` (novas), `MarketRepository` / `MarketReadRepository` (novas), `AdministratorReadRepository` (nova).
**Migrations necessárias:** sim — 3, nesta ordem: `assets` → `markets` → `administrators`.

---

## Checklist de Arquitetura (OBRIGATÓRIO)

- [x] Nenhum arquivo em `market/domain/` ou `asset/domain/` importa de `infrastructure/` ou `presentation/` — entidades são POJOs com factory methods; validação cross-agregado fica no service (application).
- [x] Valores monetários usam `BIGINT` / `bigint` — **N/A**: nenhum campo monetário nesta decisão. `scale`, `price_precision`, `quantity_precision` são `SMALLINT` (contagem de casas, `0–18`), representados como `number` no TS (não é dinheiro).
- [x] Erros de domínio são subclasses de `DomainError` — `SameAssetMarketError`, `InvalidPrecisionError`, `PrecisionExceedsAssetScaleError`, `AssetNotFoundError`, `AssetInactiveError`, `AssetAlreadyExistsError`, `InvalidAssetError`, `MarketNotFoundError`, `MarketAlreadyExistsError`, `AdminAccessDeniedError`. `AssetScaleLockedError` **removido** (emenda 2026-08-29 — `scale` imutável). Nenhum retorno `boolean`/`null` para falha de regra.
- [x] Operações multi-tabela usam `UnitOfWork` — **N/A**: toda operação escreve em exatamente uma tabela (`assets` OU `markets` OU `administrators`). A validação de `market` lê `assets` mas não escreve.
- [x] Sem dependência circular entre módulos (emenda 2026-08-29) — `market → asset` unidirecional; `asset` não importa nada de `market`; nenhum `forwardRef()`.
- [x] Entidades não recebem dependências de infraestrutura no construtor — `Asset`/`Market` recebem só dados primitivos.
- [x] Split réplica de leitura (ADR 0003) respeitado — `*ReadRepository` via `ReadQueryExecutor`, `*Repository` (escrita) via `QueryExecutor`.

---

## Plano de Implementação (OBRIGATÓRIO — na ordem)

> Emenda 2026-08-29 aplicada abaixo: `scale` imutável (sem `changeScale`, sem `AssetScaleLockedError`, sem dependência `asset → market`); rotas de market por `:base/:quote`; captura de `23505`; endpoint `GET /auth/me/admin-status`; exports explícitos; teste de convenção `XReadRepository`.

### 1. `identity` — autorização de administrador
- [ ] Migration `<ts>_create_administrators_table.sql` (a 3ª — timestamp > `markets`).
- [ ] `identity/domain/entities/administrator.entity.ts` — `Administrator` (`id`, `userId`, `role`, `createdAt`; `reconstitute` só, sem `create` — promoção é via SQL).
- [ ] `identity/domain/repositories/administrator-read.repository.ts` — abstract `AdministratorReadRepository { findByUserId(userId: string): Promise<Administrator | null> }`; adicionar ao `repositories/index.ts`. **Sem** método de mutação.
- [ ] `identity/domain/errors/admin-access-denied.error.ts` — `AdminAccessDeniedError extends DomainError`, `code = 'ADMIN_ACCESS_DENIED'`, mensagem estática.
- [ ] `identity/infrastructure/persistence/administrator.sql.ts` — `findAdministratorByUserIdQuery`.
- [ ] `identity/infrastructure/persistence/pg-administrator-read.repository.ts` — `extends AdministratorReadRepository`, usa `ReadQueryExecutor`.
- [ ] `identity/infrastructure/persistence/administrator.mapper.ts` — row → entidade.
- [ ] `identity/presentation/guards/admin.guard.ts` — `AdminGuard implements CanActivate`; injeta `AdministratorReadRepository`; lê `request.user?.userId` (se ausente → `ForbiddenException`, nunca `500`); `403` se não-admin; seta `request.admin = { id, role }`.
- [ ] `identity/presentation/authenticated-request.ts` — estender com `admin?: { id: string; role: string }`.
- [ ] `identity/presentation/identity.controller.ts` — novo `GET /auth/me/admin-status` com `@UseGuards(SessionAuthGuard, AdminGuard)`, retorna `{ role: request.admin.role }`. Response DTO `admin-status-response.dto.ts`.
- [ ] `identity.module.ts` — prover `AdministratorReadRepository` (useFactory + `ReadQueryExecutor`) e `AdminGuard`; **adicionar bloco `exports`** (não existe hoje) com: `AdminGuard`, `AdministratorReadRepository`, `SessionAuthGuard`, `ValidateSession`.
- [ ] `infrastructure/http/domain-error.filter.ts` — adicionar `ADMIN_ACCESS_DENIED: HttpStatus.FORBIDDEN` ao `STATUS_BY_CODE`.

### 2. Módulo `asset`
- [ ] Migration `<ts>_create_assets_table.sql` (a 1ª — menor timestamp) com tabela + `idx_assets_status` + seed BTC/BRL/USDT/ETH.
- [ ] `asset/domain/entities/asset.entity.ts` — `Asset` + `AssetStatus` (union type `'ACTIVE' | 'INACTIVE'`), factory `create`/`reconstitute`, `activate`/`deactivate`/`rename(name)`. **Sem `changeScale`** — `scale` é `readonly`, validado só em `create` (`0–18`). Valida `symbol` regex `^[A-Z0-9]{2,10}$`, `name` 1–100.
- [ ] `asset/domain/errors/` — `AssetNotFoundError` (404), `AssetAlreadyExistsError` (409), `AssetInactiveError` (422, usado por `market`), `InvalidAssetError` (422 — symbol/scale/name inválidos). **Sem `AssetScaleLockedError`.**
- [ ] `asset/domain/repositories/asset.repository.ts` — abstract write: `save(asset)`, `findBySymbol(symbol)` (para checagem de conflito no primary).
- [ ] `asset/domain/repositories/asset-read.repository.ts` — abstract read (**sem** `save`/`delete`/`update`): `findBySymbol(symbol)`, `list({ limit, offset, status? })`, `count({ status? })`.
- [ ] `asset/application/asset.service.ts` — `create` (checa `findBySymbol`; ao `save`, captura `23505` → `AssetAlreadyExistsError`), `updateName` (só `name`), `changeStatus`, `get` (404), `list` (monta `{ data, pagination }`).
- [ ] `asset/infrastructure/persistence/asset.sql.ts` + `pg-asset.repository.ts` (write, captura `error.code === '23505'` discriminando por `constraint === 'assets_pkey'`) + `pg-asset-read.repository.ts` (`ReadQueryExecutor`) + `asset.mapper.ts`.
- [ ] `asset/presentation/dtos/` — `create-asset.dto.ts`, `update-asset.dto.ts` (só `name`), `change-asset-status.dto.ts`, `list-assets-query.dto.ts` (`limit` `@IsInt @Min(1) @Max(100)`, `offset` `@IsInt @Min(0)`, `status?` `@IsIn(['ACTIVE','INACTIVE'])`), response DTOs — todos com `class-validator`.
- [ ] `asset/presentation/asset.controller.ts` (`GET /assets`, `GET /assets/:symbol`) + `admin-asset.controller.ts` (`@UseGuards(SessionAuthGuard, AdminGuard)`, `POST /admin/assets`, `PATCH /admin/assets/:symbol`, `PATCH /admin/assets/:symbol/status`).
- [ ] `asset/asset.module.ts` — importa `IdentityModule`; provê `AssetRepository`/`AssetReadRepository`/`AssetService`; **exporta `AssetReadRepository`**.
- [ ] `app.module.ts` — registrar `AssetModule`.

### 3. Módulo `market`
- [ ] Migration `<ts>_create_markets_table.sql` (a 2ª — timestamp entre `assets` e `administrators`) com FK para `assets`, `idx_markets_symbol`, `idx_markets_pair`, `idx_markets_status`.
- [ ] `market/domain/entities/market.entity.ts` — `Market` + `MarketStatus` (`'ACTIVE' | 'INACTIVE'`); `create` deriva `symbol = ` `` `${baseAsset}/${quoteAsset}` ``, valida `baseAsset !== quoteAsset` (`SameAssetMarketError`) e precisões inteiras `0–18` (`InvalidPrecisionError`), nasce `ACTIVE`; `activate`/`deactivate`/`changePrecisions({ pricePrecision?, quantityPrecision? })`. `baseAsset`/`quoteAsset`/`symbol` `readonly`.
- [ ] `market/domain/errors/` — `MarketNotFoundError` (404), `MarketAlreadyExistsError` (409), `SameAssetMarketError` (422), `InvalidPrecisionError` (422), `PrecisionExceedsAssetScaleError` (422).
- [ ] `market/domain/repositories/market.repository.ts` — abstract write: `save(market)`, `findBySymbol(symbol)`.
- [ ] `market/domain/repositories/market-read.repository.ts` — abstract read (**sem** mutação): `findByPair(base, quote)`, `list({ limit, offset, status? })`, `count({ status? })`.
- [ ] `market/application/market.service.ts` — injeta `MarketRepository`, `MarketReadRepository`, `AssetReadRepository`. `create`: `AssetReadRepository.findBySymbol` para base e quote → `AssetNotFoundError` / `AssetInactiveError`; `pricePrecision ≤ quoteAsset.scale` e `quantityPrecision ≤ baseAsset.scale` → `PrecisionExceedsAssetScaleError`; `Market.create(...)`; `save` capturando `23505` (`idx_markets_symbol`/`idx_markets_pair`) → `MarketAlreadyExistsError`. `changeStatus`, `changePrecisions` (recarrega assets, revalida contra `scale`), `getByPair` (404), `listPublic` (força `status='ACTIVE'`), `listAdmin` (status opcional).
- [ ] `market/infrastructure/persistence/market.sql.ts` + `pg-market.repository.ts` (captura `23505` por `constraint`) + `pg-market-read.repository.ts` (`ReadQueryExecutor`) + `market.mapper.ts`.
- [ ] `market/presentation/dtos/` — `create-market.dto.ts`, `change-market-status.dto.ts`, `change-precisions.dto.ts` (`@ValidateIf` — ao menos um campo), `list-markets-query.dto.ts`, response DTOs — com `class-validator`.
- [ ] `market/presentation/market.controller.ts` (`GET /markets`, `GET /markets/:base/:quote`) + `admin-market.controller.ts` (`@UseGuards(SessionAuthGuard, AdminGuard)`, `GET /admin/markets`, `POST /admin/markets`, `PATCH /admin/markets/:base/:quote/status`, `PATCH /admin/markets/:base/:quote/precisions`).
- [ ] `market/market.module.ts` — importa `IdentityModule` e `AssetModule`; provê repos + `MarketService`.
- [ ] `app.module.ts` — registrar `MarketModule` (depois de `AssetModule`).

### 4. Swagger / seed / operação
- [ ] `@ApiTags('Markets')` / `@ApiTags('Assets')` / `@ApiTags('Admin')` nos controllers; adicionar as tags ao `DocumentBuilder` em `main.ts`.
- [ ] Documentar no PR: como promover um admin (`INSERT INTO administrators (user_id, role) VALUES ('<uuid>', 'SUPER_ADMIN')`).

---

## Edge Cases & Erros de Domínio (OBRIGATÓRIO)

| Caso | Erro de domínio | HTTP | Comportamento decidido |
|------|----------------|------|------------------------|
| `GET /markets/:base/:quote` inexistente | `MarketNotFoundError` | 404 | Mensagem estática. |
| `GET /assets/:symbol` inexistente | `AssetNotFoundError` | 404 | Mensagem estática. |
| `POST /admin/markets` — corrida: 2 requests passam o pré-check e o 2º `save` viola `idx_markets_symbol`/`idx_markets_pair` | `MarketAlreadyExistsError` | 409 | Repositório de escrita captura `error.code === '23505'` e converte no erro tipado (emenda 2026-08-29, gap MÉDIO #3). Nunca vaza erro cru de `pg` (500). |
| `POST /admin/assets` — corrida na PK `assets_pkey` | `AssetAlreadyExistsError` | 409 | Idem — captura de `23505`. |
| `POST /admin/markets` com `baseAsset == quoteAsset` | `SameAssetMarketError` | 422 | Validado na entidade. |
| `POST /admin/markets` com asset inexistente | `AssetNotFoundError` | 422 | Diz qual símbolo faltou (não é dado sensível). |
| `POST /admin/markets` com asset `INACTIVE` | `AssetInactiveError` | 422 | Não permite criar par sobre ativo desativado. |
| `POST /admin/markets` par `(base, quote)` já existe | `MarketAlreadyExistsError` | 409 | Idempotência não assumida — segunda chamada falha. |
| `pricePrecision > quoteAsset.scale` (ou quantity > base.scale) | `PrecisionExceedsAssetScaleError` | 422 | Vale para `POST` e `PATCH /precisions`. |
| precisão fora de `0–18` ou não inteira | `InvalidPrecisionError` (dom.) / `400` (DTO) | 400/422 | `ValidationPipe` pega antes; entidade é a segunda linha de defesa. |
| `POST /admin/assets` symbol já existe | `AssetAlreadyExistsError` | 409 | |
| `POST /admin/assets` symbol fora do regex / `scale` inválido | `InvalidAssetError` / `400` | 400/422 | |
| `PATCH /admin/assets/:symbol` tentando alterar `scale` | — | 400 | `scale` não está no `UpdateAssetDto`; `forbidNonWhitelisted` do `ValidationPipe` rejeita o campo. `scale` é imutável (emenda 2026-08-29). |
| `PATCH .../status` com valor fora do enum | — | 400 | `ValidationPipe` + DTO. |
| `PATCH /admin/markets/:base/:quote/precisions` sem nenhum campo | — | 400 | DTO exige ao menos um. |
| Requisição a `/admin/*` sem sessão | — | 401 | `SessionAuthGuard` (existente). |
| Requisição a `/admin/*` com sessão de user não-admin | `AdminAccessDeniedError` / `ForbiddenException` | 403 | `AdminGuard`. Mensagem não revela se o recurso existe. |
| `GET /auth/me/admin-status` como user não-admin | — | 403 | `AdminGuard`. Frontend trata `403` como "não é admin". |
| Requisição mutante a `/admin/*` sem CSRF token | — | 403 | `SessionAuthGuard` já cobre (ADR 0004). |
| `limit`/`offset` inválidos | — | 400 | DTO com `@IsInt`, `@Min`, `@Max`. |
| admin promovido é depois deletado (`users` DELETE) | — | — | `ON DELETE CASCADE` remove a linha de `administrators` automaticamente (decisão consciente — gap BAIXO #9). |
| `GET /markets/:base/:quote` com `base == quote` | `MarketNotFoundError` | 404 | Nunca existe market assim (constraint); trata como não encontrado. |

---

## Plano de Teste (OBRIGATÓRIO)

**Unit — entidade `Asset`:**
- [ ] `create` normaliza/valida symbol (rejeita minúsculo, `>10`, chars inválidos), `scale` 0–18 (rejeita `-1`, `19`, `2.5`), `name` 1–100.
- [ ] `deactivate`/`activate` alteram status; `rename` altera nome; `updatedAt` muda.
- [ ] entidade **não** expõe `changeScale` nem qualquer setter de `scale` (imutável).

**Unit — entidade `Market`:**
- [ ] `create` deriva `symbol = 'BTC/BRL'` de `base='BTC'`, `quote='BRL'`.
- [ ] `create` lança `SameAssetMarketError` para `base == quote`.
- [ ] `create` lança `InvalidPrecisionError` para precisão `-1`, `19`, não inteira.
- [ ] `create` seta status `ACTIVE`.
- [ ] `activate`/`deactivate` alternam nos dois sentidos.
- [ ] `changePrecisions` aceita parcial (só price, só quantity).

**Unit — `AssetService` (repos mockados):**
- [ ] `create` → `AssetAlreadyExistsError` se `findBySymbol` retorna asset.
- [ ] `create` → `AssetAlreadyExistsError` quando `save` rejeita com `{ code: '23505' }` (corrida) — gap #3.
- [ ] `updateName` altera só `name`; nenhum caminho toca `scale`.
- [ ] `list` repassa `limit`/`offset`/`status` e monta `{ data, pagination }`.

**Unit — `MarketService` (repos mockados):**
- [ ] `create` → `AssetNotFoundError` quando `AssetReadRepository.findBySymbol` retorna `null`.
- [ ] `create` → `AssetInactiveError` para asset `INACTIVE`.
- [ ] `create` → `PrecisionExceedsAssetScaleError` quando `pricePrecision > quoteAsset.scale`.
- [ ] `create` → `MarketAlreadyExistsError` quando `findBySymbol` do pré-check retorna market.
- [ ] `create` → `MarketAlreadyExistsError` quando `save` rejeita com `{ code: '23505' }` (corrida) — gap #3.
- [ ] `create` feliz: persiste, retorna com `symbol` derivado.
- [ ] `changePrecisions` revalida contra `scale` (falha se exceder).
- [ ] `listPublic` filtra só `ACTIVE`; `listAdmin` não filtra.

**Unit — convenção `XReadRepository` sem mutação (padrão ADR 0003, gap #4):**
- [ ] `AssetReadRepository`, `MarketReadRepository`, `AdministratorReadRepository` — `Object.getOwnPropertyNames(prototype)` não contém `save`/`delete`/`update` (um spec por repo, como os `PgXReadRepository` existentes de `financial`/`identity`).

**Unit — `AdminGuard` (mock `AdministratorReadRepository`):**
- [ ] user com linha em `administrators` → `true`, `request.admin` populado.
- [ ] user sem linha → `ForbiddenException`.
- [ ] `request.user` ausente (guard fora de ordem) → `ForbiddenException` (não `500`).

**Integração (banco real):**
- [ ] Migrations aplicam; seed de `assets` cria 4 linhas.
- [ ] `POST /admin/markets` autenticado como admin → `201`, linha em `markets`, `symbol` único.
- [ ] `POST /admin/markets` como user comum → `403`.
- [ ] `POST /admin/markets` sem sessão → `401`.
- [ ] `GET /markets` retorna só `ACTIVE`, com envelope `{ data, pagination }`, respeita `limit`/`offset`.
- [ ] `GET /markets/BTC/BRL` → `200`; `GET /markets/BTC/XXX` inexistente → `404`.
- [ ] FK: `POST /admin/markets` com `baseAsset` inexistente → `422` (não estoura erro de constraint cru).
- [ ] Unicidade `(base, quote)`: segunda criação → `409` (`MarketAlreadyExistsError`, não 500).
- [ ] `PATCH /admin/assets/:symbol` com `{ scale: 4 }` no body → `400` (`forbidNonWhitelisted`).
- [ ] `GET /auth/me/admin-status` como admin → `200 { role }`; como user comum → `403`; sem sessão → `401`.
- [ ] `PATCH /admin/markets/BTC/BRL/status` `{ status: 'INACTIVE' }` como admin → `200`; depois `GET /markets` não lista mais BTC/BRL.

**Negativo/regressão:**
- [ ] Suíte `identity` e `financial` existentes continuam verdes (mudança no `DomainErrorFilter` e no `IdentityModule` não quebra nada).
- [ ] Endpoint sem `class-validator` não fica exposto (lição do ADR 0005 — todo DTO novo tem decorators).

---

## Fluxos (se aplicável)

```
Criar mercado BTC/BRL (admin):
1. POST /admin/markets { baseAsset: "BTC", quoteAsset: "BRL", pricePrecision: 2, quantityPrecision: 8 }
   → SessionAuthGuard: sessão válida + CSRF ok
   → AdminGuard: administrators tem linha para o user → request.admin
2. MarketService.create
   → AssetReadRepository.findBySymbol("BTC") → ACTIVE, scale 8
   → AssetReadRepository.findBySymbol("BRL") → ACTIVE, scale 2
   → pricePrecision(2) ≤ BRL.scale(2) ✓ ; quantityPrecision(8) ≤ BTC.scale(8) ✓
   → MarketRepository.findBySymbol("BTC/BRL") → null (não existe)
   → Market.create(...) deriva symbol "BTC/BRL", status ACTIVE
   → MarketRepository.save(market) — se violar 23505, converte em MarketAlreadyExistsError (409)
3. 201 { id, symbol: "BTC/BRL", baseAsset, quoteAsset, status: "ACTIVE", pricePrecision, quantityPrecision }

Listar mercados (público):
1. GET /markets?limit=20&offset=0
   → sem guard
2. MarketReadRepository.list({ limit: 20, offset: 0, status: 'ACTIVE' }) + count
3. 200 { data: [...], pagination: { total, limit: 20, offset: 0 } }

Detalhe de mercado (público):
1. GET /markets/BTC/BRL   (dois segmentos de path — sem %2F)
2. MarketReadRepository.findByPair("BTC", "BRL") → market | null
3. 200 { ... } | 404 MarketNotFoundError

Frontend descobre se é admin:
1. GET /auth/me/admin-status   (SessionAuthGuard + AdminGuard)
2. admin → 200 { role: "SUPER_ADMIN" } ; não-admin → 403 ; sem sessão → 401
```

---

## Consequências

**Positivas:**
- Catálogo de ativos e pares de mercado passam a existir — desbloqueiam order book, matching engine e validação de `Order`.
- Autorização por papel entra no sistema de forma mínima e reutilizável (`AdminGuard`) — próximos endpoints administrativos (taxas, limites de saque, KYC review) reutilizam.
- `symbol` derivado + FK + constraints de banco tornam estados inconsistentes impossíveis mesmo com bug na aplicação.
- Módulos simples: baixo custo de implementação e manutenção, coerente com o critério documentado.

**Negativas / Trade-offs:**
- Escopo desta rodada é grande (3 módulos/áreas, 3 migrations). Mitigado pela simplicidade de cada peça (CRUD).
- `AdminGuard` sem granularidade de `role` — quando surgir um segundo papel, será preciso um decorator `@RequireRole`, re-tocar os controllers **e uma migration** para alterar `chk_administrators_role` (corrigido de "só código" na emenda 2026-08-29).
- `market` importa `AssetModule` diretamente (acoplamento de módulos no mesmo processo) em vez de comunicação por evento/ACL. Aceito para configuração síncrona; se `asset` virar serviço separado no futuro, vira chamada HTTP/ACL. Dependência unidirecional (`market → asset`) — sem `forwardRef`.
- `scale` do asset é **imutável** após a criação. Corrigir um `scale` errado exige desativar o asset e cadastrar outro símbolo. Aceito (mudar `scale` retroativamente reinterpreta todo valor `bigint` já gravado — é perigoso por natureza). Trade-off tomado para eliminar a dependência circular `asset ↔ market`.
- Detecção de admin no frontend via endpoint dedicado `GET /auth/me/admin-status` (não campo no `/auth/me`) — o front paga 1 request extra após o login, mas `identity` não passa a consultar `administrators` no caminho quente de toda requisição autenticada.
- Precisões/status de market alteráveis livremente hoje; quando o matching engine existir, precisará de novas regras (ordens abertas). Débito explícito para o ADR do matching engine.
- Frontend precisará distinguir admin de user comum (rota protegida + estado de auth) — impacto anotado abaixo, detalhado no plano do `/task-planner`.
- Colisão de merge com `feat/0006-wallet-balances` (gap BAIXO #10): ambas as branches editam `src/app.module.ts` (lista de `imports`) e adicionam migrations no mesmo diretório. Mitigação: quem mergear por último rebaseia sua branch; ao criar as migrations do 0007, conferir que os timestamps `Date.now()` são maiores que os já existentes na `main` no momento do merge (senão renomear os arquivos). Sem mudança de design.

**Impacto no frontend (mybitcoin-front) — fora do escopo deste ADR, para o `/task-planner` / ADR-front:**
- Consumir `GET /auth/me/admin-status` após o login: `200` → habilita área admin; `403` → esconde. (Endpoint definido e implementado por este ADR na API.)
- Página pública de listagem de mercados consumindo `GET /markets` (paginada, `limit`/`offset`).
- Área admin: gestão de mercados (`POST`/`PATCH .../status`/`PATCH .../precisions` em `/admin/markets/:base/:quote`) e de ativos (`POST /admin/assets`, `PATCH /admin/assets/:symbol` só nome, `PATCH .../status`), com guarda de rota pelo resultado do `GET /auth/me/admin-status`.

---

## Decisões do Usuário (rastreabilidade)

> Confirmadas no grelhamento (Passo 2 da skill `/adr-architect`), 2026-08-28.

- 2026-08-28 — Recorte do domínio nesta rodada → **Market (pares de negociação)**, ampliado nas respostas seguintes para incluir catálogo de ativos e autorização de admin.
- 2026-08-28 — Representação monetária → **`bigint` / inteiro (seguir `CLAUDE.md`)**; precisões são contagem de casas decimais, não dinheiro.
- 2026-08-28 — Escopo → **API + Frontend** (frontend planejado à parte).
- 2026-08-28 — Ator das operações de escrita → **admin autenticado**.
- 2026-08-28 — Operações de escrita de Market → **criar, ativar/inativar, atualizar precisões**; além de listar/detalhar (leitura pública).
- 2026-08-28 — Telas de frontend → **lista pública de mercados + tela admin de gestão**.
- 2026-08-28 — Validação de `baseAsset`/`quoteAsset` → **criar tabela `assets` nesta rodada** (catálogo real).
- 2026-08-28 — Modelo de admin → **tabela `administrators` separada, com coluna `role`** (não coluna em `users`).
- 2026-08-28 — `symbol` de market → **derivado: `baseAsset + '/' + quoteAsset`**.
- 2026-08-28 — Status de market → **nasce `ACTIVE`; `ACTIVE ↔ INACTIVE` livre nos dois sentidos**; sem `DELETE`.
- 2026-08-28 — Estrutura `administrators` → **`administrators(id, user_id UNIQUE FK→users, role, created_at)`; promoção via SQL/seed manual** (sem endpoint de gestão de admins nesta rodada).
- 2026-08-28 — `assets` → **CRUD completo de administrador nesta rodada** (`POST`/`PATCH`), além de leitura pública.
- 2026-08-28 — Semântica de precisão → **número de casas decimais, inteiro `0–18`**.
- 2026-08-28 — `GET /markets` público → **somente `ACTIVE`, com paginação desde já**.
- 2026-08-28 — `assets` tem **status `ACTIVE`/`INACTIVE`**; desativar asset **não** cascateia em markets, mas bloqueia criar novos.
- 2026-08-28 — `asset.scale` → **casas decimais máximas do ativo**; impõe `market.quantityPrecision ≤ baseAsset.scale` e `market.pricePrecision ≤ quoteAsset.scale`.
- 2026-08-28 — Paginação → **`limit`/`offset`, default 20, máx 100**.
- 2026-08-28 — `role` → **enum `{'SUPER_ADMIN'}`; `AdminGuard` exige apenas existência de linha em `administrators`** (qualquer role autoriza).

> Confirmadas no grelhamento da **emenda pós-Estágio 2**, 2026-08-29:

- 2026-08-29 — Gap ALTO #1 (circularidade `asset ↔ market`) → **`scale` do asset é imutável após a criação**. Remover `changeScale` e `AssetScaleLockedError`. `PATCH /admin/assets/:symbol` edita só `name`. Dependência unidirecional `market → asset`.
- 2026-08-29 — Gap ALTO #2 (`symbol` com `/` no path) → **rotas de market por `:base/:quote`** (dois segmentos). `symbol` continua como campo/coluna derivada, nunca em path de URL.
- 2026-08-29 — Gap MÉDIO #6 (admin no frontend) → **endpoint dedicado `GET /auth/me/admin-status`** (`SessionAuthGuard` + `AdminGuard`, `200`/`403`). `GET /auth/me` e `MeResponseDto` **não mudam**.
- 2026-08-29 — Gap BAIXO #9 (`administrators.user_id` FK) → **manter `ON DELETE CASCADE`** (decisão consciente; lista operacional, não trilha de auditoria).
- 2026-08-29 — Gaps BAIXO #7, #8, #10 → **corrigir os três na emenda** (ordem das migrations fixada no plano; `idx_assets_status` + texto do trade-off de `role`; nota de coordenação de merge com `feat/0006-wallet-balances`).
- 2026-08-29 — Gaps MÉDIO #3, #4, #5 → endereçados: captura de `23505` → `*AlreadyExistsError`; teste de convenção `XReadRepository` sem mutação; `exports` explícitos de `IdentityModule` (novo bloco) e `AssetModule`.

---

## Referências

- ADR 0001 — Padrão UnitOfWork para atomicidade
- ADR 0003 — Réplica de leitura PostgreSQL (`XRepository` / `XReadRepository`)
- ADR 0004 — Transporte de sessão via cookie, CSRF, `DomainErrorFilter`
- ADR 0005 — Login/Logout, `ValidationPipe` global, lição dos DTOs sem `class-validator`
- `docs/bussiness/03-modelo-de-dominio.md` — entidades `Market`, `Balance`, invariantes
- `docs/bussiness/05-mercados-de-negociacao.md`, `06-order-book.md`, `07-matching-engine.md` — consumidores futuros de `Market`
- `docs/architecture/04-quando-usar-clean-architecture.md` — critério CA vs simples

---

## Validação (Estágio 2) — 2026-08-29

**Veredito:** 🔁 **REVISAR** — 2 gaps ALTO, 4 MÉDIO, 4 BAIXO.

Impacto re-derivado do codebase (não do ADR): `src/app.module.ts:1-19` (registra módulos), `src/main.ts:26-33` (`ValidationPipe` global), `src/infrastructure/http/domain-error.filter.ts:10-22` (`STATUS_BY_CODE`), `src/infrastructure/database/database.module.ts` (`@Global`, exporta `QueryExecutor`/`ReadQueryExecutor`), `src/modules/identity/identity.module.ts` (**sem `exports`** hoje), `src/modules/identity/presentation/guards/session-auth.guard.ts` (padrão de guard que lança exceção Nest), ADR 0003 §"Repositório de leitura" + linha 364 (teste de convenção `XReadRepository` sem mutação é padrão obrigatório), ADR 0005 emenda (`login_attempts` usa `ON DELETE SET NULL` para preservar auditoria), ADR 0006 em progresso na branch `feat/0006-wallet-balances` (mexe em `app.module.ts` e no diretório de migrations).

### Gaps

| # | Sev. | Gap | Evidência | Correção exigida |
|---|------|-----|-----------|------------------|
| 1 | ALTO | **Dependência circular entre módulos `asset` e `market`.** Plano item 2 (`asset.service.updateDetails`) injeta `MarketReadRepository` para bloquear mudança de `scale` quando há markets; plano item 3 (`market.service`) injeta `AssetReadRepository`. `MarketModule` importa `AssetModule` e vice-versa → NestJS só resolve com `forwardRef()` (frágil, nenhum precedente no repo — `grep forwardRef src/` = 0). | ADR seção "Módulo `asset`" nota de rodapé + Plano itens 2 e 3; `docs/architecture/03` "cada módulo é autocontido". | Escolher uma: **(a)** tornar `scale` imutável após criação (remove `changeScale` e `AssetScaleLockedError`, remove a dependência `asset → market`); **(b)** `market` publica/expõe a checagem e `asset` NÃO conhece `market` — ex.: a rota de PATCH de scale vive no módulo `market` ou um `AdminModule` agregador; **(c)** `market` define no próprio domínio uma porta `AssetCatalogReadPort` (implementada por adapter que delega ao `asset`), e `asset` idem, quebrando o acoplamento a tipos concretos. Registrar a decisão. |
| 2 | ALTO | **`symbol` com `/` na rota `GET /markets/:symbol`.** `BTC/BRL` na URL exige `%2F`; Express/path-to-regexp tratam `:symbol` como um único segmento e o comportamento com `%2F` codificado é ambíguo/quebra o match de rota. A tabela de Edge Cases só diz "documentar". | ADR "Módulo `market`" tabela de operações + Edge Cases (linha "symbol na URL com `/`"). | Trocar o esquema de lookup público por um que não coloca `/` no path: **(a)** `GET /markets/:base/:quote`; **(b)** `GET /markets?symbol=BTC/BRL` (query string); ou **(c)** persistir também um `slug` (`BTC-BRL`) e usar ele na rota. Ajustar entidade/DTO/testes/plano de frontend. |
| 3 | MÉDIO | **TOCTOU na unicidade (check-then-insert).** `create` faz `findBySymbol → null → save`; sob concorrência, dois requests passam a checagem e o 2º INSERT viola `idx_markets_symbol`/`idx_markets_pair`/`assets_pkey`/`administrators_user_id_key`, estourando erro cru de `pg` (→ 500), não `MarketAlreadyExistsError`/`AssetAlreadyExistsError` (→ 409). Não há passo no plano nem teste para mapear `code === '23505'` ao erro tipado. | Plano itens 2 e 3 (`create`), Edge Cases (409), Schema (índices UNIQUE). | Repositório de escrita deve capturar violação de unique (`error.code === '23505'`, discriminando por `constraint`) e lançar o `*AlreadyExistsError` correspondente; adicionar teste de integração de corrida (ou ao menos teste que simula o 23505). Vale para `markets`, `assets` e `administrators` (se vier seed programático). |
| 4 | MÉDIO | **Teste de convenção `XReadRepository` sem métodos de mutação ausente.** ADR 0003 (linha 364) tornou obrigatório um teste (`Object.getOwnPropertyNames` do prototype) garantindo que nenhum `*ReadRepository` expõe `save`/`delete`/`update`. O plano de teste do 0007 não inclui isso para `AssetReadRepository`, `MarketReadRepository`, `AdministratorReadRepository`. | ADR 0003 §"Plano de Implementação" item de infra; Plano de Teste do 0007. | Adicionar ao Plano de Teste: spec de convenção para cada um dos 3 novos read repos. |
| 5 | MÉDIO | **Exports de módulo não especificados.** `MarketModule` injeta `AssetReadRepository` (de `AssetModule`) e o `AdminGuard` (de `IdentityModule`); `AssetModule` injeta `AdminGuard`. Sem `exports` explícitos em `AssetModule`/`IdentityModule`, o Nest não resolve — e `identity.module.ts` hoje **não tem bloco `exports`**. O plano diz "provê repos + service" / "exportar ambos" de forma vaga. | `src/modules/identity/identity.module.ts` (sem `exports`); Plano itens 1, 2, 3. | Plano deve listar exatamente: `IdentityModule` exporta `AdminGuard`, `AdministratorReadRepository`, `SessionAuthGuard`, `ValidateSession`; `AssetModule` exporta `AssetReadRepository`. Confirmar que `SessionAuthGuard` exportado arrasta suas deps (senão exportar `ValidateSession`/`SessionRepository` também). |
| 6 | MÉDIO | **Detecção de admin no frontend em aberto.** ADR empurra "como o front sabe que o user é admin" para "planner/ADR-front", mas a Etapa 8 da pipeline (frontend, tela admin com guarda de rota) depende disso. `MeResponseDto` (`me-response.dto.ts`) não tem `role`/`isAdmin` e o `GetCurrentUser` use case (`get-current-user.usecase.ts`) nem lê `administrators`. | ADR seção "Impacto no frontend"; `src/modules/identity/presentation/dto/me-response.dto.ts`, `src/modules/identity/application/get-current-user.usecase.ts`. | Decidir agora (mesmo que a implementação seja pequena): adicionar `isAdmin: boolean` (e/ou `role`) ao `GET /me`, o que exige `GetCurrentUser` consultar `AdministratorReadRepository`. Incluir no Plano de Implementação item 1 e no Plano de Teste, OU registrar decisão explícita de que vai para um ADR-front separado e a Etapa 8 fica bloqueada até lá. |
| 7 | BAIXO | **Ordem das migrations não garantida.** O runner aplica em ordem alfabética de filename (`run-migration.script.ts` `getMigrationFiles().sort()`), e os nomes começam com `Date.now()`. `markets` (FK → `assets`) precisa de timestamp > `assets`; `administrators` independe. Não explicitado. | `src/infrastructure/database/scripts/run-migration.script.ts`. | Plano deve fixar a ordem de criação: `assets` → `markets` (e qualquer ordem para `administrators`), com nota para conferir os timestamps. |
| 8 | BAIXO | **`idx_assets_status` ausente e `CHECK (role IN ('SUPER_ADMIN'))` subestimado.** `GET /assets?status=` filtra por status sem índice (assimétrico com `idx_markets_status`). Trade-off do ADR diz que adicionar papel é "só código" — na verdade exige migration para alterar o `CHECK`. | Schema (migrations 1 e 3); seção "Consequências". | Adicionar `idx_assets_status` (ou justificar a omissão por tabela pequena). Corrigir o texto do trade-off. |
| 9 | BAIXO | **`ON DELETE CASCADE` em `administrators.user_id` diverge do padrão de auditoria.** ADR 0005 escolheu `ON DELETE SET NULL` em `login_attempts` para preservar histórico. Apagar um user apaga silenciosamente o registro de que ele foi admin. | ADR 0005 emenda 2026-08-03; Schema migration 3. | Decisão consciente: manter CASCADE (aceito) ou trocar por `SET NULL` + `user_id` nullable, ou registrar admins removidos em tabela de auditoria. Registrar em "Decisões do Usuário". |
| 10 | BAIXO | **Colisão provável com a branch do ADR 0006.** `feat/0006-wallet-balances` também edita `src/app.module.ts` (registro de módulo) e adiciona migrations. Merge das duas branches vai conflitar. | `git log --all` mostra ADR 0006 "Em Progresso"; ADR 0006 no diretório de `.claude/worktrees/adr-0006-wallet-balances`. | Nota operacional no ADR: quem mergear por último rebaseia; timestamps de migration não podem colidir. Sem mudança de design. |

### Cobertura dos checklists

- **A. Regra de Dependência:** GAP #1 (circular). Cross-module domain import (`market` → `asset/domain`) tolerável se resolvido via porta (parte da correção #1). Guards na apresentação: OK.
- **B. DDD:** OK — aggregates `Asset`/`Market` protegem invariantes próprias (`baseAsset≠quoteAsset`, faixa de precisão); validação cross-agregado corretamente no service; erros tipados listados. `MarketStatus`/`AssetStatus` como VO vs union deixado em aberto (BAIXO, decidir na implementação).
- **C. Precisão monetária:** N/A confirmado — nenhum campo monetário; `SMALLINT`/`number` para contagem de casas é correto.
- **D. Atomicidade (ADR 0001):** OK — cada operação escreve uma tabela; `UnitOfWork` corretamente dispensado. Ressalva: GAP #3 (unicidade sob concorrência é problema de erro, não de atomicidade).
- **E. Schema:** GAPs #7, #8, #9. `VARCHAR(21)` para symbol, FKs e `CHECK`s coerentes. `idx_markets_pair` cobre a unicidade do par.
- **F. Edge cases:** GAP #2 (routing). Restante bem coberto (inexistente/duplicado/inativo/403/401/CSRF). Idempotência explicitamente recusada — OK.
- **G. Plano de teste:** GAPs #3, #4. Boa cobertura de unit + integração com banco real. Falta teste de convenção e de corrida.
- **H. Plano de implementação:** ordem geral (identity → asset → market, domain→app→infra→presentation) correta; quebra pela circularidade #1 (asset/app referencia market/infra antes de existir). GAP #5 (exports).

### Próximo passo

Rode `/adr-architect` para amendar o ADR 0007 endereçando **#1 e #2 (ALTO, bloqueantes)** e **#3–#6 (MÉDIO)**. #7–#10 (BAIXO) podem ser aceitos com decisão explícita do usuário registrada em "Decisões do Usuário", ou corrigidos na mesma emenda. Depois, re-valide.

---

## Emenda (pós-Estágio 2) — 2026-08-29

Emenda aplicada pelo `/adr-architect` endereçando os gaps do Estágio 2. As seções "Decisão", "Schema", "Impacto nos Bounded Contexts", "Checklist de Arquitetura", "Plano de Implementação", "Edge Cases", "Plano de Teste", "Fluxos", "Consequências" e "Decisões do Usuário" foram atualizadas inline (marcadores "emenda 2026-08-29").

| Gap | Sev. | Status | O que mudou |
|---|---|---|---|
| 1 — circularidade `asset ↔ market` | ALTO | Corrigido | `scale` do asset **imutável** após criação. Removidos `changeScale` e `AssetScaleLockedError`. `PATCH /admin/assets/:symbol` edita só `name`. `asset.service` não injeta mais `MarketReadRepository`. Dependência unidirecional `market → asset`; item novo no Checklist ("sem dependência circular / sem `forwardRef`"). |
| 2 — `symbol` com `/` no path | ALTO | Corrigido | Rotas de market passam a usar `:base/:quote` (dois segmentos): `GET /markets/:base/:quote`, `PATCH /admin/markets/:base/:quote/status`, `.../precisions`. `symbol` (`"BASE/QUOTE"`) segue como campo derivado e coluna `UNIQUE`, nunca em path. `market-read.repository` expõe `findByPair(base, quote)`. |
| 3 — TOCTOU na unicidade | MÉDIO | Corrigido | `pg-asset.repository`/`pg-market.repository` (write) capturam `error.code === '23505'` discriminando por `constraint` e lançam `AssetAlreadyExistsError`/`MarketAlreadyExistsError` (409). Edge Cases e Plano de Teste (unit com `save` rejeitando `{ code: '23505' }` + integração de segunda criação → 409). |
| 4 — teste de convenção `XReadRepository` | MÉDIO | Corrigido | Plano de Teste ganhou spec de convenção (`Object.getOwnPropertyNames` do prototype) para `AssetReadRepository`, `MarketReadRepository`, `AdministratorReadRepository` — padrão do ADR 0003. Interfaces read explicitamente "sem `save`/`delete`/`update`" no plano. |
| 5 — exports de módulo | MÉDIO | Corrigido | Plano item 1: `identity.module.ts` ganha **bloco `exports` novo** (não existe hoje) com `AdminGuard`, `AdministratorReadRepository`, `SessionAuthGuard`, `ValidateSession`. Plano item 2: `asset.module.ts` **exporta `AssetReadRepository`**. Refletido no "Impacto nos Bounded Contexts". |
| 6 — admin no frontend | MÉDIO | Corrigido | Novo endpoint `GET /auth/me/admin-status` no `IdentityController` (`@UseGuards(SessionAuthGuard, AdminGuard)`), `200 { role }` / `403` / `401`. `GET /me`, `MeResponseDto`, `GetCurrentUser` **intactos**. Impacto no frontend reescrito para consumir esse endpoint. |
| 7 — ordem das migrations | BAIXO | Corrigido | Nota no Schema + Plano: criar as migrations uma a uma, timestamps crescentes, ordem `assets` → `markets` → `administrators` (FK). |
| 8 — `idx_assets_status` + texto do `role` | BAIXO | Corrigido | `CREATE INDEX idx_assets_status` adicionado à migration 1. Trade-off do `AdminGuard` corrigido: novo `role` exige migration para alterar `chk_administrators_role`, não "só código". |
| 9 — FK `administrators.user_id` | BAIXO | Aceito (CASCADE) | Decisão consciente registrada em "Autorização de administrador" e em "Decisões do Usuário": mantém `ON DELETE CASCADE`; trilha de "quem já foi admin" fica para tabela de auditoria dedicada num ADR futuro. |
| 10 — colisão de merge com ADR 0006 | BAIXO | Corrigido | Nota operacional nas Consequências: rebase da branch que mergear por último; conferir timestamps das migrations contra a `main` no momento do merge. |

**Próximo passo:** rode `/adr-validator` novamente sobre `0007-market-and-asset-catalog.md` para confirmar que os gaps foram endereçados antes de `/adr-executor`.

---

## Validação (Estágio 2, 2ª rodada) — 2026-08-29

**Veredito:** ✅ **APROVA** — os 2 gaps ALTO e os 4 MÉDIO da 1ª rodada foram confirmados corrigidos (não só citados). 1 correção factual de rota foi aplicada nesta passada; 2 observações BAIXO ficam para a implementação.

### Confirmação dos gaps da 1ª rodada

| # (1ª rodada) | Sev. | Verificação independente | Resultado |
|---|---|---|---|
| 1 — circularidade `asset ↔ market` | ALTO | `Asset` (linha 58) não tem mais `changeScale`; nota linha 59 marca `scale` `readonly`. `asset.service` (Plano item 2) injeta só repos de `asset`; `asset.module` importa só `IdentityModule` e **exporta `AssetReadRepository`** para `market` consumir. `market.module` importa `IdentityModule` + `AssetModule`. Grafo de import: `market → asset`, `market → identity`, `asset → identity` — **acíclico**. Nenhum `forwardRef` (Plano + Checklist linha nova). | ✅ Eliminada |
| 2 — `symbol` com `/` no path | ALTO | Rotas por `:base/:quote` propagadas de forma consistente: tabela de Operações (linhas 97, 100, 101), Plano item 3 (controllers), Edge Cases (linha "GET /markets/:base/:quote"), Plano de Teste (`GET /markets/BTC/BRL`), Fluxos ("Detalhe de mercado"). `market-read.repository` expõe `findByPair(base, quote)`. `symbol` permanece como coluna `UNIQUE` derivada, fora de qualquer path. `@Get(':base/:quote')` é padrão path-to-regexp válido (dois segmentos), sem a ambiguidade de `%2F`. | ✅ Corrigido e propagado |
| 3 — TOCTOU na unicidade | MÉDIO | Plano itens 2 e 3: `pg-asset.repository`/`pg-market.repository` capturam `error.code === '23505'` discriminando por `constraint` → `*AlreadyExistsError`. Edge Cases: 2 linhas novas de corrida. Plano de Teste: unit com `save` rejeitando `{ code: '23505' }` (asset e market) + integração "segunda criação → 409 (não 500)". | ✅ Corrigido |
| 4 — teste de convenção `XReadRepository` | MÉDIO | Plano de Teste, bloco "convenção `XReadRepository` sem mutação": spec `Object.getOwnPropertyNames` para os 3 read repos, citando o padrão do ADR 0003. Interfaces read marcadas "**sem** `save`/`delete`/`update`" no Plano itens 1–3. | ✅ Corrigido |
| 5 — exports de módulo | MÉDIO | Plano item 1: `identity.module.ts` — "**adicionar bloco `exports`** (não existe hoje)" com `AdminGuard`, `AdministratorReadRepository`, `SessionAuthGuard`, `ValidateSession`. Plano item 2: `asset.module.ts` exporta `AssetReadRepository`. Refletido no "Impacto nos Bounded Contexts" (linha 226). Verificado contra `src/modules/identity/identity.module.ts` — de fato não há `exports` hoje. | ✅ Corrigido |
| 6 — admin no frontend | MÉDIO | Endpoint dedicado definido (Plano item 1, Edge Cases, Fluxos, Impacto no frontend). `GET /auth/me` / `MeResponseDto` / `GetCurrentUser` explicitamente intactos. Coerência com guards existentes: `AdminGuard` roda após `SessionAuthGuard` (que popula `request.user`), lança `ForbiddenException` como o `SessionAuthGuard` já faz — mesmo padrão de `src/modules/identity/presentation/guards/session-auth.guard.ts`. | ✅ Corrigido (com ajuste de rota abaixo) |
| 7–10 | BAIXO | #7 ordem das migrations fixada (nota no Schema + Plano). #8 `idx_assets_status` na migration 1 + texto do trade-off de `role` corrigido ("exige migration", não "só código"). #9 CASCADE mantido como decisão consciente registrada em "Decisões do Usuário". #10 nota de coordenação de merge com `feat/0006-wallet-balances` nas Consequências. | ✅ Endereçados |

### Correção factual aplicada nesta passada (era MÉDIO)

- **Rota do endpoint de admin-status.** A emenda escrevia `GET /me/admin-status`, mas `IdentityController` é `@Controller('auth')` (`src/modules/identity/presentation/identity.controller.ts:58-59`) e o "`GET /me`" real já é **`GET /auth/me`** (`identity.controller.ts:316`, `@Get('me')`). O novo endpoint foi corrigido para **`GET /auth/me/admin-status`** em todas as seções ativas do ADR (Decisão, Impacto, Plano, Edge Cases, Plano de Teste, Fluxos, Consequências, Impacto no frontend). Os blocos históricos (1ª rodada e tabela da Emenda) preservam o texto original.

### Observações BAIXO para a implementação (não bloqueiam)

| # | Observação | Sugestão |
|---|---|---|
| A | Ordem de passos dentro de cada módulo no Plano lista a migration **antes** do domínio (o template do ADR pede domain → application → infrastructure → presentation). | Aceitável para CRUD simples (schema-first ajuda o executor); manter como está, ou o executor reordena sem impacto. |
| B | `Administrator` é reconstituída a partir de `administrators`, mas o Plano não menciona um índice/consulta além de `findByUserId`. `user_id` já é `UNIQUE` (índice implícito), então `findByUserId` é O(1). | Nenhuma ação — o `UNIQUE` cobre. |

### Cobertura dos checklists (2ª rodada)

- **A. Regra de Dependência:** OK — grafo de módulos acíclico; entidades são POJOs; repositórios via interface de domínio; HTTP/guards na apresentação.
- **B. DDD:** OK — `Asset`/`Market` aggregate roots com invariantes próprias; `AssetStatus`/`MarketStatus` como union type; erros tipados (`InvalidAssetError` substituiu `AssetScaleLockedError` no Checklist). Sem domain events (config síncrona — justificado).
- **C. Precisão monetária:** N/A confirmado.
- **D. Atomicidade (ADR 0001):** OK — 1 tabela por operação; `UnitOfWork` dispensado; corrida de unicidade agora tratada como erro tipado.
- **E. Schema:** OK — `idx_assets_status` adicionado; ordem de migrations fixada; FKs e `CHECK`s coerentes; `ON DELETE CASCADE` decidido conscientemente.
- **F. Edge cases:** OK — inexistente/duplicado/inativo/403/401/CSRF/corrida cobertos.
- **G. Plano de teste:** OK — unit + integração com banco real + teste de convenção + teste de corrida.
- **H. Plano de implementação:** OK — grafo acíclico permite a ordem `identity → asset → market`; observação BAIXO #A não bloqueia.

### Próximo passo

ADR pronto para implementação. Rode `/adr-executor` (estágio 3).
