import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({
    description: 'Identificador único da sessão',
    example: '9a1b2c3d-4e5f-6789-abcd-ef0123456789',
  })
  id!: string;

  @ApiProperty({
    description: 'Informação do dispositivo/user-agent que criou a sessão',
    example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0',
    nullable: true,
  })
  deviceInfo!: string | null;

  @ApiProperty({
    description: 'Endereço IP de origem da sessão',
    example: '203.0.113.42',
    nullable: true,
  })
  ipAddress!: string | null;

  @ApiProperty({
    description: 'Data de criação da sessão',
    example: '2026-08-01T14:30:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Data da última atividade registrada na sessão',
    example: '2026-08-01T15:45:00.000Z',
  })
  lastActivityAt!: Date;

  @ApiProperty({
    description: 'Data de expiração da sessão',
    example: '2026-08-08T14:30:00.000Z',
  })
  expiresAt!: Date;
}
