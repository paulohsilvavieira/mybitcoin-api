import { ApiProperty } from '@nestjs/swagger';

export class LedgerEntryDto {
  @ApiProperty({ example: '9a1b2c3d-4e5f-6789-abcd-ef0123456789' })
  id!: string;

  @ApiProperty({
    description: 'Conta contábil (contrato canônico do ledger)',
    example: 'USER_AVAILABLE:7c9e6679-7425-40de-944b-e07fc1f90ae7:BTC',
  })
  account!: string;

  @ApiProperty({ example: 'BTC' })
  asset!: string;

  @ApiProperty({
    description: 'Casas decimais (menor unidade) do ativo',
    example: 8,
  })
  scale!: number;

  @ApiProperty({ enum: ['debit', 'credit'], example: 'credit' })
  entryType!: 'debit' | 'credit';

  @ApiProperty({
    description: 'Valor da perna na menor unidade do ativo (string)',
    example: '50000000',
  })
  amountMinor!: string;

  @ApiProperty({
    description:
      'Saldo da conta antes da perna (string) — null para contas operacionais',
    example: '0',
    nullable: true,
  })
  balanceBeforeMinor!: string | null;

  @ApiProperty({
    description:
      'Saldo da conta depois da perna (string) — null para contas operacionais',
    example: '50000000',
    nullable: true,
  })
  balanceAfterMinor!: string | null;

  @ApiProperty({
    description: 'Data de criação da perna (ISO 8601)',
    example: '2026-08-29T14:30:00.000Z',
  })
  createdAt!: string;
}

export class LedgerHistoryResponseDto {
  @ApiProperty({ type: LedgerEntryDto, isArray: true })
  items!: LedgerEntryDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({
    description: 'Total de pernas do usuário (todas as páginas)',
    example: 4,
  })
  total!: number;
}
