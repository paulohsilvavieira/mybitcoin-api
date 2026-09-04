import { CreditUseCase } from '@/modules/wallets/application/credit.usecase';
import { BalanceMovementResult } from '@/modules/wallets/application/balance-movement.usecase';

export interface ConfirmDepositInput {
  depositId: string;
  userId: string;
  asset: string;
  amountMinor: bigint;
}

/**
 * Caso de uso INTERNO — sem controller HTTP (ADR 0006, gap #1). Confirmar
 * depósito é operação sistêmica, disparada pelo futuro contexto de Depósitos
 * on-chain (após N confirmações / checagem de reorg), que importará esta classe
 * diretamente. Credita a carteira do usuário via `credit` com
 * `ref = { DEPOSIT, depositId }` e `operation = 'credit'` (idempotente).
 */
export class ConfirmDepositUseCase {
  constructor(private readonly credit: CreditUseCase) {}

  async execute(input: ConfirmDepositInput): Promise<BalanceMovementResult> {
    return this.credit.execute({
      userId: input.userId,
      asset: input.asset,
      amountMinor: input.amountMinor,
      reference: { referenceType: 'DEPOSIT', referenceId: input.depositId },
    });
  }
}
