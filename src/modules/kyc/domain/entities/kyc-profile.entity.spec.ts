import { KycProfile } from '@/modules/kyc/domain/entities/kyc-profile.entity';
import { KycStatus } from '@/modules/kyc/domain/value-objects/kyc-status.vo';
import { KycSnapshot } from '@/modules/kyc/domain/kyc-snapshot';
import { KycAlreadyApprovedError } from '@/modules/kyc/domain/errors/kyc-already-approved.error';

const userId = '11111111-1111-1111-1111-111111111111';

const snapshot: KycSnapshot = {
  fullName: 'Ada Lovelace',
  cpfHash: 'hash',
  cpfEncrypted: 'encrypted',
  cpfLastDigits: '35',
  birthDate: '1990-05-20',
  nationality: 'BR',
};

describe('KycProfile', () => {
  describe('notSubmitted', () => {
    it('cria um profile no estado NOT_SUBMITTED', () => {
      const profile = KycProfile.notSubmitted(userId);
      expect(profile.userId).toBe(userId);
      expect(profile.status.isNotSubmitted()).toBe(true);
      expect(profile.snapshot).toBeNull();
      expect(profile.rejectionReason).toBeNull();
      expect(profile.approvedAt).toBeNull();
      expect(profile.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('approve', () => {
    it('move o profile para APPROVED com snapshot e data', () => {
      const profile = KycProfile.notSubmitted(userId);
      const at = new Date('2026-08-29T00:00:00.000Z');

      profile.approve(snapshot, at);

      expect(profile.status.isApproved()).toBe(true);
      expect(profile.snapshot).toBe(snapshot);
      expect(profile.approvedAt).toBe(at);
      expect(profile.rejectionReason).toBeNull();
    });

    it('lança KycAlreadyApprovedError quando já aprovado', () => {
      const profile = KycProfile.notSubmitted(userId);
      profile.approve(snapshot);

      expect(() => profile.approve(snapshot)).toThrow(KycAlreadyApprovedError);
    });
  });

  describe('reject', () => {
    it('move o profile para REJECTED com o motivo', () => {
      const profile = KycProfile.notSubmitted(userId);

      profile.reject(snapshot, 'documento ilegível');

      expect(profile.status.isRejected()).toBe(true);
      expect(profile.snapshot).toBe(snapshot);
      expect(profile.rejectionReason).toBe('documento ilegível');
      expect(profile.approvedAt).toBeNull();
    });

    it('lança KycAlreadyApprovedError quando já aprovado', () => {
      const profile = KycProfile.notSubmitted(userId);
      profile.approve(snapshot);

      expect(() => profile.reject(snapshot, 'motivo')).toThrow(
        KycAlreadyApprovedError,
      );
    });
  });

  describe('assertCanSubmit', () => {
    it('não lança quando o profile ainda não foi aprovado', () => {
      const profile = KycProfile.notSubmitted(userId);
      expect(() => profile.assertCanSubmit()).not.toThrow();
    });

    it('lança KycAlreadyApprovedError quando já aprovado', () => {
      const profile = KycProfile.notSubmitted(userId);
      profile.approve(snapshot);

      expect(() => profile.assertCanSubmit()).toThrow(KycAlreadyApprovedError);
    });
  });

  describe('reconstitute', () => {
    it('reconstrói o profile a partir de dados persistidos (round-trip)', () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-02-01T00:00:00.000Z');
      const approvedAt = new Date('2026-02-01T00:00:00.000Z');

      const profile = KycProfile.reconstitute({
        userId,
        status: KycStatus.approved(),
        snapshot,
        rejectionReason: null,
        approvedAt,
        createdAt,
        updatedAt,
      });

      expect(profile.userId).toBe(userId);
      expect(profile.status.isApproved()).toBe(true);
      expect(profile.snapshot).toBe(snapshot);
      expect(profile.rejectionReason).toBeNull();
      expect(profile.approvedAt).toBe(approvedAt);
      expect(profile.createdAt).toBe(createdAt);
      expect(profile.updatedAt).toBe(updatedAt);
    });
  });
});
