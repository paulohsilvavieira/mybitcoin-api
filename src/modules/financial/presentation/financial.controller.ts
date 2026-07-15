import { Controller, Post, Body } from '@nestjs/common';
import { ConfirmDepositUseCase } from '@/modules/financial/application/confirm-deposit.usecase';
import { ConfirmDepositInputDTO } from '@/modules/financial/presentation/dtos/confirm-deposit.dto';

@Controller('financial')
export class FinancialController {
  constructor(private readonly confirmDepositUsecase: ConfirmDepositUseCase) {}

  @Post('deposit/confirm')
  async confirmDeposit(
    @Body() input: ConfirmDepositInputDTO,
  ): Promise<{ status: string }> {
    await this.confirmDepositUsecase.execute(input);
    return { status: 'confirmed' };
  }
}
