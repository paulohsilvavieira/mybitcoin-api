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
import { ListActiveSessions } from '@/modules/identity/application/list-active-sessions.usecase';
import { RevokeSession } from '@/modules/identity/application/revoke-session.usecase';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';

@Controller('sessions')
@UseGuards(SessionAuthGuard)
export class SessionsController {
  constructor(
    private readonly listActiveSessions: ListActiveSessions,
    private readonly revokeSession: RevokeSession,
  ) {}

  @Get()
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
