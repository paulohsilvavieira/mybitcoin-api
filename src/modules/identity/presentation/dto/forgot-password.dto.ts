import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description:
      'Email da conta para a qual o link de redefinição será enviado',
    example: 'ada.lovelace@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;
}
