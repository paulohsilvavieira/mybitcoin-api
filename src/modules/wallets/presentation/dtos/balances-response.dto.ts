import { ApiProperty } from '@nestjs/swagger';

export class WalletBalanceItemDto {
  @ApiProperty({ description: 'Símbolo do ativo', example: 'BTC' })
  asset!: string;

  @ApiProperty({
    description: 'Casas decimais (menor unidade) do ativo — de assets.scale',
    example: 8,
  })
  scale!: number;

  @ApiProperty({
    description:
      'Saldo disponível na menor unidade do ativo (string — bigint não serializa em JSON)',
    example: '50000000',
  })
  availableMinor!: string;

  @ApiProperty({
    description: 'Saldo bloqueado na menor unidade do ativo',
    example: '0',
  })
  lockedMinor!: string;

  @ApiProperty({
    description: 'Saldo total (disponível + bloqueado) na menor unidade',
    example: '50000000',
  })
  totalMinor!: string;
}
