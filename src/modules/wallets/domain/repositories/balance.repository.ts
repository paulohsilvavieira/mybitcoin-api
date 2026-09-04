import { Balance } from '@/modules/wallets/domain/entities/balance.entity';

export abstract class BalanceRepository {
  /**
   * `SELECT ... FOR UPDATE` na linha de `balances` — serializa operações
   * concorrentes do mesmo `(wallet, asset)` (ADR 0006, gap #3). Deve ser a
   * primeira leitura dentro de toda primitiva. Retorna `null` se a linha não existe.
   */
  abstract findForUpdate(
    walletId: string,
    asset: string,
  ): Promise<Balance | null>;

  /** Cria a linha zerada só se ainda não existir (INSERT ... ON CONFLICT DO NOTHING). */
  abstract insertZeroIfNotExists(
    walletId: string,
    asset: string,
  ): Promise<void>;

  /** Atualiza a projeção (available/locked) da linha existente. */
  abstract save(balance: Balance): Promise<void>;
}
