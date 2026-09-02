import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { UnitOfWork } from '@/shared/unit-of-work';
import { IdentityModule } from '@/modules/identity/identity.module';
import { CpfCrypto } from '@/modules/kyc/domain/services/cpf-crypto';
import {
  KycProfileRepository,
  KycStatusReadRepository,
} from '@/modules/kyc/domain/repositories';
import { PgKycProfileRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-profile.repository';
import { PgKycStatusReadRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-status-read.repository';
import { KycCryptoConfig } from '@/modules/kyc/infrastructure/config/kyc-crypto.config';
import { NodeCpfCrypto } from '@/modules/kyc/infrastructure/crypto/node-cpf-crypto';
import { SubmitKyc } from '@/modules/kyc/application/submit-kyc.usecase';
import { GetMyKycStatus } from '@/modules/kyc/application/get-my-kyc-status.usecase';
import { KycController } from '@/modules/kyc/presentation/kyc.controller';
import { KycRequiredGuard } from '@/modules/kyc/presentation/guards/kyc-required.guard';

@Module({
  imports: [IdentityModule],
  controllers: [KycController],
  providers: [
    {
      provide: KycCryptoConfig,
      useFactory: (config: ConfigService) => new KycCryptoConfig(config),
      inject: [ConfigService],
    },
    {
      provide: CpfCrypto,
      useFactory: (config: KycCryptoConfig) => new NodeCpfCrypto(config),
      inject: [KycCryptoConfig],
    },
    {
      provide: KycProfileRepository,
      useFactory: (db: QueryExecutor) => new PgKycProfileRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: KycStatusReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgKycStatusReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
    {
      provide: SubmitKyc,
      useFactory: (
        uow: UnitOfWork,
        profileRepo: KycProfileRepository,
        cpfCrypto: CpfCrypto,
      ) => new SubmitKyc(uow, profileRepo, cpfCrypto),
      inject: [UnitOfWork, KycProfileRepository, CpfCrypto],
    },
    {
      provide: GetMyKycStatus,
      useFactory: (profileRepo: KycProfileRepository) =>
        new GetMyKycStatus(profileRepo),
      inject: [KycProfileRepository],
    },
    KycRequiredGuard,
  ],
  exports: [KycRequiredGuard, KycStatusReadRepository],
})
export class KycModule {}
