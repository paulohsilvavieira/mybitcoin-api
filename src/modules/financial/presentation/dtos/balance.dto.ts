import { ApiProperty } from '@nestjs/swagger';

export class BalanceDto {
  @ApiProperty({
    description: 'Código do ativo',
    example: 'BTC',
  })
  asset!: string;

  @ApiProperty({
    description:
      'Saldo disponível, em satoshi (bigint serializado como string)',
    example: '150000',
  })
  available!: string;

  @ApiProperty({
    description: 'Saldo bloqueado, em satoshi (bigint serializado como string)',
    example: '0',
  })
  locked!: string;

  @ApiProperty({
    description:
      'Saldo total (available + locked), em satoshi (bigint serializado como string)',
    example: '150000',
  })
  total!: string;
}
