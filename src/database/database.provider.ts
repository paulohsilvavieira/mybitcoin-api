import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { POOL_TOKEN } from './pool.token';

export const DatabaseProvider: FactoryProvider = {
  provide: POOL_TOKEN,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({
      host: config.getOrThrow('DB_HOST'),
      port: config.getOrThrow<number>('DB_PORT'),
      database: config.getOrThrow('DB_NAME'),
      user: config.getOrThrow('DB_USER'),
      password: config.getOrThrow('DB_PASSWORD'),
      max: config.get('DB_POOL_SIZE', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    }),
};
