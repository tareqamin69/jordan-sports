import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './platform/config/config.js';
import { PinoNestLogger } from './platform/logging/logger.js';

/**
 * Builds the HTTP application without listening, so tests can drive it with `inject()`.
 */
export async function createHttpApp(
  config: AppConfig,
  logger: Logger,
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    // Request IDs are always generated server-side; client-supplied IDs are not trusted.
    genReqId: () => randomUUID(),
    trustProxy: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(config), adapter, {
    logger: new PinoNestLogger(logger),
  });
  app.enableShutdownHooks();

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.init();
  return app;
}
