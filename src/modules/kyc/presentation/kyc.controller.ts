import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { DomainErrorResponseDto } from '@/infrastructure/http/domain-error-response.dto';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';
import { SESSION_COOKIE_NAME } from '@/modules/identity/presentation/session-cookies';
import { SubmitKyc } from '@/modules/kyc/application/submit-kyc.usecase';
import { GetMyKycStatus } from '@/modules/kyc/application/get-my-kyc-status.usecase';
import { SubmitKycDto } from '@/modules/kyc/presentation/dto/submit-kyc.dto';
import {
  KycStatusResponseDto,
  SubmitKycResponseDto,
} from '@/modules/kyc/presentation/dto/kyc-status-response.dto';

function resolveIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

@ApiTags('KYC')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiUnauthorizedResponse({
  description: 'Cookie de sessão ausente, inválido, expirado ou revogado',
})
@Controller('kyc')
@UseGuards(SessionAuthGuard)
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(
    private readonly submitKyc: SubmitKyc,
    private readonly getMyKycStatus: GetMyKycStatus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submete (ou reenvia) os dados de KYC',
    description:
      'Aprovação automática síncrona. Reenvio só é aceito quando o KYC atual está REJECTED. Requer o header X-CSRF-Token.',
  })
  @ApiCreatedResponse({
    description: 'KYC aprovado',
    type: SubmitKycResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Falha de validação de domínio: INVALID_CPF, INVALID_FULL_NAME, INVALID_BIRTH_DATE, UNDERAGE, INVALID_NATIONALITY',
    type: DomainErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'CPF já vinculado a outra conta aprovada (CPF_ALREADY_IN_USE) ou KYC já aprovado (KYC_ALREADY_APPROVED)',
    type: DomainErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description:
      'Header X-CSRF-Token ausente ou divergente do cookie __Host-csrf',
  })
  async submit(
    @Body() dto: SubmitKycDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SubmitKycResponseDto> {
    const result = await this.submitKyc.execute({
      userId: req.user.userId,
      fullName: dto.fullName,
      cpf: dto.cpf,
      birthDate: dto.birthDate,
      nationality: dto.nationality,
      ip: resolveIp(req),
    });

    this.logger.log('KYC submission approved', {
      operation: 'kyc.submit',
      userId: req.user.userId,
    });

    return {
      status: result.status,
      approvedAt: result.approvedAt.toISOString(),
    };
  }

  @Get('me')
  @ApiOperation({
    summary: 'Status de KYC do usuário autenticado',
    description:
      'Retorna NOT_SUBMITTED quando o usuário nunca submeteu. CPF sempre mascarado.',
  })
  @ApiOkResponse({ type: KycStatusResponseDto })
  async myStatus(
    @Req() req: AuthenticatedRequest,
  ): Promise<KycStatusResponseDto> {
    return this.getMyKycStatus.execute({ userId: req.user.userId });
  }
}
