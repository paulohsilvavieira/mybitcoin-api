export type LedgerAccountKind = 'AVAILABLE' | 'LOCKED' | 'OPERATIONAL';

/**
 * Conta contábil identificada por string (contrato canônico do ledger — ADR 0006).
 *
 * Contas de usuário (entram na projeção `balances`, sujeitas a não-negatividade):
 *   USER_AVAILABLE:{userId}:{asset}
 *   USER_LOCKED:{userId}:{asset}
 *
 * Contas operacionais (só no ledger, sem linha em `balances`, sem trava de não-negativo):
 *   EXCHANGE:TREASURY:{asset}
 *   EXCHANGE:FEES:{asset}
 *   SETTLEMENT:{asset}
 */
export class LedgerAccount {
  private constructor(private readonly value: string) {}

  static userAvailable(userId: string, asset: string): LedgerAccount {
    return new LedgerAccount(`USER_AVAILABLE:${userId}:${asset}`);
  }

  static userLocked(userId: string, asset: string): LedgerAccount {
    return new LedgerAccount(`USER_LOCKED:${userId}:${asset}`);
  }

  static treasury(asset: string): LedgerAccount {
    return new LedgerAccount(`EXCHANGE:TREASURY:${asset}`);
  }

  static fees(asset: string): LedgerAccount {
    return new LedgerAccount(`EXCHANGE:FEES:${asset}`);
  }

  static settlement(asset: string): LedgerAccount {
    return new LedgerAccount(`SETTLEMENT:${asset}`);
  }

  /**
   * Reconstrói a partir da string canônica (ex. vinda do banco). Não valida o
   * formato — é reidratação de dado já persistido. Para produzir contas novas,
   * use os factories nomeados (`userAvailable`, `treasury`, ...).
   */
  static fromString(value: string): LedgerAccount {
    return new LedgerAccount(value);
  }

  isUserAccount(): boolean {
    return (
      this.value.startsWith('USER_AVAILABLE:') ||
      this.value.startsWith('USER_LOCKED:')
    );
  }

  kind(): LedgerAccountKind {
    if (this.value.startsWith('USER_AVAILABLE:')) return 'AVAILABLE';
    if (this.value.startsWith('USER_LOCKED:')) return 'LOCKED';
    return 'OPERATIONAL';
  }

  userId(): string | null {
    if (!this.isUserAccount()) return null;
    return this.value.split(':')[1] ?? null;
  }

  asset(): string {
    const parts = this.value.split(':');
    return parts[parts.length - 1];
  }

  toString(): string {
    return this.value;
  }
}
