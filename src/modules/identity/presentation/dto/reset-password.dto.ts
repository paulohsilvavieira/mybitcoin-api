import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description:
      'Token de redefinição recebido por email (parâmetro da URL do link)',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({
    description:
      'Nova senha com no mínimo 8 caracteres, contendo maiúscula, minúscula, número e caractere especial',
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
}
