import { KycSubmission } from '@/modules/kyc/domain/entities/kyc-submission.entity';
import { KycSnapshot } from '@/modules/kyc/domain/kyc-snapshot';

const userId = '22222222-2222-2222-2222-222222222222';

const snapshot: KycSnapshot = {
  fullName: 'Ada Lovelace',
  cpfHash: 'hash',
  cpfEncrypted: 'encrypted',
  cpfLastDigits: '35',
  birthDate: '1990-05-20',
  nationality: 'BR',
};

describe('KycSubmission', () => {
  describe('approved', () => {
    it('cria uma submissão com resultado APPROVED', () => {
      const submission = KycSubmission.approved({
        userId,
        snapshot,
        submittedIp: '127.0.0.1',
      });

      expect(submission.result).toBe('APPROVED');
      expect(submission.rejectionReason).toBeNull();
      expect(submission.userId).toBe(userId);
      expect(submission.snapshot).toBe(snapshot);
      expect(submission.submittedIp).toBe('127.0.0.1');
      expect(submission.id).toHaveLength(36);
      expect(submission.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('rejected', () => {
    it('cria uma submissão com resultado REJECTED e motivo', () => {
      const submission = KycSubmission.rejected({
        userId,
        reason: 'CPF divergente',
        snapshot,
        submittedIp: '127.0.0.1',
      });

      expect(submission.result).toBe('REJECTED');
      expect(submission.rejectionReason).toBe('CPF divergente');
      expect(submission.id).toHaveLength(36);
      expect(submission.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('reconstitute', () => {
    it('reconstrói a submissão a partir de dados persistidos', () => {
      const createdAt = new Date('2026-03-01T00:00:00.000Z');

      const submission = KycSubmission.reconstitute({
        id: '33333333-3333-3333-3333-333333333333',
        userId,
        result: 'REJECTED',
        rejectionReason: 'documento ilegível',
        snapshot,
        submittedIp: '10.0.0.1',
        createdAt,
      });

      expect(submission.id).toBe('33333333-3333-3333-3333-333333333333');
      expect(submission.userId).toBe(userId);
      expect(submission.result).toBe('REJECTED');
      expect(submission.rejectionReason).toBe('documento ilegível');
      expect(submission.snapshot).toBe(snapshot);
      expect(submission.submittedIp).toBe('10.0.0.1');
      expect(submission.createdAt).toBe(createdAt);
    });
  });
});
