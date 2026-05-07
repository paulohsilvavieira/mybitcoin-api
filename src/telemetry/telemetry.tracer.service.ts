/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace, Tracer } from '@opentelemetry/api';

@Injectable()
export class TelemetryTracerService implements OnModuleInit {
  public readonly trace: Tracer;
  public readonly logger: Logger;

  constructor(private readonly configService: ConfigService) {
    this.logger = new Logger(TelemetryTracerService.name);
    this.trace = trace.getTracer(
      this.configService.getOrThrow('OTEL_SERVICE_NAME'),
    );
  }

  onModuleInit() {
    this.logger.log('✅ Tracer Started!');
  }
}
