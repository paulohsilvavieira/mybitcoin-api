import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ConfirmDepositWithUowUseCase } from '@/modules/financial/application/confirm-deposit-with-uow.usecase';
import { GetBalancesUseCase } from '@/modules/financial/application/get-balances.usecase';
import { ConfirmDepositInputDTO } from '@/modules/financial/presentation/dtos/confirm-deposit.dto';
import { ConfirmDepositResponseDto } from '@/modules/financial/presentation/dtos/confirm-deposit-response.dto';
import { BalanceDto } from '@/modules/financial/presentation/dtos/balance.dto';
import { DomainErrorResponseDto } from '@/infrastructure/http/domain-error-response.dto';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';
import { SESSION_COOKIE_NAME } from '@/modules/identity/presentation/session-cookies';
import {
  ApiKeyGuard,
  INTERNAL_API_KEY_HEADER,
} from '@/modules/financial/presentation/guards/api-key.guard';

@ApiTags('Financial')
@Controller('financial')
export class FinancialController {
  constructor(
    private readonly confirmDepositUsecase: ConfirmDepositWithUowUseCase,
    private readonly getBalancesUsecase: GetBalancesUseCase,
  ) {}

  @Post('deposit/confirm')
  @UseGuards(ApiKeyGuard)
  @ApiHeader({
    name: INTERNAL_API_KEY_HEADER,
    description:
      'API key estática do serviço interno de monitoramento de blockchain. Endpoint não é acessível por sessão de usuário final.',
    required: true,
  })
  @ApiOperation({
    summary: 'Confirma um depósito on-chain',
    description:
      'Marca a transação de depósito como confirmada e cria os lançamentos de dupla entrada (débito na tesouraria, crédito no usuário) no ledger. Endpoint interno — chamado pelo serviço de monitoramento de blockchain, autenticado via API key.',
  })
  @ApiUnauthorizedResponse({
    description: `Header ${INTERNAL_API_KEY_HEADER} ausente ou inválido`,
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

  @Get('balances')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Lista os saldos do usuário autenticado',
    description:
      'Retorna um item por ativo que o usuário já movimentou (depósito confirmado). Lista vazia se o usuário nunca movimentou nenhum ativo.',
  })
  @ApiOkResponse({
    description: 'Saldos do usuário autenticado',
    type: BalanceDto,
    isArray: true,
    example: [
      { asset: 'BTC', available: '150000', locked: '0', total: '150000' },
    ],
  })
  @ApiUnauthorizedResponse({
    description: 'Cookie de sessão ausente, inválido, expirado ou revogado',
  })
  async getBalances(@Req() req: AuthenticatedRequest): Promise<BalanceDto[]> {
    const balances = await this.getBalancesUsecase.execute({
      userId: req.user.userId,
    });

    return balances.map((wallet) => ({
      asset: wallet.asset,
      available: wallet.availableSatoshi.toString(),
      locked: wallet.lockedSatoshi.toString(),
      total: wallet.totalSatoshi.toString(),
    }));
  }
}
