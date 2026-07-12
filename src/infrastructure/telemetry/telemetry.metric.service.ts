import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter, Meter, metrics } from '@opentelemetry/api';

@Injectable()
export class TelemetryMetricService implements OnModuleInit {
  public readonly logger: Logger;
  public readonly meter: Meter;
  public readonly requestCounter: Counter;
  public readonly errorCounter: Counter;
  constructor(private readonly configService: ConfigService) {
    this.logger = new Logger(TelemetryMetricService.name);
    this.meter = metrics.getMeter(
      this.configService.getOrThrow('OTEL_SERVICE_NAME'),
    );

    this.requestCounter = this.meter.createCounter('custom_requests_total', {
      description: 'Contador de requisições HTTP',
    });

    this.errorCounter = this.meter.createCounter('custom_errors_total', {
      description: 'Contador de erros da aplicação',
    });
  }
  onModuleInit() {
    this.logger.log('✅ Metrics Started');
  }
}
