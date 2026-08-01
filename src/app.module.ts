import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import { HealthController } from '@/health.controller';
import { FinancialModule } from '@/modules/financial/financial.module';
import { IdentityModule } from '@/modules/identity/identity.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    FinancialModule,
    IdentityModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
