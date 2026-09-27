import 'reflect-metadata';
import { createHttpApp } from './http-app.js';
import { loadDotEnv, parseConfig } from './platform/config/config.js';
import { createLogger } from './platform/logging/logger.js';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const config = parseConfig(process.env);
  const logger = createLogger(config);
  const app = await createHttpApp(config, logger);
  await app.listen({ host: config.host, port: config.port });
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
