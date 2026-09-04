import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import { HealthController } from '@/health.controller';
import { IdentityModule } from '@/modules/identity/identity.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    IdentityModule,
    WalletsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
