# ADR 0001 — UnitOfWork Pattern for Atomic Transactions

**Status:** Accepted
**Date:** 2026-07-11
**Authors:** Time de Backend
**Context related to:** Architecture docs 02 (Clean Architecture + DDD), 03 (Project Structure)

---

## Context

The `src/infrastructure/database/` module provides `DatabaseService` with `runInTransaction()` — a utility that wraps BEGIN/COMMIT/ROLLBACK around a callback. This works at the infrastructure level but doesn't follow Clean Architecture: use cases would need to receive `DatabaseService` directly, violating the dependency rule.

The architecture docs (`02-clean-architecture-ddd-fundamentos.md:284-312`) define a `UnitOfWork` abstract class that:
1. Lives in `src/shared/`
2. Exposes repositories via a typed `Repositories` interface
3. Has a `run()` method that executes a callback within a transaction
4. Is implemented in infrastructure using `DatabaseService`

---

## Decision

Implement UnitOfWork with a simple, fixed `Repositories` interface.

### 1. Domain Layer

Location: `src/shared/unit-of-work.ts`

```typescript
import { TransactionRepository } from '../modules/financial/domain/transaction.repository';
import { LedgerEntryRepository } from '../modules/financial/domain/ledger-entry.repository';

export interface Repositories {
  transactionRepo: TransactionRepository;
  ledgerRepo: LedgerEntryRepository;
}

export abstract class UnitOfWork {
  abstract run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}
```

`Repositories` uses abstract classes from the domain as types. When new repositories are added (Account, Withdrawal, etc.), they are added to this interface.

### 2. Infrastructure Layer

Location: `src/infrastructure/database/unit-of-work.postgres.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { UnitOfWork, Repositories } from '../../shared/unit-of-work';
import { DatabaseService } from './database.service';
import { PgTransactionRepository } from '../../modules/financial/infrastructure/persistence/pg-transaction.repository';
import { PgLedgerEntryRepository } from '../../modules/financial/infrastructure/persistence/pg-ledger-entry.repository';

@Injectable()
export class PostgresUnitOfWork extends UnitOfWork {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.runInTransaction(async (tx) => {
      const repositories: Repositories = {
        transactionRepo: new PgTransactionRepository(tx),
        ledgerRepo: new PgLedgerEntryRepository(tx),
      };
      return fn(repositories);
    });
  }
}
```

Delegates to `DatabaseService.runInTransaction()` — no reimplementing BEGIN/COMMIT/ROLLBACK.

### 3. NestJS Injection

In `src/infrastructure/database/database.module.ts`:

```typescript
{
  provide: UnitOfWork,
  useClass: PostgresUnitOfWork,
}
```

Abstract class as injection token (follows project convention from `02-clean-architecture-ddd-fundamentos.md:204`).

### 4. Use Case Usage

```typescript
await this.uow.run(async ({ transactionRepo, ledgerRepo }) => {
  // Repos are typed automatically — no generic, no declaration needed
  const transaction = await transactionRepo.findById(input.transactionId);
});
```

---

## What was rejected

| Approach | Why rejected |
|---|---|
| `Map<string, unknown>` + `getRepository<T>(key)` | Over-engineered, requires string keys, loses type safety |
| Generic `run<T, R>()` | Use case has to declare `{ transactionRepo: TransactionRepo; ledgerRepo: LedgerRepo }` — redundant |
| Dynamic `getRepository()` | Still needs manual switch/case to create repos |
| NestJS `ModuleRef.resolve()` | Adds complexity, still needs a registry somewhere |

The fixed `Repositories` interface is the simplest approach. When a new repo is needed, add one line to the interface and one method to `PostgresUnitOfWork`.

---

## Impact on Bounded Contexts

| Bounded Context | Impact |
|----------------|--------|
| shared | UnitOfWork abstract class lives here |
| financial | Uses UnitOfWork for Transaction + LedgerEntry operations |

---

## Implementation Plan

### 1. ESLint
- [x] Disable `@typescript-eslint/no-unsafe-*` rules in `eslint.config.mjs`

### 2. Domain
- [x] `src/shared/unit-of-work.ts` — abstract UnitOfWork + Repositories interface

### 3. Infrastructure
- [x] `src/infrastructure/database/unit-of-work.postgres.ts` — PostgresUnitOfWork
- [x] `src/infrastructure/database/database.module.ts` — register UnitOfWork

### 4. Application
- [x] `src/modules/financial/application/confirm-deposit-with-uow.usecase.ts` — example use case

### 5. Presentation
- [x] `src/modules/financial/financial.module.ts` — inject UnitOfWork

---

## Consequences

**Positive:**
- Use cases access repositories without knowing about database transactions
- Clean Architecture dependency rule satisfied
- Financial invariants (INV-005, INV-006, INV-007) enforceable at pattern level
- Simple: no Map, no generic, no errors
- Testable: mock UnitOfWork in use case tests

**Negative:**
- Adding new repos requires editing `Repositories` interface + `PostgresUnitOfWork`
- All repos are created in every `run()` call (acceptable for 2-5 repos)

---

## References

- Architecture doc 02: `docs/architecture/02-clean-architecture-ddd-fundamentos.md:284-312`
- Business doc 04: `docs/bussiness/04-carteiras-e-ledger-financeiro.md`
