import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z
    .string()
    .refine((value) => /^postgres(ql)?:\/\/.+/.test(value), 'must be a postgres:// URL'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(logLevels).default('info'),
});

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly databasePoolMax: number;
  readonly logLevel: (typeof logLevels)[number];
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/**
 * Validates environment variables into a typed configuration. Error messages name the
 * offending variables but never include their values (they may contain secrets).
 */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid configuration: ${issues}`);
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    host: e.API_HOST,
    port: e.API_PORT,
    databaseUrl: e.DATABASE_URL,
    databasePoolMax: e.DATABASE_POOL_MAX,
    logLevel: e.LOG_LEVEL,
  };
}

/**
 * Development convenience: loads the repository-root `.env` (the directory containing
 * `pnpm-workspace.yaml`) into `env`. Variables that are already set always win, and nothing is
 * loaded when NODE_ENV is `production` — production configuration comes from the environment.
 *
 * @returns the path of the loaded file, or undefined when nothing was loaded.
 */
export function loadDotEnv(
  env: Record<string, string | undefined> = process.env,
  startDir: string = process.cwd(),
): string | undefined {
  if (env.NODE_ENV === 'production') return undefined;

  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) break;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }

  const file = join(dir, '.env');
  if (!existsSync(file)) return undefined;

  const parsed = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined && value !== undefined) env[key] = value;
  }
  return file;
}
