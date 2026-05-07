/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// ─────────────────────────────────────────────────────────────────────────────
// Fluxo de logs:
//
//   Winston (Console) ──────────────────────────────────────────→ stdout
//   otelLogger.emit() → OTel SDK → BatchLogRecordProcessor
//                     → OTLPLogExporter (HTTP)
//                     → OTEL Collector (/v1/logs)
//                     → Loki
//
// A app não precisa conhecer o endereço do Loki — apenas o Collector.
// traceId e spanId são injetados em cada log para correlação com traces no Grafana.
// ─────────────────────────────────────────────────────────────────────────────

import { ConsoleLogger } from '@nestjs/common';
import * as winston from 'winston';
import * as dotenv from 'dotenv';
import { utilities as nestWinstonUtils } from 'nest-winston';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { trace } from '@opentelemetry/api';
dotenv.config();

// Instância do logger OTel — conectada ao SDK inicializado em otel.ts
const otelLogger = logs.getLogger(`${process.env.OTEL_APP_NAME}`);

const { combine, timestamp, json } = winston.format;
const { nestLike } = nestWinstonUtils.format;

// Mapeia níveis do Winston para os severity names do OTel/GCP
const levels: object = {
  default: 'DEFAULT',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
};

const severity = winston.format((info) => {
  const { level } = info;
  return Object.assign({}, info, { severity: levels[level] });
});

// Formato legível no terminal (dev) vs JSON estruturado (produção)
const remoteFormat = () => combine(severity(), json());
const localFormat = () => combine(timestamp(), severity(), nestLike());
const isLocal = process.env.NODE_ENV === 'development';

export class TelemetryLoggerConfig extends ConsoleLogger {
  // Winston cuida apenas do stdout — o envio ao Loki é feito pelo OTel SDK
  private logger = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: isLocal ? localFormat() : remoteFormat(),
    transports: [new winston.transports.Console()],
  });

  constructor() {
    super();
  }

  // Retorna traceId e spanId do span ativo para correlacionar logs com traces
  private getTraceInfo() {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    }
    return {};
  }

  log(message: any, context?: string) {
    if (this.shouldLog(context)) {
      const meta = { ...this.getTraceInfo(), context };
      this.logger.info(message, meta);
      otelLogger.emit({
        severityNumber: SeverityNumber.INFO,
        body: message,
        attributes: meta,
      });
    }
  }

  error(message: any, context?: string) {
    if (this.shouldLog(context)) {
      const meta = { ...this.getTraceInfo(), context };
      this.logger.error(message, meta);
      otelLogger.emit({
        severityNumber: SeverityNumber.ERROR,
        body: message,
        attributes: meta,
      });
    }
  }

  warn(message: any, context?: string) {
    if (this.shouldLog(context)) {
      const meta = { ...this.getTraceInfo(), context };
      this.logger.warn(message, meta);
      otelLogger.emit({
        severityNumber: SeverityNumber.WARN,
        body: message,
        attributes: meta,
      });
    }
  }

  debug(message: any, context?: string) {
    if (this.shouldLog(context)) {
      const meta = { ...this.getTraceInfo(), context };
      this.logger.debug(message, meta);
      otelLogger.emit({
        severityNumber: SeverityNumber.DEBUG,
        body: message,
        attributes: meta,
      });
    }
  }

  verbose(message: any, context?: string) {
    if (this.shouldLog(context)) {
      const meta = { ...this.getTraceInfo(), context };
      this.logger.verbose(message, meta);
      otelLogger.emit({
        severityNumber: SeverityNumber.TRACE,
        body: message,
        attributes: meta,
      });
    }
  }

  // Contextos de bootstrap do NestJS que geram ruído nos logs de produção
  private shouldLog(context?: string): boolean {
    if (process.env.NODE_ENV === 'development') return true;

    const ignoredContexts = [
      'InstanceLoader',
      'RoutesResolver',
      'RouterExplorer',
      'NestFactory',
      'NestApplication',
      'RabbitMQModule',
      'AmqpConnection',
      'ApplicationStartup',
    ];

    return !context || !ignoredContexts.includes(context);
  }
}
