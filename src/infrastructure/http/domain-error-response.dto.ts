import { ApiProperty } from '@nestjs/swagger';

export class DomainErrorResponseDto {
  @ApiProperty({
    description: 'Código estável do erro de domínio',
    example: 'EMAIL_ALREADY_EXISTS',
  })
  code!: string;

  @ApiProperty({
    description: 'Mensagem legível descrevendo o erro',
    example: "Email 'user@example.com' is already registered",
  })
  message!: string;
}
