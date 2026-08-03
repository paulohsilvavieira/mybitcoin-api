import { ApiProperty } from '@nestjs/swagger';
import { UserStatusType } from '@/modules/identity/domain/value-objects/user-status.vo';

export class LoginResponseDto {
  @ApiProperty({
    description: 'Identificador único do usuário autenticado',
    example: '3f7b8c2e-1a4d-4e9a-9c3f-5d6e7a8b9c0d',
  })
  userId!: string;

  @ApiProperty({
    description: 'Nome do usuário',
    example: 'Ada Lovelace',
  })
  name!: string;

  @ApiProperty({
    description: 'Email normalizado do usuário',
    example: 'ada.lovelace@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Status da conta',
    enum: ['PENDING_EMAIL_VERIFICATION', 'ACTIVE', 'SUSPENDED'],
    example: 'ACTIVE',
  })
  status!: UserStatusType;
}
