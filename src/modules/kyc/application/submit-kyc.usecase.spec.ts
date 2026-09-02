import { SubmitKyc } from '@/modules/kyc/application/submit-kyc.usecase';
import { SubmitKycInput } from '@/modules/kyc/application/dtos/submit-kyc.input';
import { KycProfile } from '@/modules/kyc/domain/entities/kyc-profile.entity';
import { KycSubmission } from '@/modules/kyc/domain/entities/kyc-submission.entity';
import { KycStatus } from '@/modules/kyc/domain/value-objects/kyc-status.vo';
import { KycAlreadyApprovedError } from '@/modules/kyc/domain/errors/kyc-already-approved.error';
import { CpfAlreadyInUseError } from '@/modules/kyc/domain/errors/cpf-already-in-use.error';
import { InvalidCpfError } from '@/modules/kyc/domain/errors/invalid-cpf.error';
import { UnderageError } from '@/modules/kyc/domain/errors/underage.error';
import { InvalidNationalityError } from '@/modules/kyc/domain/errors/invalid-nationality.error';

describe('SubmitKyc', () => {
  const txProfileRepo = { findByUserId: jest.fn(), upsert: jest.fn() };
  const txSubmissionRepo = { save: jest.fn() };

  const mockUow = {
    run: jest.fn((fn: any) =>
      fn({
        kycProfileRepo: txProfileRepo,
        kycSubmissionRepo: txSubmissionRepo,
      }),
    ),
  };

  const mockProfileRepo = {
    findByUserId: jest.fn(),
    existsApprovedByCpfHash: jest.fn(),
    upsert: jest.fn(),
  };

  const mockCpfCrypto = {
    hash: jest.fn((digits: string) => `hash-${digits}`),
    encrypt: jest.fn(() => 'enc'),
    decrypt: jest.fn((payload: string) => payload),
  };

  let sut: SubmitKyc;

  const validInput: SubmitKycInput = {
    userId: 'user-1',
    fullName: 'Ada Lovelace',
    cpf: '11144477735',
    birthDate: '1990-05-20',
    nationality: 'BR',
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUow.run.mockImplementation((fn: any) =>
      fn({
        kycProfileRepo: txProfileRepo,
        kycSubmissionRepo: txSubmissionRepo,
      }),
    );
    txProfileRepo.findByUserId.mockResolvedValue(null);
    mockProfileRepo.findByUserId.mockResolvedValue(null);
    mockProfileRepo.existsApprovedByCpfHash.mockResolvedValue(false);
    mockCpfCrypto.hash.mockImplementation((digits: string) => `hash-${digits}`);
    mockCpfCrypto.encrypt.mockReturnValue('enc');
    sut = new SubmitKyc(mockUow, mockProfileRepo, mockCpfCrypto);
  });

  function approvedProfile(userId: string): KycProfile {
    return KycProfile.reconstitute({
      userId,
      status: KycStatus.approved(),
      snapshot: null,
      rejectionReason: null,
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  function rejectedProfile(userId: string): KycProfile {
    return KycProfile.reconstitute({
      userId,
      status: KycStatus.rejected(),
      snapshot: null,
      rejectionReason: 'INVALID_CPF',
      approvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  describe('execute', () => {
    it('aprova quando não há perfil, dados válidos e CPF livre', async () => {
      const result = await sut.execute(validInput);

      expect(mockUow.run).toHaveBeenCalledTimes(1);
      expect(txProfileRepo.upsert).toHaveBeenCalledTimes(1);
      const persistedProfile = txProfileRepo.upsert.mock
        .calls[0][0] as KycProfile;
      expect(persistedProfile.status.isApproved()).toBe(true);

      expect(txSubmissionRepo.save).toHaveBeenCalledTimes(1);
      const persistedSubmission = txSubmissionRepo.save.mock
        .calls[0][0] as KycSubmission;
      expect(persistedSubmission.result).toBe('APPROVED');

      expect(result.status).toBe('APPROVED');
      expect(result.approvedAt).toBeInstanceOf(Date);
    });

    it('lança KycAlreadyApprovedError quando já existe perfil aprovado', async () => {
      mockProfileRepo.findByUserId.mockResolvedValue(approvedProfile('user-1'));

      await expect(sut.execute(validInput)).rejects.toBeInstanceOf(
        KycAlreadyApprovedError,
      );
      expect(mockUow.run).not.toHaveBeenCalled();
      expect(txProfileRepo.upsert).not.toHaveBeenCalled();
    });

    it('persiste rejeição INVALID_CPF e relança InvalidCpfError para CPF inválido', async () => {
      await expect(
        sut.execute({ ...validInput, cpf: '000' }),
      ).rejects.toBeInstanceOf(InvalidCpfError);

      expect(mockUow.run).toHaveBeenCalledTimes(1);
      const submission = txSubmissionRepo.save.mock
        .calls[0][0] as KycSubmission;
      expect(submission.result).toBe('REJECTED');
      expect(submission.rejectionReason).toBe('INVALID_CPF');
    });

    it('persiste rejeição UNDERAGE e relança UnderageError para menor de idade', async () => {
      await expect(
        sut.execute({ ...validInput, birthDate: '2020-01-01' }),
      ).rejects.toBeInstanceOf(UnderageError);

      expect(mockUow.run).toHaveBeenCalledTimes(1);
      const submission = txSubmissionRepo.save.mock
        .calls[0][0] as KycSubmission;
      expect(submission.result).toBe('REJECTED');
      expect(submission.rejectionReason).toBe('UNDERAGE');
    });

    it('persiste rejeição INVALID_NATIONALITY para nacionalidade inválida', async () => {
      await expect(
        sut.execute({ ...validInput, nationality: 'XX' }),
      ).rejects.toBeInstanceOf(InvalidNationalityError);

      const submission = txSubmissionRepo.save.mock
        .calls[0][0] as KycSubmission;
      expect(submission.rejectionReason).toBe('INVALID_NATIONALITY');
    });

    it('persiste rejeição CPF_ALREADY_IN_USE e lança CpfAlreadyInUseError quando o CPF já está em uso', async () => {
      mockProfileRepo.existsApprovedByCpfHash.mockResolvedValue(true);

      await expect(sut.execute(validInput)).rejects.toBeInstanceOf(
        CpfAlreadyInUseError,
      );

      expect(mockUow.run).toHaveBeenCalledTimes(1);
      const submission = txSubmissionRepo.save.mock
        .calls[0][0] as KycSubmission;
      expect(submission.result).toBe('REJECTED');
      expect(submission.rejectionReason).toBe('CPF_ALREADY_IN_USE');
    });

    it('permite reenvio: perfil REJECTED existente com dados válidos é aprovado', async () => {
      mockProfileRepo.findByUserId.mockResolvedValue(rejectedProfile('user-1'));
      txProfileRepo.findByUserId.mockResolvedValue(rejectedProfile('user-1'));

      const result = await sut.execute(validInput);

      expect(result.status).toBe('APPROVED');
      const persistedProfile = txProfileRepo.upsert.mock
        .calls[0][0] as KycProfile;
      expect(persistedProfile.status.isApproved()).toBe(true);
    });

    it('faz hash e encrypt apenas dos dígitos do CPF', async () => {
      await sut.execute(validInput);

      expect(mockCpfCrypto.hash).toHaveBeenCalledWith('11144477735');
      expect(mockCpfCrypto.encrypt).toHaveBeenCalledWith('11144477735');
    });
  });
});
