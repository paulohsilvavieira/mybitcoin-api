import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/health')
  health(): { msg: string } {
    return {
      msg: 'ok',
    };
  }
}
