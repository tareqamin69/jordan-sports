import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const origins = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^https?:\/\/[^/\s]+$/, 'must be origins like https://host')));

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z
    .string()
    .refine((value) => /^postgres(ql)?:\/\/.+/.test(value), 'must be a postgres:// URL'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Role the API switches to on every connection (SET ROLE). Empty disables (not recommended).
  DATABASE_APP_ROLE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/, 'must be a simple role name')
    .or(z.literal(''))
    .default('js_app'),
  REDIS_URL: z.string().refine((v) => /^rediss?:\/\/.+/.test(v), 'must be a redis:// URL'),
  AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  WEB_ORIGINS: origins.default(['http://localhost:3000', 'http://127.0.0.1:3000']),
  ADMIN_ORIGINS: origins.default(['http://localhost:3001', 'http://127.0.0.1:3001']),
  COOKIE_SECURE: booleanString.optional(),
  OTP_CHANNEL: z.enum(['console']).default('console'),
  MEDIA_DIR: z.string().min(1).default('.data/media'),
  LOG_LEVEL: z.enum(logLevels).default('info'),
});

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly databasePoolMax: number;
  readonly databaseAppRole: string;
  readonly redisUrl: string;
  readonly authSecret: string;
  readonly webOrigins: readonly string[];
  readonly adminOrigins: readonly string[];
  readonly cookieSecure: boolean;
  readonly otpChannel: 'console';
  readonly mediaDir: string;
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
  const config: AppConfig = {
    nodeEnv: e.NODE_ENV,
    host: e.API_HOST,
    port: e.API_PORT,
    databaseUrl: e.DATABASE_URL,
    databasePoolMax: e.DATABASE_POOL_MAX,
    databaseAppRole: e.DATABASE_APP_ROLE,
    redisUrl: e.REDIS_URL,
    authSecret: e.AUTH_SECRET,
    webOrigins: e.WEB_ORIGINS,
    adminOrigins: e.ADMIN_ORIGINS,
    cookieSecure: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
    otpChannel: e.OTP_CHANNEL,
    mediaDir: e.MEDIA_DIR,
    logLevel: e.LOG_LEVEL,
  };
  assertProductionSafe(config);
  return config;
}

/**
 * Refuses configurations that are only acceptable for development (ADR-0009, ADR-0013).
 */
export function assertProductionSafe(config: AppConfig): void {
  if (config.nodeEnv !== 'production') return;
  const problems: string[] = [];
  if (config.otpChannel === 'console') {
    problems.push('OTP_CHANNEL=console is for development only; configure a real OTP provider');
  }
  if (!config.cookieSecure) problems.push('COOKIE_SECURE must be true in production');
  if (!config.databaseAppRole) problems.push('DATABASE_APP_ROLE must be set in production');
  for (const origin of [...config.webOrigins, ...config.adminOrigins]) {
    if (!origin.startsWith('https://')) problems.push(`origin ${origin} must use https`);
  }
  if (problems.length > 0) {
    throw new ConfigError(`Unsafe production configuration: ${problems.join('; ')}`);
  }
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
