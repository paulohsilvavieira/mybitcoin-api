/**
 * Fato: o KYC de um usuário foi aprovado.
 *
 * Definido para uso futuro (ex.: outros contextos reagindo à aprovação). Não é
 * despachado hoje — não há barramento de eventos no projeto. Mesmo estado da
 * `UserRegistered` do módulo `identity`.
 */
export class KycApproved {
  readonly occurredAt: Date;

  constructor(readonly userId: string) {
    this.occurredAt = new Date();
  }
}
