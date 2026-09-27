import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { platformRoleSchema } from '@jordan-sports/contracts';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AuthService } from '../modules/identity/index.js';
import { loadDotEnv, parseConfig } from '../platform/config/config.js';
import { DATABASE } from '../platform/database/database.module.js';
import type { Db } from '../platform/database/database.js';
import { otpauthUri } from '../platform/security/totp.js';

/**
 * Creates a platform staff account (there is no self-signup for admins).
 *
 *   ADMIN_PASSWORD='…' node dist/cli/admin.js create --email a@b.jo --name "Name" [--role admin]
 *
 * Prints the authenticator (TOTP) secret once; it cannot be retrieved later.
 */
async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'super_admin' },
      json: { type: 'boolean', default: false },
      // Do nothing if a user with this email exists (idempotent provisioning).
      'if-missing': { type: 'boolean', default: false },
    },
  });
  const password = process.env.ADMIN_PASSWORD;
  if (positionals[0] !== 'create' || !values.email || !values.name || !password) {
    console.error(
      'Usage: ADMIN_PASSWORD=… admin.js create --email <email> --name <name> [--role <role>] [--json]',
    );
    return 2;
  }
  const role = platformRoleSchema.parse(values.role);

  loadDotEnv();
  const config = parseConfig(process.env);
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: false,
  });
  try {
    if (values['if-missing']) {
      const db = app.get<Db>(DATABASE);
      const existing = await db
        .selectFrom('identity.users')
        .select('id')
        .where('email', '=', values.email.trim().toLowerCase())
        .executeTakeFirst();
      if (existing) {
        console.log(`Staff account ${values.email} already exists; nothing to do.`);
        return 0;
      }
    }
    const { userId, totpSecret } = await app.get(AuthService).createPlatformUser({
      email: values.email,
      displayName: values.name,
      password,
      role,
      // Staging bootstrap may provide the secret so testers can be given it in advance.
      ...(process.env.ADMIN_TOTP_SECRET ? { totpSecret: process.env.ADMIN_TOTP_SECRET } : {}),
    });
    if (values.json) {
      console.log(JSON.stringify({ userId, totpSecret }));
    } else {
      console.log(`Created ${role} ${values.email} (${userId}).`);
      console.log('Add this secret to an authenticator app now (it is shown only once):');
      console.log(`  secret: ${totpSecret}`);
      console.log(`  uri:    ${otpauthUri(totpSecret, values.email)}`);
    }
    return 0;
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
