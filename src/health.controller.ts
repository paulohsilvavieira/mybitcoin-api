import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class HealthController {
  @Get('/health')
  @ApiOperation({ summary: 'Verifica se a API está no ar' })
  @ApiOkResponse({
    description: 'API disponível',
    example: { msg: 'ok' },
  })
  health(): { msg: string } {
    return {
      msg: 'ok',
    };
  }
}
