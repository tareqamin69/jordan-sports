import type { LoggerService } from '@nestjs/common';
import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import type { AppConfig } from '../config/config.js';

/**
 * Log paths that must never be written in clear text. Personal data (phone, email) and
 * credentials are redacted wherever they appear one level deep in a log object.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.otp',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.phone',
  '*.email',
  '*.databaseUrl',
];

export function createLoggerOptions(config: Pick<AppConfig, 'logLevel'>): LoggerOptions {
  return {
    level: config.logLevel,
    base: { service: 'api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
  };
}

export function createLogger(
  config: Pick<AppConfig, 'logLevel'>,
  destination?: DestinationStream,
): Logger {
  return destination
    ? pino(createLoggerOptions(config), destination)
    : pino(createLoggerOptions(config));
}

/** Routes NestJS framework logs through the same structured pino logger. */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace' | 'fatal',
    message: unknown,
    params: unknown[],
  ): void {
    // Nest passes the logging context (class name) as the last string parameter.
    const context = typeof params.at(-1) === 'string' ? (params.at(-1) as string) : undefined;
    const bindings: Record<string, unknown> = context ? { context } : {};
    if (message instanceof Error) {
      this.logger[level]({ ...bindings, err: message }, message.message);
    } else if (typeof message === 'object' && message !== null) {
      this.logger[level]({ ...bindings, ...message });
    } else {
      this.logger[level](bindings, String(message));
    }
  }
}
