/**
 * Seguindo o padrão atual do repositório (`identity/domain/events/*`), os
 * eventos de domínio de `wallets` são apenas declarados — não há dispatcher/bus
 * ainda. Contextos futuros (Depósitos, Saques, Ordens) passarão a publicá-los.
 */
export class WalletProvisioned {
  readonly occurredAt: Date = new Date();

  constructor(
    readonly walletId: string,
    readonly userId: string,
  ) {}
}
