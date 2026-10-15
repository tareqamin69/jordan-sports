# Production: building the server on launch day

**Current state (2026-10-15):** there is **no server**. The Hetzner staging server was deleted to
stop costs until launch; all development and testing is local (`docs/development.md`, plus CI's
`staging-smoke` job, which builds and starts the same Docker stack on every push). This page is
the complete recipe to build the production server from an empty VM in one go.

## How it works

One Ubuntu VM runs everything with Docker Compose (`infra/staging/compose.yml`, shared with
staging): PostGIS, Redis, `init` (migrations), `api`, `worker`, `web`, `admin`, Caddy (automatic
HTTPS). You paste one filled-in cloud-config when creating the VM; it runs
`infra/production/bootstrap.sh`, which:

1. checks your settings and refuses placeholders (names what is missing, never prints a value);
2. waits until `DOMAIN`, `admin.DOMAIN` and `www.DOMAIN` point at the server (up to 30 minutes);
3. writes the server env file (database password and `AUTH_SECRET` are generated on the server),
   the backup config and `deploy.env` (`DEPLOY_BRANCH=production`), then deletes the launch file;
4. adds swap, installs Docker, builds and starts the stack, and installs the 5-minute updater;
5. installs the daily encrypted off-server backup;
6. waits until `https://DOMAIN/api/readyz` answers, then runs the first backup.

Production mode compared with staging:

| | Staging (deleted) | Production |
|---|---|---|
| Sign-in codes | shown on screen | SMS through Releans; the developer endpoint is not mounted |
| Demo venues and tester accounts | seeded on every deploy | never seeded |
| Staff login | from the environment | none in the environment; the owner sets up their own account |
| Addresses | `*.sslip.io` | the real domain only (the API refuses test addresses) |
| Search engines | `noindex` | indexed (`X_ROBOTS_TAG=all`) |
| Backups | none | daily, encrypted, off-server ([backups.md](./backups.md)) |
| Updates | every push to the dev branch | only when the owner moves the `production` branch ([releases.md](./releases.md)) |

The API refuses to start with an unsafe production configuration (`assertProductionSafe`): console
sign-in codes, insecure cookies, test addresses, or the mock card gateway.

## Blocking launch

- **The real card gateway is not built yet.** Payments are card only (ADR-0020) and production
  refuses `PAYMENT_GATEWAY=mock`, so the API will not start in production until a gateway (MEPS or
  a bank acquirer) is integrated. That work adds the gateway's name to `PAYMENT_GATEWAY`, its
  secrets to the list below and to `infra/production/launch-env.sh`, and a sandbox test. The
  bootstrap stops at step 1 while `PAYMENT_GATEWAY` is empty.
- Releans must have approved the sender name `Jorena` (the first SMS is the sign-in test).
- The legal texts must be final (`docs/launch-checklist.md`).

## What you provide

Never paste these into chat, email or GitHub; keep the filled cloud-config in your password
manager.

| Setting | Required | Where it comes from |
|---|---|---|
| `DOMAIN` | yes | the domain you bought, bare (`jorena.app`) |
| `RELEANS_API_KEY` | yes | Releans dashboard |
| `RELEANS_SENDER_ID` | no | only if the approved sender is not `Jorena` |
| `SMTP_URL` | yes | your email provider's SMTP, e.g. `smtps://user:password@smtp.host:465` (staff sign-in alerts) |
| `EMAIL_FROM` | no | defaults to `Jorena <no-reply@jorena.app>` |
| `PAYMENT_GATEWAY` + gateway keys | yes | the card gateway (see "Blocking launch") |
| `BACKUP_AGE_RECIPIENT` | yes | the **public** key printed by `age-keygen` on your computer (`age1…`) |
| `rclone.conf` (`[offsite]` section) | yes | `rclone config` on your computer for the backup storage, then `rclone config show offsite` |
| `BACKUP_REMOTE` | no | defaults to `offsite:jorena-backups` |
| `BACKUP_PING_URL` | no | healthchecks.io check URL (alert when backups stop) |
| `GOOGLE_PLACES_API_KEY` | no | [google-places-setup.md](./google-places-setup.md) |

Also yours, never on the server:

- the backup **private** key file (`jorena-backup-key.txt`): password manager plus a printed copy;
- your Hetzner, registrar, Releans, email, storage and GitHub accounts, each with two-factor sign-in.

Generated on the server, never seen by anyone: the database password and `AUTH_SECRET` (in
`/opt/jordan-sports/staging.env`, mode 600; the file keeps its historical name).

## Launch day, step by step

Before: the domain is bought, the backup storage and key exist, and the gateway is integrated.

1. **GitHub:** create the `production` branch from the tested commit ([releases.md](./releases.md)).
2. **Hetzner:** Primary IPs → create an IPv4 (so you know the address before the server exists).
3. **DNS** at your registrar: `A` records for `@`, `admin` and `www` → that IP, TTL 300
   ([domain.md](./domain.md) step 2; DNS only, no proxy).
4. **Fill** `infra/production/cloud-config.template.yaml` (every `CHANGE-ME`, plus the gateway).
5. **Hetzner:** create the server: Ubuntu 24.04, CX22 or larger, the Primary IP from step 2, your
   SSH key, and the filled file in "Cloud config".
6. **Wait** 15–30 minutes. Progress: `https://DOMAIN/_staging/bootstrap.log` (no secrets are
   logged). It ends with `done: https://DOMAIN is up and backed up.`

## After the server is up

1. **Owner account** (one-time link, valid 30 minutes; nobody else generates it):
   `ssh root@<IP>` then
   `cd /opt/jordan-sports/app/infra/staging && docker compose exec api node dist/cli/owner-setup-link.js --email you@yourdomain`
   Open the link on your own device, choose a password, scan the QR into your authenticator app.
   Running it again for the same email resets your password and authenticator (recovery);
   `--replace-owner` hands ownership to another email.
2. **Test SMS:** `docker compose exec api node dist/cli/sms-test.js +9627XXXXXXXX` (same directory).
3. **Admin → Settings:** company details, support email and WhatsApp (venue review alerts go
   there), commission. **Admin → Team:** invite other staff (each sets up an authenticator).
4. **Readiness:** `/opt/jordan-sports/app/infra/production/go-live.sh --check` must print `READY`
   (configuration, no demo data, staff with authenticators, no on-screen codes, a backup under 36
   hours old).
5. **Uptime alerts:** [monitoring.md](./monitoring.md). **Restore drill** with your private key:
   [backups.md](./backups.md).
6. Final test with one real venue and one real player ([launch-checklist.md](./launch-checklist.md)
   step 10), then open gradually.

## Releases, rollback, disaster

- New versions: merge into `production` ([releases.md](./releases.md)); the server updates within
  5 minutes. Take a backup before releases that change the database.
- Server lost: build a new one with the same steps (same cloud-config), then restore the latest
  backup into it ([backups.md](./backups.md), "Putting a restored database into service").

## What was tested and what was not

Tested locally: the settings checks and env-file generation (`infra/production/test-launch-env.sh`),
env-file editing (`test-envfile.sh`), config refusals (`config.test.ts`), the preflight
(`preflight.test.ts`), the backup and restore cycle (`infra/backup/test-backup-restore.sh`), and in
CI the whole Docker stack with production settings (`staging-smoke`). The same Docker steps ran on
the staging server until it was deleted.

**Not run:** `infra/production/bootstrap.sh` end to end (it needs a real VM, DNS and Releans), the
Docker-mode backup, and the real gateway. Watch the first run (`bootstrap.log`).

## Converting an existing staging server (older path)

`infra/production/go-live.sh --test-phone +9627…` switches a running staging server to
production in place (backup, SMS test, delete demo data, flip the settings). Not needed for a
fresh build; `go-live.sh --check` is the readiness check either way.

## Open decisions

- **Hosting the logs page:** `/_staging/*` serves the bootstrap and update logs publicly (they hold
  no secrets). Remove that block from the Caddyfile after launch if you prefer.
- **Cloud-config holds secrets:** Hetzner keeps the user data and serves it to the server's own
  metadata address. The app never fetches internal addresses (the Google Maps import refuses
  them), but rotate the Releans and SMTP credentials if the server is ever compromised.
