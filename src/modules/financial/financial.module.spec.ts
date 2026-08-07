import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Pool } from 'pg';
import { FinancialModule } from '@/modules/financial/financial.module';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import { FinancialController } from '@/modules/financial/presentation/financial.controller';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { ConfirmDepositWithUowUseCase } from '@/modules/financial/application/confirm-deposit-with-uow.usecase';
import { GetBalancesUseCase } from '@/modules/financial/application/get-balances.usecase';
import { UnitOfWork } from '@/shared/unit-of-work';
import {
  WRITE_POOL_TOKEN,
  READ_POOL_TOKEN,
} from '@/infrastructure/database/database.token';

// Regressão do Gap #2 do ADR 0006: FinancialModule importa IdentityModule
// internamente para consumir o SessionAuthGuard exportado (usado em
// @UseGuards(SessionAuthGuard) no FinancialController). Este teste garante
// que a árvore de DI inteira — DatabaseModule (pools lazy, não conectam até
// a primeira query) + FinancialModule (que por sua vez importa IdentityModule)
// — resolve sem lançar erro de injeção de dependência.
describe('FinancialModule (bootstrap de DI)', () => {
  it('compiles the module graph and resolves every provider without a live DB connection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        FinancialModule,
      ],
    }).compile();

    expect(moduleRef.get(FinancialController)).toBeInstanceOf(
      FinancialController,
    );
    expect(moduleRef.get(SessionAuthGuard)).toBeInstanceOf(SessionAuthGuard);
    expect(moduleRef.get(ConfirmDepositWithUowUseCase)).toBeInstanceOf(
      ConfirmDepositWithUowUseCase,
    );
    expect(moduleRef.get(GetBalancesUseCase)).toBeInstanceOf(
      GetBalancesUseCase,
    );
    expect(moduleRef.get(UnitOfWork)).toBeDefined();

    const writePool = moduleRef.get<Pool>(WRITE_POOL_TOKEN);
    const readPool = moduleRef.get<Pool>(READ_POOL_TOKEN);
    await moduleRef.close();
    await writePool.end();
    await readPool.end();
  });
});
