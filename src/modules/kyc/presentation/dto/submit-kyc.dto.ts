import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitKycDto {
  @ApiProperty({
    description: 'Nome completo (nome e sobrenome)',
    example: 'Ada Lovelace',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({
    description: 'CPF — com ou sem máscara (11 dígitos)',
    example: '123.456.789-09',
  })
  @IsString()
  @Matches(/^\D*(\d\D*){11}$/, {
    message: 'cpf must contain exactly 11 digits',
  })
  cpf!: string;

  @ApiProperty({
    description: 'Data de nascimento no formato YYYY-MM-DD',
    example: '1990-05-20',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birthDate must be a valid date in YYYY-MM-DD format',
  })
  birthDate!: string;

  @ApiProperty({
    description: 'Nacionalidade — código de país ISO 3166-1 alpha-2',
    example: 'BR',
  })
  @IsString()
  @Length(2, 2)
  nationality!: string;
}
