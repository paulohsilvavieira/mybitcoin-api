# Exemplo: Transação Atômica com `DatabaseService`

Cenário: criar uma conta (`accounts`) e registrar o evento de auditoria
(`audit_accounts_logs`) na mesma transação. As duas escritas persistem juntas
ou falham juntas.

---

## Repositórios

Cada método de escrita aceita `tx?: Transaction`. Quando fornecido, a query
roda dentro da transação em andamento; quando ausente, usa o pool diretamente.

```typescript
// src/accounts/accounts.repository.ts
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Transaction } from '../database/transaction';

export interface Account {
  id: string;
  username: string;
  email: string;
  created_at: Date;
}

@Injectable()
export class AccountsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(
    data: { username: string; email: string },
    tx?: Transaction,
  ): Promise<Account> {
    const sql = `
      INSERT INTO accounts (username, email)
      VALUES ($1, $2)
      RETURNING id, username, email, created_at
    `;
    const params = [data.username, data.email];
    const result = tx
      ? await tx.query<Account>(sql, params)
      : await this.db.query<Account>(sql, params);
    return result.rows[0];
  }
}
```

```typescript
// src/audit/audit-accounts-logs.repository.ts
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Transaction } from '../database/transaction';

@Injectable()
export class AuditAccountsLogsRepository {
  constructor(private readonly db: DatabaseService) {}

  async log(
    entry: { account_id: string; event: string },
    tx?: Transaction,
  ): Promise<void> {
    const sql = `
      INSERT INTO audit_accounts_logs (account_id, event)
      VALUES ($1, $2)
    `;
    const params = [entry.account_id, entry.event];
    if (tx) {
      await tx.query(sql, params);
    } else {
      await this.db.query(sql, params);
    }
  }
}
```

---

## Serviço

Há duas formas de usar transações. Escolha a que melhor se encaixa no contexto.

### Opção 1 — `runInTransaction` (recomendado para o caso comum)

O ciclo de vida completo (BEGIN → COMMIT/ROLLBACK → release) é gerenciado
automaticamente; o serviço só descreve o que deve acontecer dentro da transação.

```typescript
async createAccount(dto: CreateAccountDto): Promise<Account> {
  return this.db.runInTransaction(async (tx) => {
    const account = await this.accountsRepo.create(dto, tx);
    await this.auditRepo.log({ account_id: account.id, event: 'created' }, tx);
    return account;
  });
}
```

### Opção 2 — `startTransaction` (quando precisar de controle explícito)

Use quando o fluxo exige decisões sobre commit/rollback que dependem de lógica
intermediária — por exemplo, commit condicional ou integração com operações
externas entre queries.

```typescript
async createAccount(dto: CreateAccountDto): Promise<Account> {
  const tx = await this.db.startTransaction();
  try {
    const account = await this.accountsRepo.create(dto, tx);
    await this.auditRepo.log({ account_id: account.id, event: 'created' }, tx);
    await tx.commit();
    return account;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await tx.release();
  }
}
```

---

## Teste Unitário do Serviço

`DatabaseService` é mockado; nenhuma conexão real é necessária.
O mock difere entre as duas opções pela forma como o `tx` é entregue ao serviço.

### Opção 1 — testando com `runInTransaction`

`runInTransaction` recebe uma função — o mock a executa diretamente com um `tx`
controlado pelo teste.

```typescript
// src/accounts/accounts.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './accounts.repository';
import { AuditAccountsLogsRepository } from '../audit/audit-accounts-logs.repository';
import { DatabaseService } from '../database/database.service';
import { Transaction } from '../database/transaction';

const mockAccountsRepo = { create: jest.fn() };
const mockAuditRepo = { log: jest.fn() };

const mockTx = { query: jest.fn() } as unknown as Transaction;
const mockDb = {
  runInTransaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
};

describe('AccountsService (runInTransaction)', () => {
  let service: AccountsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: AccountsRepository, useValue: mockAccountsRepo },
        { provide: AuditAccountsLogsRepository, useValue: mockAuditRepo },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  it('cria conta e auditoria passando a mesma transação para ambos', async () => {
    const fakeAccount = {
      id: 'uuid-1',
      username: 'alice',
      email: 'alice@example.com',
      created_at: new Date(),
    };
    mockAccountsRepo.create.mockResolvedValueOnce(fakeAccount);
    mockAuditRepo.log.mockResolvedValueOnce(undefined);

    const result = await service.createAccount({
      username: 'alice',
      email: 'alice@example.com',
    });

    expect(mockAccountsRepo.create).toHaveBeenCalledWith(
      { username: 'alice', email: 'alice@example.com' },
      mockTx,
    );
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      { account_id: 'uuid-1', event: 'created' },
      mockTx,
    );
    expect(result).toBe(fakeAccount);
  });

  it('propaga o erro quando um repositório lança exceção', async () => {
    const dbError = new Error('constraint violation');
    mockAccountsRepo.create.mockRejectedValueOnce(dbError);

    await expect(
      service.createAccount({ username: 'alice', email: 'alice@example.com' }),
    ).rejects.toThrow(dbError);
  });
});
```

> O rollback e o release já são verificados nos testes de `DatabaseService`
> — aqui o foco é a lógica de negócio do serviço.

### Opção 2 — testando com `startTransaction`

`startTransaction` retorna um `tx` — o mock expõe `commit`, `rollback` e
`release` para que o teste verifique que foram chamados corretamente.

```typescript
// src/accounts/accounts.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './accounts.repository';
import { AuditAccountsLogsRepository } from '../audit/audit-accounts-logs.repository';
import { DatabaseService } from '../database/database.service';

const mockAccountsRepo = { create: jest.fn() };
const mockAuditRepo = { log: jest.fn() };

const mockTx = {
  query: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};
const mockDb = {
  startTransaction: jest.fn().mockResolvedValue(mockTx),
};

describe('AccountsService (startTransaction)', () => {
  let service: AccountsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: AccountsRepository, useValue: mockAccountsRepo },
        { provide: AuditAccountsLogsRepository, useValue: mockAuditRepo },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  it('cria conta e auditoria na mesma transação e faz commit', async () => {
    const fakeAccount = {
      id: 'uuid-1',
      username: 'alice',
      email: 'alice@example.com',
      created_at: new Date(),
    };
    mockAccountsRepo.create.mockResolvedValueOnce(fakeAccount);
    mockAuditRepo.log.mockResolvedValueOnce(undefined);

    const result = await service.createAccount({
      username: 'alice',
      email: 'alice@example.com',
    });

    expect(mockAccountsRepo.create).toHaveBeenCalledWith(
      { username: 'alice', email: 'alice@example.com' },
      mockTx,
    );
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      { account_id: 'uuid-1', event: 'created' },
      mockTx,
    );
    expect(mockTx.commit).toHaveBeenCalledTimes(1);
    expect(mockTx.rollback).not.toHaveBeenCalled();
    expect(mockTx.release).toHaveBeenCalledTimes(1);
    expect(result).toBe(fakeAccount);
  });

  it('faz rollback e libera a conexão quando um repositório lança erro', async () => {
    const dbError = new Error('constraint violation');
    mockAccountsRepo.create.mockRejectedValueOnce(dbError);

    await expect(
      service.createAccount({ username: 'alice', email: 'alice@example.com' }),
    ).rejects.toThrow(dbError);

    expect(mockTx.rollback).toHaveBeenCalledTimes(1);
    expect(mockTx.commit).not.toHaveBeenCalled();
    expect(mockTx.release).toHaveBeenCalledTimes(1);
  });
});
```

---

## Fluxo Resumido

```
AccountsService.createAccount()
  │
  └─ db.runInTransaction(fn)
       │
       ├─ startTransaction()           → BEGIN + PoolClient reservado
       ├─ fn(tx)
       │    ├─ accountsRepo.create()   → INSERT INTO accounts ...
       │    └─ auditRepo.log()         → INSERT INTO audit_accounts_logs ...
       │
       ├─ [sucesso] tx.commit()        → COMMIT
       ├─ [erro]    tx.rollback()      → ROLLBACK  +  rethrow
       └─ [finally] tx.release() → client.release()
```
