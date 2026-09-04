import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailResponseDto {
  @ApiProperty({
    description: 'Identificador único do usuário verificado',
    example: '3f7b8c2e-1a4d-4e9a-9c3f-5d6e7a8b9c0d',
  })
  userId!: string;

  @ApiProperty({
    description: 'Email normalizado do usuário',
    example: 'ada.lovelace@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Status da conta após a verificação',
    example: 'ACTIVE',
  })
  status!: string;
}
