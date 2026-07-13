import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RegisterUser } from '../application/register-user.usecase';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class IdentityController {
  constructor(private readonly registerUser: RegisterUser) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterUserDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return this.registerUser.execute({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      termsAccepted: dto.termsAccepted,
      registrationIp: ip,
    });
  }
}
