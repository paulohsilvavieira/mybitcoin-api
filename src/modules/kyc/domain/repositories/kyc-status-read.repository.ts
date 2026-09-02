import { KycStatusType } from '@/modules/kyc/domain/value-objects/kyc-status.vo';

/**
 * Leitura desacoplada do status de KYC (ADR 0003 — réplica).
 * Consumida pelo `KycRequiredGuard` e por outros bounded contexts (via
 * `KycModule`), sem acoplar ao aggregate `KycProfile`.
 */
export abstract class KycStatusReadRepository {
  /**
   * Status persistido do usuário, ou `null` quando nunca submeteu
   * (equivale a `NOT_SUBMITTED`).
   */
  abstract findStatusByUserId(
    userId: string,
  ): Promise<Exclude<KycStatusType, 'NOT_SUBMITTED'> | null>;
}
