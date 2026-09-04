import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RegisterUser } from '@/modules/identity/application/register-user.usecase';
import { Login } from '@/modules/identity/application/login.usecase';
import { Logout } from '@/modules/identity/application/logout.usecase';
import { GetCurrentUser } from '@/modules/identity/application/get-current-user.usecase';
import { CreateSession } from '@/modules/identity/application/create-session.usecase';
import { RevokeAllSessions } from '@/modules/identity/application/revoke-all-sessions.usecase';
import { RegisterUserDto } from '@/modules/identity/presentation/dto/register-user.dto';
import { RegisterUserResponseDto } from '@/modules/identity/presentation/dto/register-user-response.dto';
import { LoginDto } from '@/modules/identity/presentation/dto/login.dto';
import { LoginResponseDto } from '@/modules/identity/presentation/dto/login-response.dto';
import { MeResponseDto } from '@/modules/identity/presentation/dto/me-response.dto';
import { AdminStatusResponseDto } from '@/modules/identity/presentation/dto/admin-status-response.dto';
import { DomainErrorResponseDto } from '@/infrastructure/http/domain-error-response.dto';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { AdminGuard } from '@/modules/identity/presentation/guards/admin.guard';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';
import {
  SESSION_COOKIE_NAME,
  setSessionCookies,
  clearSessionCookies,
} from '@/modules/identity/presentation/session-cookies';
import { InvalidCredentialsError } from '@/modules/identity/domain/errors/invalid-credentials.error';
import { AccountSuspendedError } from '@/modules/identity/domain/errors/account-suspended.error';
import { TooManyLoginAttemptsError } from '@/modules/identity/domain/errors/too-many-login-attempts.error';

function resolveIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function resolveDeviceInfo(req: Request): string {
  return req.headers['user-agent'] ?? 'unknown';
}

@ApiTags('Auth')
@Controller('auth')
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);

  constructor(
    private readonly registerUser: RegisterUser,
    private readonly login: Login,
    private readonly logoutUseCase: Logout,
    private readonly getCurrentUser: GetCurrentUser,
    private readonly createSession: CreateSession,
    private readonly revokeAllSessions: RevokeAllSessions,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registra um novo usuário',
    description:
      'Cria a conta do usuário, dispara o email de verificação e retorna o identificador criado. O usuário permanece não verificado (KYC pendente) até concluir o fluxo de verificação de email.',
  })
  @ApiBody({
    type: RegisterUserDto,
    examples: {
      default: {
        summary: 'Cadastro válido',
        value: {
          name: 'Ada Lovelace',
          email: 'ada.lovelace@example.com',
          password: 'Str0ng!Pass',
          termsAccepted: true,
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Usuário registrado com sucesso',
    type: RegisterUserResponseDto,
    example: {
      userId: '3f7b8c2e-1a4d-4e9a-9c3f-5d6e7a8b9c0d',
      email: 'ada.lovelace@example.com',
    },
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Falha de regra de negócio: email já cadastrado, termos não aceitos ou email inválido',
    type: DomainErrorResponseDto,
    examples: {
      emailAlreadyExists: {
        summary: 'Email já cadastrado',
        value: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: "Email 'ada.lovelace@example.com' is already registered",
        },
      },
      termsNotAccepted: {
        summary: 'Termos não aceitos',
        value: {
          code: 'TERMS_NOT_ACCEPTED',
          message: 'User must accept Terms of Use and Privacy Policy',
        },
      },
      invalidEmail: {
        summary: 'Email com formato inválido',
        value: {
          code: 'INVALID_EMAIL',
          message: "Invalid email format: 'not-an-email'",
        },
      },
    },
  })
  async register(@Body() dto: RegisterUserDto, @Req() req: Request) {
    return this.registerUser.execute({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      termsAccepted: dto.termsAccepted,
      registrationIp: resolveIp(req),
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autentica o usuário e abre uma sessão',
    description:
      'Valida as credenciais e, em caso de sucesso, define os cookies `__Host-session` (httpOnly) e `__Host-csrf` (legível pelo JS, usado no header X-CSRF-Token das requisições mutantes). Contas em PENDING_EMAIL_VERIFICATION também podem autenticar enquanto o fluxo de verificação de email não existir.',
  })
  @ApiBody({
    type: LoginDto,
    examples: {
      default: {
        summary: 'Login válido',
        value: {
          email: 'ada.lovelace@example.com',
          password: 'Str0ng!Pass',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Autenticado com sucesso — cookies de sessão definidos',
    type: LoginResponseDto,
    example: {
      userId: '3f7b8c2e-1a4d-4e9a-9c3f-5d6e7a8b9c0d',
      name: 'Ada Lovelace',
      email: 'ada.lovelace@example.com',
      status: 'ACTIVE',
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Credenciais inválidas — mensagem genérica idêntica para email inexistente e senha incorreta',
    type: DomainErrorResponseDto,
    example: {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    },
  })
  @ApiForbiddenResponse({
    description: 'Conta suspensa',
    type: DomainErrorResponseDto,
    example: {
      code: 'ACCOUNT_SUSPENDED',
      message: 'This account has been suspended',
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'Email com formato inválido',
    type: DomainErrorResponseDto,
    example: {
      code: 'INVALID_EMAIL',
      message: "Invalid email format: 'not-an-email'",
    },
  })
  @ApiTooManyRequestsResponse({
    description:
      'Bloqueado por excesso de tentativas falhas (LOG-006) — 5 falhas, bloqueio de 15min a partir da falha mais recente',
    type: DomainErrorResponseDto,
    example: {
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Too many failed login attempts. Try again later.',
    },
  })
  async authenticate(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const startTime = Date.now();
    const ipAddress = resolveIp(req);

    this.logger.log('Login attempt started', {
      operation: 'login.start',
      email: dto.email,
      ipAddress,
    });

    let user: LoginResponseDto;
    try {
      user = await this.login.execute({
        email: dto.email,
        password: dto.password,
        ipAddress,
      });
    } catch (error) {
      this.logLoginFailure(error, dto.email, ipAddress, startTime);
      throw error;
    }

    const session = await this.createSession.execute({
      userId: user.userId,
      deviceInfo: resolveDeviceInfo(req),
      ipAddress,
    });

    setSessionCookies(res, {
      token: session.token,
      expiresAt: session.expiresAt,
    });

    this.logger.log('Login succeeded', {
      operation: 'login.success',
      userId: user.userId,
      sessionId: session.sessionId,
      email: dto.email,
      ipAddress,
      duration_ms: Date.now() - startTime,
    });

    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Encerra a sessão atual',
    description:
      'Idempotente (OUT-001/OUT-003): responde 204 e limpa os cookies mesmo sem cookie de sessão, ou com sessão já expirada/revogada. Por isso não usa o guard de sessão.',
  })
  @ApiNoContentResponse({
    description: 'Sessão encerrada (ou já estava encerrada) — cookies limpos',
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

    const { event } = await this.logoutUseCase.execute({ token });

    clearSessionCookies(res);

    this.logger.log('Logout completed', {
      operation: 'logout',
      sessionId: event?.sessionId ?? null,
      revoked: event !== null,
    });
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Encerra todas as sessões do usuário autenticado',
    description:
      'Requer sessão válida e o header X-CSRF-Token (valor do cookie __Host-csrf), pois é uma requisição mutante.',
  })
  @ApiNoContentResponse({
    description: 'Todas as sessões revogadas — cookies limpos',
  })
  @ApiUnauthorizedResponse({
    description: 'Cookie de sessão ausente, inválido, expirado ou revogado',
  })
  @ApiForbiddenResponse({
    description:
      'Header X-CSRF-Token ausente ou divergente do cookie __Host-csrf',
  })
  async logoutAll(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { events } = await this.revokeAllSessions.execute({
      userId: req.user.userId,
      reason: 'logout_all',
    });

    clearSessionCookies(res);

    this.logger.log('All sessions revoked', {
      operation: 'logout_all',
      userId: req.user.userId,
      revokedCount: events.length,
    });
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Retorna o usuário autenticado',
    description:
      'Usado pelo frontend para restaurar o estado de autenticação no carregamento da página, já que o cookie de sessão é httpOnly e opaco ao JavaScript.',
  })
  @ApiOkResponse({
    description: 'Dados do usuário autenticado',
    type: MeResponseDto,
    example: {
      id: '3f7b8c2e-1a4d-4e9a-9c3f-5d6e7a8b9c0d',
      name: 'Ada Lovelace',
      email: 'ada.lovelace@example.com',
      status: 'ACTIVE',
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Cookie de sessão ausente/inválido, ou sessão válida cujo usuário não existe mais',
    type: DomainErrorResponseDto,
    example: {
      code: 'USER_NOT_FOUND',
      message: 'User not found',
    },
  })
  async me(@Req() req: AuthenticatedRequest): Promise<MeResponseDto> {
    return this.getCurrentUser.execute({ userId: req.user.userId });
  }

  @Get('me/admin-status')
  @UseGuards(SessionAuthGuard, AdminGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Retorna o papel administrativo do usuário autenticado',
    description:
      'Usado pelo frontend após o login para decidir se exibe a área administrativa. Retorna 200 com o papel se o usuário é administrador; 403 se não é; 401 se não há sessão.',
  })
  @ApiOkResponse({
    description: 'Usuário autenticado é administrador',
    type: AdminStatusResponseDto,
    example: { role: 'SUPER_ADMIN' },
  })
  @ApiForbiddenResponse({
    description: 'Usuário autenticado não é administrador',
    type: DomainErrorResponseDto,
  })
  meAdminStatus(@Req() req: AuthenticatedRequest): AdminStatusResponseDto {
    return { role: req.admin!.role };
  }

  private logLoginFailure(
    error: unknown,
    email: string,
    ipAddress: string,
    startTime: number,
  ): void {
    if (error instanceof InvalidCredentialsError) {
      this.warnLoginRejected(
        'Login rejected: invalid credentials',
        'login.error.invalid_credentials',
        error.code,
        { email, ipAddress },
        startTime,
      );
      return;
    }

    if (error instanceof AccountSuspendedError) {
      this.warnLoginRejected(
        'Login rejected: account suspended',
        'login.error.account_suspended',
        error.code,
        { userId: error.userId, email, ipAddress },
        startTime,
      );
      return;
    }

    if (error instanceof TooManyLoginAttemptsError) {
      this.warnLoginRejected(
        'Login rejected: too many attempts',
        'login.error.too_many_attempts',
        error.code,
        { email, ipAddress },
        startTime,
      );
      return;
    }

    this.warnLoginRejected(
      'Login failed',
      'login.error',
      error instanceof Error ? error.name : 'UNKNOWN',
      { email, ipAddress },
      startTime,
    );
  }

  private warnLoginRejected(
    message: string,
    operation: string,
    reason: string,
    fields: Record<string, unknown>,
    startTime: number,
  ): void {
    this.logger.warn(message, {
      operation,
      ...fields,
      reason,
      duration_ms: Date.now() - startTime,
    });
  }
}
