import { UnitOfWork } from '@/shared/unit-of-work';
import { DomainError } from '@/shared/domain.error';
import { LedgerEntry } from '@/modules/financial/domain/entities';
import { ConfirmDepositInputDTO } from '@/modules/financial/presentation/dtos/confirm-deposit.dto';

export class ConfirmDepositWithUowUseCase {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(input: ConfirmDepositInputDTO): Promise<void> {
    await this.uow.run(async ({ transactionRepo, ledgerRepo }) => {
      const transaction = await transactionRepo.findById(input.transactionId);
      if (!transaction) {
        throw new TransactionNotFoundError(input.transactionId);
      }

      transaction.confirm();

      const debit = LedgerEntry.create({
        transactionId: transaction.id,
        account: `EXCHANGE:TREASURY:${transaction.type.toUpperCase()}`,
        type: 'debit',
        amountSatoshi: transaction.amountSatoshi,
      });

      const credit = LedgerEntry.create({
        transactionId: transaction.id,
        account: `USER:${transaction.accountId}:${transaction.type.toUpperCase()}`,
        type: 'credit',
        amountSatoshi: transaction.amountSatoshi,
      });

      await transactionRepo.save(transaction);
      await ledgerRepo.save(debit);
      await ledgerRepo.save(credit);
    });
  }
}

class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  constructor(readonly transactionId: string) {
    super(`Transaction '${transactionId}' not found`);
  }
}
