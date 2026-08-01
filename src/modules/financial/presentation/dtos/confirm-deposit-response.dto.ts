import { ApiProperty } from '@nestjs/swagger';

export class ConfirmDepositResponseDto {
  @ApiProperty({
    description: 'Status da confirmação do depósito',
    example: 'confirmed',
  })
  status!: string;
}
