import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationEmailDto {
  @ApiProperty({
    description: 'Email da conta para reenvio do e-mail de verificação',
    example: 'ada.lovelace@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;
}
