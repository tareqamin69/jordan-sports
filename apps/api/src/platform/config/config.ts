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
  WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(4001),
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
  // console: development/staging only (codes are logged / shown). releans: real SMS (ADR-0019).
  OTP_CHANNEL: z.enum(['console', 'releans']).default('console'),
  // Releans SMS gateway; required when OTP_CHANNEL=releans. The sender ID must be approved by
  // the Jordanian operators through Releans before messages are delivered.
  RELEANS_API_KEY: z.string().trim().min(8).optional(),
  RELEANS_SENDER_ID: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{3,11}$/, 'must be 3-11 letters or digits')
    .default('Jorena'),
  RELEANS_BASE_URL: z.string().url().default('https://api.releans.com/v2'),
  MEDIA_DIR: z.string().min(1).default('.data/media'),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  // Test-only: multiplies every rate limit (all end-to-end traffic comes from one IP).
  // Staging: a production build for testers with demo data only. Allows the console OTP channel
  // (sign-in codes are shown on screen). Never set this for real customers.
  STAGING: booleanString.default(false),
  // Proxies trusted for the client IP (X-Forwarded-For), e.g. private network ranges in Docker.
  TRUST_PROXY: z
    .string()
    .default('127.0.0.1,::1')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  RATE_LIMIT_SCALE: z.coerce.number().int().min(1).max(1000).default(1),
  // Card payment gateway (ADR-0020). Only the mock (test cards) exists until the real acquirer is
  // chosen; production refuses it outside staging — Jorena launches only with a live gateway.
  PAYMENT_GATEWAY: z.enum(['mock']).default('mock'),
  // Staff security emails (sign-in alerts). Without SMTP_URL they are only logged.
  SMTP_URL: z
    .string()
    .refine((v) => /^smtps?:\/\/.+/.test(v), 'must be an smtp:// or smtps:// URL')
    .optional(),
  EMAIL_FROM: z.string().trim().min(3).default('Jorena <no-reply@jorena.app>'),
});

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  /** Health endpoint of the background worker process. */
  readonly workerPort: number;
  readonly databaseUrl: string;
  readonly databasePoolMax: number;
  readonly databaseAppRole: string;
  readonly redisUrl: string;
  readonly authSecret: string;
  readonly webOrigins: readonly string[];
  readonly adminOrigins: readonly string[];
  readonly cookieSecure: boolean;
  readonly otpChannel: 'console' | 'releans';
  /** Set when OTP_CHANNEL=releans; also used for booking notifications. */
  readonly releans: {
    readonly apiKey: string;
    readonly senderId: string;
    readonly baseUrl: string;
  } | null;
  readonly mediaDir: string;
  readonly logLevel: (typeof logLevels)[number];
  /** Multiplier for rate limits; must be 1 in production. */
  readonly rateLimitScale: number;
  /** Test deployment with demo data (see STAGING). */
  readonly staging: boolean;
  readonly trustProxy: readonly string[];
  readonly paymentGateway: 'mock';
  /** The player-facing site, for the payment page's return address (first of WEB_ORIGINS). */
  readonly webBaseUrl: string;
  /** The admin panel (first of ADMIN_ORIGINS), for links in staff notifications. */
  readonly adminBaseUrl: string;
  /** Outgoing email; `smtpUrl` null means emails are logged instead (development). */
  readonly email: { readonly smtpUrl: string | null; readonly from: string };
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
  if (e.OTP_CHANNEL === 'releans' && !e.RELEANS_API_KEY) {
    throw new ConfigError(
      'Invalid configuration: RELEANS_API_KEY: required when OTP_CHANNEL=releans',
    );
  }
  const config: AppConfig = {
    nodeEnv: e.NODE_ENV,
    host: e.API_HOST,
    port: e.API_PORT,
    workerPort: e.WORKER_PORT,
    databaseUrl: e.DATABASE_URL,
    databasePoolMax: e.DATABASE_POOL_MAX,
    databaseAppRole: e.DATABASE_APP_ROLE,
    redisUrl: e.REDIS_URL,
    authSecret: e.AUTH_SECRET,
    webOrigins: e.WEB_ORIGINS,
    adminOrigins: e.ADMIN_ORIGINS,
    cookieSecure: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
    otpChannel: e.OTP_CHANNEL,
    releans:
      e.OTP_CHANNEL === 'releans' && e.RELEANS_API_KEY
        ? { apiKey: e.RELEANS_API_KEY, senderId: e.RELEANS_SENDER_ID, baseUrl: e.RELEANS_BASE_URL }
        : null,
    mediaDir: e.MEDIA_DIR,
    logLevel: e.LOG_LEVEL,
    rateLimitScale: e.RATE_LIMIT_SCALE,
    staging: e.STAGING,
    trustProxy: e.TRUST_PROXY,
    paymentGateway: e.PAYMENT_GATEWAY,
    webBaseUrl: e.WEB_ORIGINS[0] ?? 'http://localhost:3000',
    adminBaseUrl: e.ADMIN_ORIGINS[0] ?? 'http://localhost:3001',
    email: { smtpUrl: e.SMTP_URL ?? null, from: e.EMAIL_FROM },
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
  if (config.otpChannel === 'console' && !config.staging) {
    problems.push('OTP_CHANNEL=console is for development only; configure a real OTP provider');
  }
  if (!config.cookieSecure) problems.push('COOKIE_SECURE must be true in production');
  if (!config.databaseAppRole) problems.push('DATABASE_APP_ROLE must be set in production');
  if (config.rateLimitScale !== 1) problems.push('RATE_LIMIT_SCALE is for tests only');
  if (config.paymentGateway === 'mock' && !config.staging) {
    problems.push('PAYMENT_GATEWAY=mock takes test cards only; configure the real card gateway');
  }
  for (const origin of [...config.webOrigins, ...config.adminOrigins]) {
    if (!origin.startsWith('https://')) problems.push(`origin ${origin} must use https`);
  }
  if (!config.staging) {
    // A real launch is served from the real domain, never a throwaway test address.
    for (const origin of [...config.webOrigins, ...config.adminOrigins]) {
      const host = new URL(origin).hostname;
      if (/(^|\.)sslip\.io$|^localhost$|^127\.|\.localhost$/.test(host)) {
        problems.push(`origin ${origin} is a test address, not a real domain`);
      }
    }
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
