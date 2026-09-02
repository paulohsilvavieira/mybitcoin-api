import { KycProfileRepository } from '@/modules/kyc/domain/repositories/kyc-profile.repository';
import { KycStatusOutput } from '@/modules/kyc/application/dtos/kyc-status.output';

/**
 * Status de KYC do usuário autenticado.
 *
 * Lê do primary (`KycProfileRepository`) e não da réplica: logo após `POST /kyc`
 * o frontend consulta este endpoint, e a réplica poderia devolver estado
 * obsoleto (mesmo racional do provider `Login` no módulo `identity`).
 */
export class GetMyKycStatus {
  constructor(private readonly kycProfileRepo: KycProfileRepository) {}

  async execute(input: { userId: string }): Promise<KycStatusOutput> {
    const profile = await this.kycProfileRepo.findByUserId(input.userId);

    if (!profile || profile.status.isNotSubmitted()) {
      return { status: 'NOT_SUBMITTED' };
    }

    const snapshot = profile.snapshot;
    const base: KycStatusOutput = {
      status: profile.status.toString(),
      fullName: snapshot?.fullName,
      maskedCpf: snapshot ? `***.***.**-${snapshot.cpfLastDigits}` : undefined,
      birthDate: snapshot?.birthDate,
      nationality: snapshot?.nationality,
    };

    if (profile.status.isApproved()) {
      return { ...base, approvedAt: profile.approvedAt?.toISOString() };
    }

    return { ...base, rejectionReason: profile.rejectionReason ?? undefined };
  }
}
