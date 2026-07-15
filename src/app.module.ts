import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import { HealthController } from '@/health.controller';
import { FinancialModule } from '@/modules/financial/financial.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    FinancialModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
