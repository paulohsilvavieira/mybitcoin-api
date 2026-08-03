import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Email cadastrado do usuário',
    example: 'ada.lovelace@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Senha do usuário',
    example: 'Str0ng!Pass',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
