import {
  Controller,
  Get,
  Delete,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ListActiveSessions } from '@/modules/identity/application/list-active-sessions.usecase';
import { RevokeSession } from '@/modules/identity/application/revoke-session.usecase';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';
import { SessionResponseDto } from '@/modules/identity/presentation/dto/session-response.dto';
import { DomainErrorResponseDto } from '@/infrastructure/http/domain-error-response.dto';
import { SESSION_COOKIE_NAME } from '@/modules/identity/presentation/session-cookies';

@ApiTags('Sessions')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiUnauthorizedResponse({
  description: 'Cookie de sessão ausente, inválido, expirado ou revogado',
})
@Controller('sessions')
@UseGuards(SessionAuthGuard)
export class SessionsController {
  constructor(
    private readonly listActiveSessions: ListActiveSessions,
    private readonly revokeSession: RevokeSession,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista as sessões ativas do usuário autenticado',
  })
  @ApiOkResponse({
    description: 'Lista de sessões ativas',
    type: SessionResponseDto,
    isArray: true,
    example: [
      {
        id: '9a1b2c3d-4e5f-6789-abcd-ef0123456789',
        deviceInfo:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0',
        ipAddress: '203.0.113.42',
        createdAt: '2026-08-01T14:30:00.000Z',
        lastActivityAt: '2026-08-01T15:45:00.000Z',
        expiresAt: '2026-08-08T14:30:00.000Z',
      },
    ],
  })
  async list(@Req() req: AuthenticatedRequest) {
    const { sessions } = await this.listActiveSessions.execute({
      userId: req.user.userId,
    });

    return sessions.map((session) => ({
      id: session.id.toString(),
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoga uma sessão ativa do usuário autenticado',
    description:
      'Requer também o header X-CSRF-Token (valor do cookie __Host-csrf), pois é uma requisição mutante.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador da sessão a ser revogada',
    example: '9a1b2c3d-4e5f-6789-abcd-ef0123456789',
  })
  @ApiNoContentResponse({ description: 'Sessão revogada com sucesso' })
  @ApiForbiddenResponse({
    description:
      'Header X-CSRF-Token ausente ou divergente do cookie __Host-csrf',
  })
  @ApiNotFoundResponse({
    description: 'Sessão não encontrada',
    type: DomainErrorResponseDto,
    example: {
      code: 'SESSION_NOT_FOUND',
      message: "Session '9a1b2c3d-4e5f-6789-abcd-ef0123456789' not found",
    },
  })
  @ApiConflictResponse({
    description: 'Sessão já revogada anteriormente',
    type: DomainErrorResponseDto,
    example: {
      code: 'SESSION_ALREADY_REVOKED',
      message:
        "Session '9a1b2c3d-4e5f-6789-abcd-ef0123456789' is already revoked",
    },
  })
  async revoke(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.revokeSession.execute({
      sessionId: id,
      requestingUserId: req.user.userId,
    });
  }
}
