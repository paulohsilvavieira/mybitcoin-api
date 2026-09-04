import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  LEDGER_MAX_PAGE_SIZE,
  LEDGER_DEFAULT_PAGE_SIZE,
} from '@/modules/wallets/application/get-ledger-history.usecase';

export class LedgerHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Número da página (começa em 1)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: `Itens por página (1..${LEDGER_MAX_PAGE_SIZE})`,
    example: LEDGER_DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: LEDGER_MAX_PAGE_SIZE,
    default: LEDGER_DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LEDGER_MAX_PAGE_SIZE)
  pageSize: number = LEDGER_DEFAULT_PAGE_SIZE;
}
