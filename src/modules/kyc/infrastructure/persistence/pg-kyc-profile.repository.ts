import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { KycProfileRepository } from '@/modules/kyc/domain/repositories/kyc-profile.repository';
import { KycProfile } from '@/modules/kyc/domain/entities/kyc-profile.entity';
import { CpfAlreadyInUseError } from '@/modules/kyc/domain/errors/cpf-already-in-use.error';
import {
  KycProfileMapper,
  KycProfileRow,
} from '@/modules/kyc/infrastructure/persistence/kyc-profile.mapper';
import {
  findKycProfileByUserIdQuery,
  existsApprovedByCpfHashQuery,
  upsertKycProfileQuery,
} from '@/modules/kyc/infrastructure/persistence/kyc-profile.sql';

const UNIQUE_VIOLATION = '23505';
const APPROVED_CPF_INDEX = 'idx_kyc_profiles_cpf_hash_approved';

export class PgKycProfileRepository extends KycProfileRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async findByUserId(userId: string): Promise<KycProfile | null> {
    const { query, values } = findKycProfileByUserIdQuery(userId);
    const result = await this.db.query<KycProfileRow>(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return KycProfileMapper.toDomain(result.rows[0]);
  }

  async existsApprovedByCpfHash(
    cpfHash: string,
    exceptUserId: string,
  ): Promise<boolean> {
    const { query, values } = existsApprovedByCpfHashQuery(
      cpfHash,
      exceptUserId,
    );
    const result = await this.db.query(query, values);
    return result.rows.length > 0;
  }

  async upsert(profile: KycProfile): Promise<void> {
    const snapshot = profile.snapshot;
    if (!snapshot) {
      throw new Error('Cannot persist a KycProfile without a snapshot');
    }

    const { query, values } = upsertKycProfileQuery({
      userId: profile.userId,
      status: profile.status.toString(),
      rejectionReason: profile.rejectionReason,
      fullName: snapshot.fullName,
      cpfHash: snapshot.cpfHash,
      cpfEncrypted: snapshot.cpfEncrypted,
      cpfLastDigits: snapshot.cpfLastDigits,
      birthDate: snapshot.birthDate,
      nationality: snapshot.nationality,
      approvedAt: profile.approvedAt,
      updatedAt: profile.updatedAt,
    });

    try {
      await this.db.query(query, values);
    } catch (error) {
      if (this.isApprovedCpfConflict(error)) {
        throw new CpfAlreadyInUseError();
      }
      throw error;
    }
  }

  private isApprovedCpfConflict(error: unknown): boolean {
    const e = error as { code?: string; constraint?: string; message?: string };
    return (
      e?.code === UNIQUE_VIOLATION &&
      (e.constraint === APPROVED_CPF_INDEX ||
        Boolean(e.message?.includes(APPROVED_CPF_INDEX)))
    );
  }
}
