import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ConfirmDepositUseCase } from '@/modules/financial/application/confirm-deposit.usecase';
import { ConfirmDepositInputDTO } from '@/modules/financial/presentation/dtos/confirm-deposit.dto';
import { ConfirmDepositResponseDto } from '@/modules/financial/presentation/dtos/confirm-deposit-response.dto';
import { DomainErrorResponseDto } from '@/infrastructure/http/domain-error-response.dto';

@ApiTags('Financial')
@Controller('financial')
export class FinancialController {
  constructor(private readonly confirmDepositUsecase: ConfirmDepositUseCase) {}

  @Post('deposit/confirm')
  @ApiOperation({
    summary: 'Confirma um depósito on-chain',
    description:
      'Marca a transação de depósito como confirmada e cria os lançamentos de dupla entrada (débito na tesouraria, crédito no usuário) no ledger.',
  })
  @ApiBody({
    type: ConfirmDepositInputDTO,
    examples: {
      default: {
        summary: 'Depósito com 3 confirmações',
        value: {
          transactionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          confirmations: 3,
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Depósito confirmado com sucesso',
    type: ConfirmDepositResponseDto,
    example: { status: 'confirmed' },
  })
  @ApiUnprocessableEntityResponse({
    description: 'Transação de depósito não encontrada',
    type: DomainErrorResponseDto,
    example: {
      code: 'TRANSACTION_NOT_FOUND',
      message: "Transaction '7c9e6679-7425-40de-944b-e07fc1f90ae7' not found",
    },
  })
  async confirmDeposit(
    @Body() input: ConfirmDepositInputDTO,
  ): Promise<{ status: string }> {
    await this.confirmDepositUsecase.execute(input);
    return { status: 'confirmed' };
  }
}
