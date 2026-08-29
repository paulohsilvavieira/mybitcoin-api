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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiAcceptedResponse,
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
import { RequestPasswordReset } from '@/modules/identity/application/request-password-reset.usecase';
import { ConfirmPasswordReset } from '@/modules/identity/application/confirm-password-reset.usecase';
import { Login } from '@/modules/identity/application/login.usecase';
import { Logout } from '@/modules/identity/application/logout.usecase';
import { GetCurrentUser } from '@/modules/identity/application/get-current-user.usecase';
import { CreateSession } from '@/modules/identity/application/create-session.usecase';
import { RevokeAllSessions } from '@/modules/identity/application/revoke-all-sessions.usecase';
import { RegisterUserDto } from '@/modules/identity/presentation/dto/register-user.dto';
import { RegisterUserResponseDto } from '@/modules/identity/presentation/dto/register-user-response.dto';
import { LoginDto } from '@/modules/identity/presentation/dto/login.dto';
import { LoginResponseDto } from '@/modules/identity/presentation/dto/login-response.dto';
import { ForgotPasswordDto } from '@/modules/identity/presentation/dto/forgot-password.dto';
import { ForgotPasswordResponseDto } from '@/modules/identity/presentation/dto/forgot-password-response.dto';
import { ResetPasswordDto } from '@/modules/identity/presentation/dto/reset-password.dto';
import { MeResponseDto } from '@/modules/identity/presentation/dto/me-response.dto';
import { DomainErrorResponseDto } from '@/infrastructure/http/domain-error-response.dto';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';
import {
  SESSION_COOKIE_NAME,
  setSessionCookies,
  clearSessionCookies,
} from '@/modules/identity/presentation/session-cookies';
import { InvalidCredentialsError } from '@/modules/identity/domain/errors/invalid-credentials.error';
import { AccountSuspendedError } from '@/modules/identity/domain/errors/account-suspended.error';
import { TooManyLoginAttemptsError } from '@/modules/identity/domain/errors/too-many-login-attempts.error';

/**
 * Rate-limit por IP dos endpoints de recuperação de senha: 10 req/min.
 * Reusado no `@Throttle` dos dois endpoints e no `ThrottlerModule.forRoot`.
 */
export const PASSWORD_RESET_THROTTLE = { limit: 10, ttl: 60_000 };

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
    private readonly requestPasswordReset: RequestPasswordReset,
    private readonly confirmPasswordReset: ConfirmPasswordReset,
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

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: PASSWORD_RESET_THROTTLE })
  @ApiOperation({
    summary: 'Solicita a redefinição de senha (REC-001)',
    description:
      'Envia um link de redefinição para o email informado, quando existir uma conta elegível (PENDING_EMAIL_VERIFICATION ou ACTIVE). A resposta é SEMPRE neutra e idêntica (202 + mesma mensagem) para email existente, inexistente, conta suspensa ou rate-limit por email estourado (LOG-003) — não vaza a existência de conta. Rate-limit por IP: 10 req/min.',
  })
  @ApiBody({
    type: ForgotPasswordDto,
    examples: {
      default: {
        summary: 'Solicitação válida',
        value: { email: 'ada.lovelace@example.com' },
      },
    },
  })
  @ApiAcceptedResponse({
    description: 'Solicitação recebida — resposta neutra (sempre a mesma)',
    type: ForgotPasswordResponseDto,
    example: {
      message:
        'Se existir uma conta para este e-mail, enviamos um link de redefinição.',
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
    description: 'Excesso de solicitações do mesmo IP (10 req/min)',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<ForgotPasswordResponseDto> {
    const ipAddress = resolveIp(req);

    await this.requestPasswordReset.execute({ email: dto.email, ipAddress });

    this.logger.log('Password reset requested', {
      operation: 'password_reset.request',
      ipAddress,
    });

    return {
      message:
        'Se existir uma conta para este e-mail, enviamos um link de redefinição.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: PASSWORD_RESET_THROTTLE })
  @ApiOperation({
    summary: 'Redefine a senha a partir de um token (REC-003..006)',
    description:
      'Valida a política de senha e o token (uso único, expiração de 30 min). Em caso de sucesso: troca a senha, consome o token, revoga TODAS as sessões do usuário (REC-006), limpa o bloqueio de login por tentativas e limpa os cookies de sessão da resposta. Responde 204.',
  })
  @ApiBody({
    type: ResetPasswordDto,
    examples: {
      default: {
        summary: 'Redefinição válida',
        value: { token: 'a1b2c3d4e5f6', password: 'Str0ng!Pass' },
      },
    },
  })
  @ApiNoContentResponse({
    description: 'Senha redefinida — sessões revogadas e cookies limpos',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Token inválido/expirado/consumido (INVALID_RESET_TOKEN) ou nova senha fora da política (WEAK_PASSWORD)',
    type: DomainErrorResponseDto,
    examples: {
      invalidResetToken: {
        summary: 'Token inválido ou expirado',
        value: {
          code: 'INVALID_RESET_TOKEN',
          message: 'Invalid or expired password reset token',
        },
      },
      weakPassword: {
        summary: 'Senha fora da política',
        value: {
          code: 'WEAK_PASSWORD',
          message:
            'Password must contain at least 8 characters with uppercase, lowercase, number and special character',
        },
      },
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
  @ApiTooManyRequestsResponse({
    description: 'Excesso de solicitações do mesmo IP (10 req/min)',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { revokedSessionCount } = await this.confirmPasswordReset.execute({
      token: dto.token,
      newPassword: dto.password,
      ipAddress: resolveIp(req),
    });

    clearSessionCookies(res);

    this.logger.log('Password reset completed', {
      operation: 'password_reset.confirm',
      revokedSessionCount,
    });
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
