import { KycProfile } from '@/modules/kyc/domain/entities/kyc-profile.entity';

export abstract class KycProfileRepository {
  /** Retorna o perfil persistido do usuário, ou `null` se nunca submeteu. */
  abstract findByUserId(userId: string): Promise<KycProfile | null>;

  /**
   * `true` se `cpfHash` já pertence a um perfil APROVADO de outro usuário
   * (diferente de `exceptUserId`).
   */
  abstract existsApprovedByCpfHash(
    cpfHash: string,
    exceptUserId: string,
  ): Promise<boolean>;

  /** Cria ou atualiza o perfil (chave: `userId`). */
  abstract upsert(profile: KycProfile): Promise<void>;
}
