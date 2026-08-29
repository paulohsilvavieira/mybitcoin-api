import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordResponseDto {
  @ApiProperty({
    description:
      'Mensagem neutra (LOG-003) — idêntica para email existente, inexistente ou suspenso',
    example:
      'Se existir uma conta para este e-mail, enviamos um link de redefinição.',
  })
  message!: string;
}
