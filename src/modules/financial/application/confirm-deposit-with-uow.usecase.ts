import { UnitOfWork } from '@/shared/unit-of-work';
import {
  LedgerEntry,
  Transaction,
  Wallet,
} from '@/modules/financial/domain/entities';
import { ConfirmDepositInputDTO } from '@/modules/financial/presentation/dtos/confirm-deposit.dto';
import { TransactionNotFoundError } from '@/modules/financial/domain/errors/transaction-not-found.error';

export class ConfirmDepositWithUowUseCase {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: ConfirmDepositInputDTO): Promise<void> {
    await this.uow.run(async ({ transactionRepo, ledgerRepo, walletRepo }) => {
      const transaction = await transactionRepo.findById(input.transactionId);
      if (!transaction) {
        throw new TransactionNotFoundError(input.transactionId);
      }

      transaction.confirm();

      const { debit, credit } = this.buildLedgerEntries(transaction);

      await transactionRepo.save(transaction);
      await ledgerRepo.save(debit);
      await ledgerRepo.save(credit);

      // Defesa em profundidade: o valor já foi validado em Transaction.create
      // e é reforçado pela CHECK constraint na coluna amount_satoshi. Esta
      // chamada garante a invariante também no ponto de entrada do crédito
      // de saldo, caso a origem da transação mude no futuro.
      Wallet.assertValidCreditAmount(transaction.amountSatoshi);
      await walletRepo.creditAvailable({
        userId: transaction.accountId,
        asset: transaction.asset,
        amountSatoshi: transaction.amountSatoshi,
      });
    });
  }

  private buildLedgerEntries(transaction: Transaction): {
    debit: LedgerEntry;
    credit: LedgerEntry;
  } {
    const debit = LedgerEntry.create({
      transactionId: transaction.id,
      account: `EXCHANGE:TREASURY:${transaction.asset.toUpperCase()}`,
      type: 'debit',
      amountSatoshi: transaction.amountSatoshi,
    });

    const credit = LedgerEntry.create({
      transactionId: transaction.id,
      account: `USER:${transaction.accountId}:${transaction.asset.toUpperCase()}`,
      type: 'credit',
      amountSatoshi: transaction.amountSatoshi,
    });

    return { debit, credit };
  }
}
