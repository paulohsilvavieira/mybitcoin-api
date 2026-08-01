import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  READ_POOL_TOKEN,
  WRITE_POOL_TOKEN,
} from '@/infrastructure/database/database.token';

export const DatabaseWriteConnectionProvider: FactoryProvider = {
  provide: WRITE_POOL_TOKEN,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({
      host: config.get<string>('DB_WRITE_HOST') ?? config.getOrThrow('DB_HOST'),
      port:
        config.get<number>('DB_WRITE_PORT') ??
        config.getOrThrow<number>('DB_PORT'),
      database: config.getOrThrow('DB_NAME'),
      user: config.getOrThrow('DB_USER'),
      password: config.getOrThrow('DB_PASSWORD'),
      max: config.get('DB_POOL_SIZE', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    }),
};

export const DatabaseReadConnectionProvider: FactoryProvider = {
  provide: READ_POOL_TOKEN,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({
      host: config.getOrThrow('DB_READ_HOST'),
      port: config.getOrThrow<number>('DB_READ_PORT'),
      database: config.getOrThrow('DB_NAME'),
      user: config.getOrThrow('DB_USER'),
      password: config.getOrThrow('DB_PASSWORD'),
      max: config.get('DB_POOL_SIZE', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    }),
};
