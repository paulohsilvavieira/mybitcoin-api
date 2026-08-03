import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class ConfirmDepositInputDTO {
  @ApiProperty({
    description: 'Identificador da transação de depósito a ser confirmada',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  })
  @IsUUID()
  transactionId!: string;

  @ApiProperty({
    description: 'Número de confirmações on-chain recebidas até o momento',
    example: 3,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  confirmations!: number;
}
