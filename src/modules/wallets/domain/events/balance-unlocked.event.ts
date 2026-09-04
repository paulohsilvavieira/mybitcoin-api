export class BalanceUnlocked {
  readonly occurredAt: Date = new Date();

  constructor(
    readonly walletId: string,
    readonly asset: string,
    readonly amountMinor: bigint,
    readonly transactionId: string,
  ) {}
}
