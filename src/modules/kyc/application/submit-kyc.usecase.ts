import { Logger } from '@nestjs/common';
import { UnitOfWork } from '@/shared/unit-of-work';
import { DomainError } from '@/shared/domain.error';
import { CpfCrypto } from '@/modules/kyc/domain/services/cpf-crypto';
import { KycProfileRepository } from '@/modules/kyc/domain/repositories/kyc-profile.repository';
import { KycProfile } from '@/modules/kyc/domain/entities/kyc-profile.entity';
import { KycSubmission } from '@/modules/kyc/domain/entities/kyc-submission.entity';
import { KycSnapshot } from '@/modules/kyc/domain/kyc-snapshot';
import { Cpf } from '@/modules/kyc/domain/value-objects/cpf.vo';
import { FullName } from '@/modules/kyc/domain/value-objects/full-name.vo';
import { BirthDate } from '@/modules/kyc/domain/value-objects/birth-date.vo';
import { Nationality } from '@/modules/kyc/domain/value-objects/nationality.vo';
import { CpfAlreadyInUseError } from '@/modules/kyc/domain/errors/cpf-already-in-use.error';
import { KycAlreadyApprovedError } from '@/modules/kyc/domain/errors/kyc-already-approved.error';
import { SubmitKycInput } from '@/modules/kyc/application/dtos/submit-kyc.input';
import { SubmitKycOutput } from '@/modules/kyc/application/dtos/submit-kyc.output';

/**
 * Submissão (e reenvio) de KYC com aprovação automática síncrona (KYC-001..006).
 *
 * Fluxo em 2 passos:
 *   1. Validação de domínio + checagem de unicidade de CPF — fora da transação.
 *   2. `uow.run` grava o resultado (APPROVED ou REJECTED) em `kyc_profiles` +
 *      `kyc_submissions` atomicamente. Em rejeição, o commit acontece e só
 *      então o erro de domínio é propagado — a auditoria (KYC-006) nunca se perde.
 */
export class SubmitKyc {
  private readonly logger = new Logger(SubmitKyc.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly kycProfileRepo: KycProfileRepository,
    private readonly cpfCrypto: CpfCrypto,
  ) {}

  async execute(input: SubmitKycInput): Promise<SubmitKycOutput> {
    const existing = await this.kycProfileRepo.findByUserId(input.userId);
    if (existing?.status.isApproved()) {
      throw new KycAlreadyApprovedError(input.userId);
    }

    const cpfDigits = Cpf.digitsOnly(input.cpf);
    const rawSnapshot = this.buildRawSnapshot(input, cpfDigits);

    const validated = await this.validateOrReject(input, rawSnapshot);

    const cpfInUse = await this.kycProfileRepo.existsApprovedByCpfHash(
      rawSnapshot.cpfHash,
      input.userId,
    );
    if (cpfInUse) {
      await this.persistRejection(input, rawSnapshot, 'CPF_ALREADY_IN_USE');
      this.logger.warn(
        'KYC rejected: CPF already linked to an approved account',
        {
          operation: 'kyc.submit.fraud.cpf_reuse',
          userId: input.userId,
        },
      );
      throw new CpfAlreadyInUseError();
    }

    const approvedSnapshot: KycSnapshot = {
      fullName: validated.fullName.toString(),
      cpfHash: rawSnapshot.cpfHash,
      cpfEncrypted: rawSnapshot.cpfEncrypted,
      cpfLastDigits: validated.cpf.lastTwoDigits,
      birthDate: validated.birthDate.iso,
      nationality: validated.nationality.toString(),
    };
    const approvedAt = new Date();

    await this.uow.run(async ({ kycProfileRepo, kycSubmissionRepo }) => {
      const profile =
        (await kycProfileRepo.findByUserId(input.userId)) ??
        KycProfile.notSubmitted(input.userId);
      profile.approve(approvedSnapshot, approvedAt);
      await kycProfileRepo.upsert(profile);
      await kycSubmissionRepo.save(
        KycSubmission.approved({
          userId: input.userId,
          snapshot: approvedSnapshot,
          submittedIp: input.ip,
        }),
      );
    });

    this.logger.log('KYC approved', {
      operation: 'kyc.submit.approved',
      userId: input.userId,
    });

    return { status: 'APPROVED', approvedAt };
  }

  private buildRawSnapshot(
    input: SubmitKycInput,
    cpfDigits: string,
  ): KycSnapshot {
    return {
      fullName: (input.fullName ?? '').trim().replace(/\s+/g, ' '),
      cpfHash: this.cpfCrypto.hash(cpfDigits),
      cpfEncrypted: this.cpfCrypto.encrypt(cpfDigits),
      cpfLastDigits: cpfDigits.slice(-2).padStart(2, '0'),
      birthDate: input.birthDate,
      nationality: (input.nationality ?? '').trim().toUpperCase().slice(0, 2),
    };
  }

  private async validateOrReject(
    input: SubmitKycInput,
    rawSnapshot: KycSnapshot,
  ): Promise<{
    fullName: FullName;
    cpf: Cpf;
    birthDate: BirthDate;
    nationality: Nationality;
  }> {
    try {
      return {
        fullName: FullName.create(input.fullName),
        cpf: Cpf.create(input.cpf),
        birthDate: BirthDate.create(input.birthDate),
        nationality: Nationality.create(input.nationality),
      };
    } catch (error) {
      if (error instanceof DomainError) {
        await this.persistRejection(input, rawSnapshot, error.code);
      }
      throw error;
    }
  }

  private async persistRejection(
    input: SubmitKycInput,
    snapshot: KycSnapshot,
    reason: string,
  ): Promise<void> {
    await this.uow.run(async ({ kycProfileRepo, kycSubmissionRepo }) => {
      const profile =
        (await kycProfileRepo.findByUserId(input.userId)) ??
        KycProfile.notSubmitted(input.userId);
      profile.reject(snapshot, reason);
      await kycProfileRepo.upsert(profile);
      await kycSubmissionRepo.save(
        KycSubmission.rejected({
          userId: input.userId,
          reason,
          snapshot,
          submittedIp: input.ip,
        }),
      );
    });
  }
}
