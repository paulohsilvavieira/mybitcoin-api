import { KycProfile } from '@/modules/kyc/domain/entities/kyc-profile.entity';
import {
  KycStatus,
  KycStatusType,
} from '@/modules/kyc/domain/value-objects/kyc-status.vo';
import { KycSnapshot } from '@/modules/kyc/domain/kyc-snapshot';

export interface KycProfileRow {
  user_id: string;
  status: string;
  rejection_reason: string | null;
  full_name: string;
  cpf_hash: string;
  cpf_encrypted: string;
  cpf_last_digits: string;
  birth_date: string;
  nationality: string;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class KycProfileMapper {
  static toDomain(row: KycProfileRow): KycProfile {
    const snapshot: KycSnapshot = {
      fullName: row.full_name,
      cpfHash: row.cpf_hash,
      cpfEncrypted: row.cpf_encrypted,
      cpfLastDigits: row.cpf_last_digits,
      birthDate: row.birth_date,
      nationality: row.nationality,
    };

    return KycProfile.reconstitute({
      userId: row.user_id,
      status: KycStatus.from(row.status as KycStatusType),
      snapshot,
      rejectionReason: row.rejection_reason,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
