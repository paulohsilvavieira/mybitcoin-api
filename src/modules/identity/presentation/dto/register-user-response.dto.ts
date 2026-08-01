import { ApiProperty } from '@nestjs/swagger';

export class RegisterUserResponseDto {
  @ApiProperty({
    description: 'Identificador único do usuário criado',
    example: '3f7b8c2e-1a4d-4e9a-9c3f-5d6e7a8b9c0d',
  })
  userId!: string;

  @ApiProperty({
    description: 'Email normalizado do usuário',
    example: 'user@example.com',
  })
  email!: string;
}
