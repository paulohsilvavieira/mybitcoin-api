import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KycStatusResponseDto {
  @ApiProperty({
    description: 'Estado do KYC do usuário',
    enum: ['NOT_SUBMITTED', 'APPROVED', 'REJECTED'],
    example: 'APPROVED',
  })
  status!: 'NOT_SUBMITTED' | 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'Ada Lovelace' })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'CPF mascarado',
    example: '***.***.**-09',
  })
  maskedCpf?: string;

  @ApiPropertyOptional({ example: '1990-05-20' })
  birthDate?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2', example: 'BR' })
  nationality?: string;

  @ApiPropertyOptional({
    description: 'Código do motivo quando status = REJECTED',
    example: 'INVALID_CPF',
  })
  rejectionReason?: string;

  @ApiPropertyOptional({
    description: 'ISO — presente quando status = APPROVED',
    example: '2026-08-29T12:00:00.000Z',
  })
  approvedAt?: string;
}

export class SubmitKycResponseDto {
  @ApiProperty({ example: 'APPROVED' })
  status!: 'APPROVED';

  @ApiProperty({ example: '2026-08-29T12:00:00.000Z' })
  approvedAt!: string;
}
