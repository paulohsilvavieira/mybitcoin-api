import { DomainError } from '@/shared/domain.error';
import { TransactionRepository } from '@/modules/financial/domain/transaction.repository';
import { LedgerEntryRepository } from '@/modules/financial/domain/ledger-entry.repository';
import { LedgerEntry } from '@/modules/financial/domain/ledger-entry.entity';
import { ConfirmDepositInputDTO } from '@/modules/financial/presentation/dtos/confirm-deposit.dto';

export class ConfirmDepositUseCase {
  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly ledgerRepo: LedgerEntryRepository,
  ) {}

  async execute(input: ConfirmDepositInputDTO): Promise<void> {
    const transaction = await this.transactionRepo.findById(
      input.transactionId,
    );
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

    await this.transactionRepo.save(transaction);
    await this.ledgerRepo.save(debit);
    await this.ledgerRepo.save(credit);
  }
}

class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  constructor(readonly transactionId: string) {
    super(`Transaction '${transactionId}' not found`);
  }
}
