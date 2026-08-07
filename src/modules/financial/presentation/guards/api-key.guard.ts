import { timingSafeEqual } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

/**
 * Protege endpoints internos (chamados por serviços da própria infraestrutura,
 * como o monitor de blockchain) com uma API key estática lida do header
 * `X-Internal-Api-Key`, comparada em tempo constante contra
 * `BLOCKCHAIN_MONITOR_API_KEY` para evitar timing attacks.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[INTERNAL_API_KEY_HEADER];
    const expected = this.config.get<string>('BLOCKCHAIN_MONITOR_API_KEY');

    if (
      typeof provided !== 'string' ||
      !expected ||
      !this.matches(provided, expected)
    ) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private matches(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
      // Compara o buffer contra si mesmo para manter o tempo de execução
      // consistente mesmo quando o tamanho já revelaria a diferença.
      timingSafeEqual(providedBuffer, providedBuffer);
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
