import { UnitOfWork } from '@/shared/unit-of-work';
import {
  Transaction,
  TransactionOperation,
  TransactionReference,
} from '@/modules/wallets/domain/entities/transaction.entity';
import { Balance } from '@/modules/wallets/domain/entities/balance.entity';
import { LedgerEntry } from '@/modules/wallets/domain/entities/ledger-entry.entity';
import { Money } from '@/modules/wallets/domain/value-objects/money.vo';
import { LedgerAccount } from '@/modules/wallets/domain/value-objects/ledger-account.vo';
import { AssetRepository } from '@/modules/wallets/domain/repositories';
import { AssetNotSupportedError } from '@/modules/wallets/domain/errors/asset-not-supported.error';
import { InvalidAmountError } from '@/modules/wallets/domain/errors/invalid-amount.error';
import {
  buildBalancedLegs,
  LegInput,
} from '@/modules/wallets/domain/services/transaction-legs.service';
import { provisionWallet } from '@/modules/wallets/application/provision-wallet';

export interface BalanceMovementInput {
  userId: string;
  asset: string;
  amountMinor: bigint;
  reference: TransactionReference;
  /** Conta contraparte. Default: `credit` -> EXCHANGE:TREASURY, `debit` -> SETTLEMENT. */
  counterAccount?: LedgerAccount;
}

export interface BalanceMovementResult {
  transaction: Transaction;
  balance: {
    walletId: string;
    asset: string;
    scale: number;
    availableMinor: bigint;
    lockedMinor: bigint;
    totalMinor: bigint;
  };
  /** `true` quando a tripla (ref, operation) já existia — no-op idempotente. */
  idempotent: boolean;
}

interface LegBuildContext {
  transactionId: string;
  balance: Balance;
  money: Money;
  userAvailable: LedgerAccount;
  userLocked: LedgerAccount;
  counterAccount?: LedgerAccount;
}

/**
 * Base das primitivas de movimentação de saldo (`credit`/`debit`/`lock`/`unlock`).
 * Cada execução: 1 `transaction` + exatamente 2 `ledger_entries` balanceados +
 * atualização de `balances`, tudo em um único `uow.run(...)`.
 *
 * KYC / autorização / limites NÃO são checados aqui — é responsabilidade do caso
 * de uso de negócio chamador (Depósito, Saque, Ordem, Trade).
 *
 * ## Contrato de idempotência (para o chamador)
 *
 * A chave de deduplicação é a tripla **`(referenceType, referenceId, operation)`**
 * (constraint `UNIQUE` em `transactions`). Repetir a mesma tripla é no-op
 * idempotente: retorna o estado já aplicado, `idempotent: true`, sem novas pernas.
 *
 * Se o chamador emite **duas operações de MESMA `operation`** sob a MESMA
 * referência de negócio, ele DEVE tornar o `referenceId` granular — senão a
 * segunda colide com a primeira e é silenciosamente descartada. Ex.: um futuro
 * TRADE que debita comprador e vendedor sob `(TRADE, tradeId)` deve usar
 * `referenceId = "{tradeId}:buyer"` e `"{tradeId}:seller"`. Operações de tipos
 * diferentes sob a mesma referência (ex. ORDER: `lock` na criação + `debit` no
 * fill, ambos `(ORDER, orderId)`) já são distinguidas pela `operation`.
 */
export abstract class BalanceMovementUseCase {
  protected abstract readonly operation: TransactionOperation;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly assetRepo: AssetRepository,
  ) {}

  async execute(input: BalanceMovementInput): Promise<BalanceMovementResult> {
    if (input.amountMinor <= 0n) {
      throw new InvalidAmountError(input.asset, input.amountMinor);
    }

    const asset = await this.assetRepo.findBySymbol(input.asset);
    if (!asset || !asset.isActive()) {
      throw new AssetNotSupportedError(input.asset);
    }

    return this.uow.run(async (repos) => {
      const { wallet, balance } = await provisionWallet(
        repos,
        input.userId,
        asset.symbol,
      );

      const existing = await repos.transactionRepo.findByReference(
        input.reference.referenceType,
        input.reference.referenceId,
        this.operation,
      );
      if (existing) {
        return this.toResult(existing, balance, true);
      }

      const money = Money.positive(
        asset.symbol,
        asset.scale,
        input.amountMinor,
      );
      const transaction = Transaction.create({
        operation: this.operation,
        reference: input.reference,
      });

      const legs = this.applyAndBuildLegs({
        transactionId: transaction.id,
        balance,
        money,
        userAvailable: LedgerAccount.userAvailable(wallet.userId, asset.symbol),
        userLocked: LedgerAccount.userLocked(wallet.userId, asset.symbol),
        counterAccount: input.counterAccount,
      });

      await repos.transactionRepo.save(transaction);
      for (const leg of legs) {
        await repos.ledgerRepo.save(leg);
      }
      await repos.balanceRepo.save(balance);

      return this.toResult(transaction, balance, false);
    });
  }

  /** Aplica a mutação no aggregate `Balance` e monta as 2 pernas balanceadas. */
  private applyAndBuildLegs(ctx: LegBuildContext): LedgerEntry[] {
    const builders: Record<
      TransactionOperation,
      (c: LegBuildContext) => { debit: LegInput; credit: LegInput }
    > = {
      credit: (c) => this.creditLegs(c),
      debit: (c) => this.debitLegs(c),
      lock: (c) => this.lockLegs(c),
      unlock: (c) => this.unlockLegs(c),
    };
    const pair = builders[this.operation](ctx);

    return buildBalancedLegs({
      transactionId: ctx.transactionId,
      asset: ctx.money.assetSymbol,
      amountMinor: ctx.money.amountMinor,
      debit: pair.debit,
      credit: pair.credit,
    });
  }

  private creditLegs(ctx: LegBuildContext): {
    debit: LegInput;
    credit: LegInput;
  } {
    const counter =
      ctx.counterAccount ?? LedgerAccount.treasury(ctx.money.assetSymbol);
    const before = ctx.balance.availableMinor;
    ctx.balance.credit(ctx.money);
    return {
      debit: operationalLeg(counter),
      credit: userLeg(ctx.userAvailable, before, ctx.balance.availableMinor),
    };
  }

  private debitLegs(ctx: LegBuildContext): {
    debit: LegInput;
    credit: LegInput;
  } {
    const counter =
      ctx.counterAccount ?? LedgerAccount.settlement(ctx.money.assetSymbol);
    const before = ctx.balance.availableMinor;
    ctx.balance.debit(ctx.money);
    return {
      debit: userLeg(ctx.userAvailable, before, ctx.balance.availableMinor),
      credit: operationalLeg(counter),
    };
  }

  private lockLegs(ctx: LegBuildContext): {
    debit: LegInput;
    credit: LegInput;
  } {
    const availBefore = ctx.balance.availableMinor;
    const lockedBefore = ctx.balance.lockedMinor;
    ctx.balance.lock(ctx.money);
    return {
      debit: userLeg(
        ctx.userAvailable,
        availBefore,
        ctx.balance.availableMinor,
      ),
      credit: userLeg(ctx.userLocked, lockedBefore, ctx.balance.lockedMinor),
    };
  }

  private unlockLegs(ctx: LegBuildContext): {
    debit: LegInput;
    credit: LegInput;
  } {
    const lockedBefore = ctx.balance.lockedMinor;
    const availBefore = ctx.balance.availableMinor;
    ctx.balance.unlock(ctx.money);
    return {
      debit: userLeg(ctx.userLocked, lockedBefore, ctx.balance.lockedMinor),
      credit: userLeg(
        ctx.userAvailable,
        availBefore,
        ctx.balance.availableMinor,
      ),
    };
  }

  private toResult(
    transaction: Transaction,
    balance: Balance,
    idempotent: boolean,
  ): BalanceMovementResult {
    return {
      transaction,
      balance: {
        walletId: balance.walletId,
        asset: balance.asset,
        scale: balance.scale,
        availableMinor: balance.availableMinor,
        lockedMinor: balance.lockedMinor,
        totalMinor: balance.totalMinor,
      },
      idempotent,
    };
  }
}

/** Perna de conta de usuário: grava saldo da conta antes/depois. */
function userLeg(
  account: LedgerAccount,
  before: bigint,
  after: bigint,
): LegInput {
  return {
    account,
    balanceBeforeMinor: before,
    balanceAfterMinor: after,
  };
}

/** Perna de conta operacional: sem before/after (`null`). */
function operationalLeg(account: LedgerAccount): LegInput {
  return { account, balanceBeforeMinor: null, balanceAfterMinor: null };
}
