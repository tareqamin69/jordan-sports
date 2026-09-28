import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { OwnerExistsError, StaffSetupService } from '../modules/identity/index.js';
import { loadDotEnv, parseConfig } from '../platform/config/config.js';

/**
 * Prints a one-time link (valid 30 minutes) where the platform owner chooses their own password
 * and enrols an authenticator app (docs/rbac-plan.md §6). Run on the server; nothing secret is
 * ever passed on the command line, and the link stops working once used or when a new one is
 * generated.
 *
 *   node dist/cli/owner-setup-link.js --email owner@example.com [--name "Name"] [--replace-owner]
 *
 * Using a link for the existing owner's email resets their password and authenticator (recovery).
 * --replace-owner hands ownership to another email; the previous owner becomes an admin.
 */
async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      'replace-owner': { type: 'boolean', default: false },
    },
  });
  if (!values.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) {
    console.error('Usage: owner-setup-link.js --email <email> [--name <name>] [--replace-owner]');
    return 2;
  }

  loadDotEnv();
  const config = parseConfig(process.env);
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: false,
  });
  try {
    const { token, expiresAt } = await app.get(StaffSetupService).createLink({
      purpose: 'owner_setup',
      email: values.email,
      role: 'owner',
      displayName: values.name ?? null,
      replaceOwner: values['replace-owner'],
    });
    const origin = config.adminOrigins[0];
    // The token travels in the URL fragment, which browsers never send to servers or logs.
    console.log(`Owner setup link for ${values.email.trim().toLowerCase()} (single use):`);
    console.log(`  ${origin}/ar/setup#token=${token}`);
    console.log(`Expires at ${expiresAt.toISOString()} (30 minutes). Open it on your own device.`);
    return 0;
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      console.error(error.message);
      return 3;
    }
    throw error;
  } finally {
    await app.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
