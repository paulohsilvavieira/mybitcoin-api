import { GetMyKycStatus } from '@/modules/kyc/application/get-my-kyc-status.usecase';
import { KycProfile } from '@/modules/kyc/domain/entities/kyc-profile.entity';
import { KycStatus } from '@/modules/kyc/domain/value-objects/kyc-status.vo';
import { KycSnapshot } from '@/modules/kyc/domain/kyc-snapshot';

describe('GetMyKycStatus', () => {
  const mockProfileRepo = { findByUserId: jest.fn() };
  let sut: GetMyKycStatus;

  const snapshot: KycSnapshot = {
    fullName: 'Ada Lovelace',
    cpfHash: 'hash-x',
    cpfEncrypted: 'enc',
    cpfLastDigits: '35',
    birthDate: '1990-05-20',
    nationality: 'BR',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new GetMyKycStatus(mockProfileRepo as any);
  });

  function profile(params: {
    status: KycStatus;
    snapshot: KycSnapshot | null;
    rejectionReason?: string | null;
    approvedAt?: Date | null;
  }): KycProfile {
    return KycProfile.reconstitute({
      userId: 'user-1',
      status: params.status,
      snapshot: params.snapshot,
      rejectionReason: params.rejectionReason ?? null,
      approvedAt: params.approvedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  describe('execute', () => {
    it('retorna NOT_SUBMITTED quando não há perfil', async () => {
      mockProfileRepo.findByUserId.mockResolvedValue(null);

      const result = await sut.execute({ userId: 'user-1' });

      expect(result).toEqual({ status: 'NOT_SUBMITTED' });
    });

    it('retorna NOT_SUBMITTED quando o perfil está em NOT_SUBMITTED', async () => {
      mockProfileRepo.findByUserId.mockResolvedValue(
        profile({ status: KycStatus.notSubmitted(), snapshot: null }),
      );

      const result = await sut.execute({ userId: 'user-1' });

      expect(result).toEqual({ status: 'NOT_SUBMITTED' });
    });

    it('retorna dados mascarados e approvedAt ISO quando APPROVED', async () => {
      const approvedAt = new Date('2026-08-01T10:00:00.000Z');
      mockProfileRepo.findByUserId.mockResolvedValue(
        profile({ status: KycStatus.approved(), snapshot, approvedAt }),
      );

      const result = await sut.execute({ userId: 'user-1' });

      expect(result.status).toBe('APPROVED');
      expect(result.maskedCpf).toBe('***.***.**-35');
      expect(result.fullName).toBe('Ada Lovelace');
      expect(result.nationality).toBe('BR');
      expect(result.birthDate).toBe('1990-05-20');
      expect(result.approvedAt).toBe(approvedAt.toISOString());
      expect(result.rejectionReason).toBeUndefined();
    });

    it('retorna rejectionReason e sem approvedAt quando REJECTED', async () => {
      mockProfileRepo.findByUserId.mockResolvedValue(
        profile({
          status: KycStatus.rejected(),
          snapshot,
          rejectionReason: 'INVALID_CPF',
        }),
      );

      const result = await sut.execute({ userId: 'user-1' });

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionReason).toBe('INVALID_CPF');
      expect(result.approvedAt).toBeUndefined();
    });
  });
});
