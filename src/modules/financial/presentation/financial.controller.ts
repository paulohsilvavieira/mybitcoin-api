import { Controller, Post, Body } from '@nestjs/common';
import { ConfirmDepositUseCase } from '../application/confirm-deposit.usecase';
import { ConfirmDepositInputDTO } from './dtos/confirm-deposit.dto';

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
