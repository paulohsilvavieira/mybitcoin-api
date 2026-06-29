---
name: test-writer
description: Escreve testes unitários, de integração e edge cases para o mybitcoin-api. Cobre entidades de domínio, use cases, repositórios postgres e controllers. Gatilhos válidos — (1) slash command /test-writer; (2) usuário pede "criar testes", "escrever spec", "adicionar testes para X", "cobrir edge cases de Y". Aplica os padrões do projeto — Jest + NestJS Testing, dois trilhos (unit com mocks / integração com banco real), cenários obrigatórios por tipo de artefato, e edge cases específicos de domínio financeiro. NÃO invocar automaticamente.
---

# Test Writer — mybitcoin-api

## Filosofia de testes do projeto

Dois trilhos, responsabilidades distintas:

| Trilho | Alvo | Banco? | Foco |
|--------|------|--------|------|
| **Unit** | Entidades, Use Cases | ❌ mocks | Regras de negócio, invariantes, erros tipados |
| **Integração** | Repositórios Postgres, DatabaseService | ✅ banco real | SQL correto, atomicidade, persistência |

Controllers e serviços admin têm testes unitários simples com `supertest` ou mocks de `DatabaseService`.

**Regra de ouro:** testes unitários nunca tocam o banco. Testes de integração nunca mocam o banco. Misturar os dois é o pior dos mundos.

---

## Onde criar o arquivo de teste

| Artefato | Local do teste |
|---------|---------------|
| `src/domain/<ctx>/<entidade>.entity.ts` | `src/domain/<ctx>/<entidade>.entity.spec.ts` |
| `src/application/<ctx>/<usecase>.usecase.ts` | `src/application/<ctx>/<usecase>.usecase.spec.ts` |
| `src/infrastructure/database/repositories/<repo>.ts` | `src/infrastructure/database/repositories/<repo>.spec.ts` |
| `src/interface-adapters/http/<ctx>/<ctrl>.controller.ts` | `src/interface-adapters/http/<ctx>/<ctrl>.controller.spec.ts` |
| `src/admin/<ctx>/<service>.service.ts` | `src/admin/<ctx>/<service>.service.spec.ts` |

---

## Trilho 1 — Testes de Entidade (unit)

Entidades de domínio encapsulam invariantes. Os testes provam que as regras são cumpridas.

```typescript
// src/domain/financial/transaction.entity.spec.ts

import { Transaction, TransactionType, TransactionStatus } from './transaction.entity'
import { InsufficientBalanceError } from './financial.errors'
import { Satoshi } from '../bitcoin/satoshi.value-object'

const makeTransaction = (overrides = {}) =>
  Transaction.create({
    accountId: 'account-1',
    type: TransactionType.DEPOSIT,
    amount: Satoshi.of(100_000n),
    ...overrides,
  })

describe('Transaction', () => {
  describe('create', () => {
    it('cria transação com status pending por padrão', () => {
      const tx = makeTransaction()
      expect(tx.status).toBe(TransactionStatus.PENDING)
    })

    it('lança erro para valor zero', () => {
      expect(() => makeTransaction({ amount: Satoshi.of(0n) }))
        .toThrow('InvalidAmountError') // ou o nome do erro tipado
    })

    it('lança erro para valor negativo', () => {
      expect(() => makeTransaction({ amount: Satoshi.of(-1n) }))
        .toThrow()
    })
  })

  describe('confirm', () => {
    it('muda status para completed', () => {
      const tx = makeTransaction()
      const confirmed = tx.confirm(6)
      expect(confirmed.status).toBe(TransactionStatus.COMPLETED)
    })

    it('lança erro ao confirmar transação já confirmada', () => {
      const tx = makeTransaction().confirm(6)
      expect(() => tx.confirm(6)).toThrow()
    })

    it('lança erro para confirmações insuficientes (< 1)', () => {
      const tx = makeTransaction()
      expect(() => tx.confirm(0)).toThrow()
    })
  })
})
```

### Cenários obrigatórios para entidades

- [ ] Caminho feliz: criação com dados válidos
- [ ] Cada campo obrigatório ausente ou inválido lança `DomainError` tipado (nunca retorna `false`)
- [ ] Valor zero e valor negativo em campos monetários
- [ ] Cada transição de estado inválida (ex: confirmar transação já cancelada)
- [ ] Imutabilidade: métodos retornam nova instância, não mutam `this`
- [ ] Invariantes do documento `docs/bussiness/04-carteiras-e-ledger-financeiro.md` aplicáveis à entidade

---

## Trilho 1 — Testes de Use Case (unit)

Use cases recebem interfaces mockadas. Nunca testam implementação concreta.

```typescript
// src/application/financial/confirm-deposit.usecase.spec.ts

import { ConfirmDepositUseCase } from './confirm-deposit.usecase'
import { TransactionRepository } from '../../domain/financial/transaction.repository'
import { LedgerEntryRepository } from '../../domain/financial/ledger-entry.repository'
import { UnitOfWork } from '../../domain/shared/unit-of-work'
import { TransactionNotFoundError } from '../../domain/financial/financial.errors'

// Factories de mocks tipados
const makeTransactionRepo = (): jest.Mocked<TransactionRepository> => ({
  findById: jest.fn(),
  save: jest.fn(),
  findByAccountId: jest.fn(),
})

const makeLedgerRepo = (): jest.Mocked<LedgerEntryRepository> => ({
  save: jest.fn(),
})

const makeUow = (
  txRepo: jest.Mocked<TransactionRepository>,
  ledgerRepo: jest.Mocked<LedgerEntryRepository>
): jest.Mocked<UnitOfWork> => ({
  run: jest.fn().mockImplementation(async (fn) => fn({
    transactionRepository: txRepo,
    ledgerRepository: ledgerRepo,
  })),
  transactionRepository: txRepo,
  ledgerRepository: ledgerRepo,
})

const makeSut = () => {
  const txRepo = makeTransactionRepo()
  const ledgerRepo = makeLedgerRepo()
  const uow = makeUow(txRepo, ledgerRepo)
  const sut = new ConfirmDepositUseCase(uow)
  return { sut, txRepo, ledgerRepo, uow }
}

describe('ConfirmDepositUseCase', () => {
  describe('execute', () => {
    it('confirma transação e cria ledger entry de crédito', async () => {
      const { sut, txRepo, ledgerRepo } = makeSut()
      const mockTx = /* instância de Transaction pendente */ 
      txRepo.findById.mockResolvedValue(mockTx)

      await sut.execute({ transactionId: 'tx-1', confirmations: 6 })

      expect(txRepo.save).toHaveBeenCalled()
      expect(ledgerRepo.save).toHaveBeenCalled()
    })

    it('lança TransactionNotFoundError quando transação não existe', async () => {
      const { sut, txRepo } = makeSut()
      txRepo.findById.mockResolvedValue(null)

      await expect(sut.execute({ transactionId: 'inexistente', confirmations: 6 }))
        .rejects.toBeInstanceOf(TransactionNotFoundError)
    })

    it('executa dentro de UnitOfWork (operação atômica)', async () => {
      const { sut, txRepo, uow } = makeSut()
      txRepo.findById.mockResolvedValue(/* tx pendente */)

      await sut.execute({ transactionId: 'tx-1', confirmations: 6 })

      expect(uow.run).toHaveBeenCalledTimes(1)
    })

    it('não cria ledger entry se confirmação falhar', async () => {
      const { sut, txRepo, ledgerRepo } = makeSut()
      const txJaCancelada = /* transação com status cancelled */
      txRepo.findById.mockResolvedValue(txJaCancelada)

      await expect(sut.execute({ transactionId: 'tx-1', confirmations: 6 }))
        .rejects.toThrow()
      expect(ledgerRepo.save).not.toHaveBeenCalled()
    })
  })
})
```

### Cenários obrigatórios para use cases

- [ ] Caminho feliz: resultado correto com mocks retornando dados válidos
- [ ] `*NotFoundError` quando repositório retorna `null`
- [ ] `DomainError` tipado para cada regra de negócio violada
- [ ] `UnitOfWork.run` foi chamado em operações multi-tabela
- [ ] Side effect **não** ocorre quando operação principal falha (ex: ledger não salvo se transação não confirmada)
- [ ] Use case não chama nenhum método de infra diretamente (só via interfaces mockadas)

---

## Trilho 2 — Testes de Repositório (integração)

Repositórios são testados com banco real. Nunca mocam `DatabaseService`.

```typescript
// src/infrastructure/database/repositories/transaction.postgres.repository.spec.ts

import { DatabaseService } from '../database.service'
import { TransactionPostgresRepository } from './transaction.postgres.repository'
import { Transaction, TransactionType, TransactionStatus } from '../../../domain/financial/transaction.entity'
import { Satoshi } from '../../../domain/bitcoin/satoshi.value-object'

// Setup: banco de teste real (variável de ambiente DATABASE_URL_TEST)
describe('TransactionPostgresRepository (integração)', () => {
  let db: DatabaseService
  let repo: TransactionPostgresRepository

  beforeAll(async () => {
    db = new DatabaseService(/* pool de teste */)
    repo = new TransactionPostgresRepository(db)
    await db.query('BEGIN') // isola os testes
  })

  afterAll(async () => {
    await db.query('ROLLBACK') // descarta tudo ao fim
  })

  it('persiste e recupera uma transação pelo id', async () => {
    const tx = Transaction.create({
      accountId: 'account-test',
      type: TransactionType.DEPOSIT,
      amount: Satoshi.of(50_000n),
    })

    await repo.save(tx)
    const found = await repo.findById(tx.id)

    expect(found).not.toBeNull()
    expect(found!.amount.toBigInt()).toBe(50_000n) // bigint, nunca number
    expect(found!.status).toBe(TransactionStatus.PENDING)
  })

  it('retorna null para id inexistente', async () => {
    const result = await repo.findById('id-que-nao-existe')
    expect(result).toBeNull()
  })

  it('armazena amount_satoshi como BIGINT (não perde precisão)', async () => {
    const valorMaximo = 2_100_000_000_000_000n // 21M BTC em satoshis
    const tx = Transaction.create({
      accountId: 'account-test',
      type: TransactionType.DEPOSIT,
      amount: Satoshi.of(valorMaximo),
    })

    await repo.save(tx)
    const found = await repo.findById(tx.id)

    expect(found!.amount.toBigInt()).toBe(valorMaximo)
  })
})
```

### Cenários obrigatórios para repositórios

- [ ] Persistência e leitura do caminho feliz
- [ ] `findById` retorna `null` para id inexistente (nunca `undefined`)
- [ ] Precisão de `bigint`: valor salvo == valor lido (incluindo valores grandes como 21M BTC em satoshis)
- [ ] `toDomain()` mapeia todos os campos corretamente (nenhum campo ignorado)
- [ ] Operação dentro de `UnitOfWork` faz rollback se falhar (banco não persiste estado parcial)
- [ ] Constraint de banco é respeitada (ex: `transaction_id NOT NULL` em `ledger_entries`)

---

## Edge Cases específicos do domínio

Inclua estes cenários sempre que o artefato tocar os respectivos conceitos:

### Precisão monetária
```typescript
it('não perde precisão em operações com satoshi', () => {
  const a = Satoshi.of(1_000_000_000_000_000n)
  const b = Satoshi.of(1n)
  expect(a.add(b).toBigInt()).toBe(1_000_000_000_000_001n)
})

it('lança erro ao subtrair valor maior que o disponível', () => {
  const saldo = Satoshi.of(100n)
  expect(() => saldo.subtract(Satoshi.of(101n))).toThrow(InsufficientBalanceError)
})

it('lança erro para satoshi negativo', () => {
  expect(() => Satoshi.of(-1n)).toThrow()
})
```

### Dupla entrada (ledger)
```typescript
it('cria exatamente dois ledger entries por transação interna', async () => {
  // débito na conta origem + crédito na conta destino
  const entries = await captureledgerEntries(() => useCase.execute(input))
  expect(entries).toHaveLength(2)
  expect(entries.find(e => e.direction === 'debit')).toBeDefined()
  expect(entries.find(e => e.direction === 'credit')).toBeDefined()
  
  const totalDebit  = entries.filter(e => e.direction === 'debit').reduce((s, e) => s + e.amount, 0n)
  const totalCredit = entries.filter(e => e.direction === 'credit').reduce((s, e) => s + e.amount, 0n)
  expect(totalDebit).toBe(totalCredit) // INV-007
})
```

### Transições de estado
```typescript
it('não permite confirmar transação já cancelada', () => {
  const tx = makeCancelledTransaction()
  expect(() => tx.confirm(6)).toThrow()
})

it('não permite cancelar transação já confirmada', () => {
  const tx = makeConfirmedTransaction()
  expect(() => tx.cancel()).toThrow()
})
```

### Atomicidade
```typescript
it('faz rollback de todos os writes se ledger entry falhar', async () => {
  const { sut, txRepo, ledgerRepo } = makeSut()
  txRepo.findById.mockResolvedValue(makePendingTransaction())
  ledgerRepo.save.mockRejectedValue(new Error('DB error'))

  await expect(sut.execute(input)).rejects.toThrow()
  // Estado do banco não foi alterado — garantido pelo UnitOfWork
})
```

### Segurança
```typescript
it('não processa operação financeira com KYC não aprovado', async () => {
  const { sut } = makeSut()
  // conta com kyc_status !== 'approved'
  await expect(sut.execute({ accountId: 'kyc-pendente' }))
    .rejects.toBeInstanceOf(KycNotApprovedError)
})

it('não processa operação em conta suspensa', async () => {
  await expect(sut.execute({ accountId: 'conta-suspensa' }))
    .rejects.toBeInstanceOf(AccountSuspendedError)
})
```

---

## Testes para `src/admin/` (abordagem simples)

Services admin são testados com mock de `DatabaseService`.

```typescript
// src/admin/currency/currency.service.spec.ts

import { CurrencyService } from './currency.service'
import { DatabaseService } from '../../database/database.service'

const makeDb = (): jest.Mocked<Pick<DatabaseService, 'query'>> => ({
  query: jest.fn(),
})

describe('CurrencyService', () => {
  describe('create', () => {
    it('insere nova moeda e retorna o id criado', async () => {
      const db = makeDb()
      db.query.mockResolvedValue({ rows: [{ id: 1 }] } as any)
      const sut = new CurrencyService(db as any)

      const result = await sut.create({ code: 'BTC', name: 'Bitcoin', type: 'crypto' })

      expect(result.id).toBe(1)
      expect(db.query).toHaveBeenCalledTimes(1)
    })

    it('lança erro se código de moeda já existe (constraint unique)', async () => {
      const db = makeDb()
      db.query.mockRejectedValue({ code: '23505' }) // PostgreSQL unique violation
      const sut = new CurrencyService(db as any)

      await expect(sut.create({ code: 'BTC', name: 'Bitcoin', type: 'crypto' }))
        .rejects.toThrow()
    })
  })
})
```

---

## Boas práticas

- **Nome do teste = comportamento observável**: `'lança InsufficientBalanceError ao debitar mais do que o disponível'`, nunca `'testa o subtract'`
- **Uma asserção por teste** sempre que possível — falha diagnosticável
- **Factories sobre literais inline** — `makeTransaction()` com overrides pontuais
- **Nunca testar o mock** — `expect(repo.save).toHaveBeenCalled()` sem verificar o comportamento resultante não prova nada
- **Erros tipados, nunca string** — `expect(...).rejects.toBeInstanceOf(InsufficientBalanceError)`, não `.rejects.toThrow('Insufficient')`
- **`bigint` nas asserções** — `toBe(100n)`, nunca `toBe(100)`

---

## Rodando os testes

```bash
pnpm test                                      # suite completa
pnpm test -- src/domain/financial/             # só um contexto
pnpm test -- --watch                           # watch mode
pnpm test -- --coverage                        # cobertura
pnpm test -- transaction.entity.spec.ts        # arquivo específico
```
