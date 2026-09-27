import { randomUUID } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
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
    // The API sits behind the web/admin same-site proxy; trust only loopback hops for client IPs.
    trustProxy: ['127.0.0.1', '::1'],
    bodyLimit: 1024 * 1024,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(config), adapter, {
    logger: new PinoNestLogger(logger),
  });
  app.enableShutdownHooks();

  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(fastifyCookie);
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
  });

  await app.init();
  return app;
}
