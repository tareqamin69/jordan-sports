import 'reflect-metadata';
import { createServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { loadDotEnv, parseConfig } from './platform/config/config.js';
import { createLogger, PinoNestLogger } from './platform/logging/logger.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const config = parseConfig(process.env);
  const logger = createLogger(config);
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
    logger: new PinoNestLogger(logger),
  });
  app.enableShutdownHooks();
  await app.init();

  // Liveness endpoint for the hosting platform.
  const health = createServer((request, response) => {
    const ok = request.url === '/healthz';
    response.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' });
    response.end(JSON.stringify(ok ? { status: 'ok' } : { status: 'not_found' }));
  });
  health.listen(config.workerPort, config.host, () => {
    logger.info({ port: config.workerPort }, 'worker started');
  });
  const stop = () => health.close();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
