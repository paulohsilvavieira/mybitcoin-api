import { KycStatus } from '@/modules/kyc/domain/value-objects/kyc-status.vo';

describe('KycStatus', () => {
  describe('factories', () => {
    it('notSubmitted cria status NOT_SUBMITTED', () => {
      const status = KycStatus.notSubmitted();
      expect(status.isNotSubmitted()).toBe(true);
      expect(status.isApproved()).toBe(false);
      expect(status.isRejected()).toBe(false);
    });

    it('approved cria status APPROVED', () => {
      const status = KycStatus.approved();
      expect(status.isApproved()).toBe(true);
      expect(status.isNotSubmitted()).toBe(false);
      expect(status.isRejected()).toBe(false);
    });

    it('rejected cria status REJECTED', () => {
      const status = KycStatus.rejected();
      expect(status.isRejected()).toBe(true);
      expect(status.isNotSubmitted()).toBe(false);
      expect(status.isApproved()).toBe(false);
    });
  });

  describe('from', () => {
    it('reconstrói o status a partir do valor persistido', () => {
      expect(KycStatus.from('APPROVED').isApproved()).toBe(true);
      expect(KycStatus.from('REJECTED').isRejected()).toBe(true);
      expect(KycStatus.from('NOT_SUBMITTED').isNotSubmitted()).toBe(true);
    });
  });

  describe('toString', () => {
    it('retorna o valor bruto do status', () => {
      expect(KycStatus.approved().toString()).toBe('APPROVED');
      expect(KycStatus.rejected().toString()).toBe('REJECTED');
      expect(KycStatus.notSubmitted().toString()).toBe('NOT_SUBMITTED');
    });
  });
});
