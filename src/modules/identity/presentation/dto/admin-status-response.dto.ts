import { ApiProperty } from '@nestjs/swagger';

export class AdminStatusResponseDto {
  @ApiProperty({
    description: 'Papel administrativo do usuário autenticado',
    example: 'SUPER_ADMIN',
  })
  role!: string;
}
