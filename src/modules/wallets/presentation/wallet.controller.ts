import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';
import { SESSION_COOKIE_NAME } from '@/modules/identity/presentation/session-cookies';
import { GetWalletBalancesUseCase } from '@/modules/wallets/application/get-wallet-balances.usecase';
import { GetLedgerHistoryUseCase } from '@/modules/wallets/application/get-ledger-history.usecase';
import { WalletBalanceItemDto } from '@/modules/wallets/presentation/dtos/balances-response.dto';
import { LedgerHistoryQueryDto } from '@/modules/wallets/presentation/dtos/ledger-history-query.dto';
import { LedgerHistoryResponseDto } from '@/modules/wallets/presentation/dtos/ledger-history-response.dto';

@ApiTags('Wallet')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiUnauthorizedResponse({
  description: 'Cookie de sessão ausente, inválido, expirado ou revogado',
})
@Controller('wallet')
@UseGuards(SessionAuthGuard)
export class WalletController {
  constructor(
    private readonly getWalletBalances: GetWalletBalancesUseCase,
    private readonly getLedgerHistory: GetLedgerHistoryUseCase,
  ) {}

  @Get('balances')
  @ApiOperation({
    summary: 'Lista os saldos da carteira do usuário autenticado (por ativo)',
  })
  @ApiOkResponse({ type: WalletBalanceItemDto, isArray: true })
  async balances(
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletBalanceItemDto[]> {
    const balances = await this.getWalletBalances.execute({
      userId: req.user.userId,
    });
    return balances.map((b) => ({
      asset: b.asset,
      scale: b.scale,
      availableMinor: b.availableMinor.toString(),
      lockedMinor: b.lockedMinor.toString(),
      totalMinor: b.totalMinor.toString(),
    }));
  }

  @Get('ledger')
  @ApiOperation({
    summary: 'Histórico paginado do ledger do usuário autenticado',
  })
  @ApiOkResponse({ type: LedgerHistoryResponseDto })
  async ledger(
    @Req() req: AuthenticatedRequest,
    @Query() query: LedgerHistoryQueryDto,
  ): Promise<LedgerHistoryResponseDto> {
    const result = await this.getLedgerHistory.execute({
      userId: req.user.userId,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: result.items.map(({ entry, scale }) => ({
        id: entry.id,
        account: entry.account,
        asset: entry.asset,
        scale,
        entryType: entry.entryType,
        amountMinor: entry.amountMinor.toString(),
        balanceBeforeMinor:
          entry.balanceBeforeMinor === null
            ? null
            : entry.balanceBeforeMinor.toString(),
        balanceAfterMinor:
          entry.balanceAfterMinor === null
            ? null
            : entry.balanceAfterMinor.toString(),
        createdAt: entry.createdAt.toISOString(),
      })),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    };
  }
}
