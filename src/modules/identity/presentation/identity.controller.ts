import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RegisterUser } from '@/modules/identity/application/register-user.usecase';
import { RegisterUserDto } from '@/modules/identity/presentation/dto/register-user.dto';
import { RegisterUserResponseDto } from '@/modules/identity/presentation/dto/register-user-response.dto';
import { DomainErrorResponseDto } from '@/infrastructure/http/domain-error-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class IdentityController {
  constructor(private readonly registerUser: RegisterUser) {}

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
  async register(@Body() dto: RegisterUserDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return this.registerUser.execute({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      termsAccepted: dto.termsAccepted,
      registrationIp: ip,
    });
  }
}
