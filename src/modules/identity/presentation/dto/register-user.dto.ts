import {
  IsEmail,
  IsString,
  IsBoolean,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterUserDto {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'Ada Lovelace',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    description: 'Email do usuário — usado para login e verificação',
    example: 'ada.lovelace@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description:
      'Senha com no mínimo 8 caracteres, contendo maiúscula, minúscula, número e caractere especial',
    example: 'Str0ng!Pass',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/,
    {
      message:
        'Password must contain at least 8 characters with uppercase, lowercase, number and special character',
    },
  )
  password!: string;

  @ApiProperty({
    description:
      'Confirmação de aceite dos Termos de Uso e Política de Privacidade',
    example: true,
  })
  @IsBoolean()
  termsAccepted!: boolean;
}
