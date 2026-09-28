# Production mode and go-live

"Production mode" means the server behaves like a real service, not the test deployment:

| | Staging (now) | Production |
|---|---|---|
| Sign-in codes | shown on screen, developer endpoint on | sent by SMS (Releans), endpoint not mounted, no notice on the page |
| Demo venues and tester accounts | seeded on every deploy | never seeded; removed once by `remove-demo` |
| Staff login in the environment | `ADMIN_EMAIL/PASSWORD/TOTP_SECRET` in every container | removed; the staff account is created once by hand |
| Addresses | `*.sslip.io` allowed | the API refuses to start with `sslip.io` / `localhost` origins |
| Backups | none | daily, encrypted, off-server ([backups.md](./backups.md)) |

`STAGING=true` is the only switch between the two. The application already refuses the console
sign-in channel in production unless it is on (`assertProductionSafe`), and the sign-in page and
the developer endpoint follow the same rule.

## Before the switch

Everything in the owner's checklist ([launch-checklist.md](./launch-checklist.md)) up to and
including the backup storage: the company, Releans with the approved sender `Jorena`, the domain
switched on in `infra/staging/domain.env` ([domain.md](./domain.md)), and a working backup with a
restore drill done.

On the server, as root:

1. `/opt/jordan-sports/backup.env` exists and one backup has succeeded.
2. `/opt/jordan-sports/releans.env` (mode 600) contains `RELEANS_API_KEY=...` and, if different from
   the default, `RELEANS_SENDER_ID=...`.
3. You have a phone you can read for the test SMS.

## The switch

```bash
/opt/jordan-sports/app/infra/production/go-live.sh --test-phone +9627XXXXXXXX
```

It stops at the first problem and does, in order:

1. runs a backup (the safety net before anything is deleted);
2. sends one real SMS through Releans and asks you to confirm it arrived;
3. shows what `remove-demo --all-players` would delete and asks you to type `DELETE`;
4. saves `staging.env.before-golive`, then sets `STAGING=false`, `OTP_CHANNEL=releans` and the
   Releans key, and removes the staff login variables;
5. recreates the containers (migrations run; nothing is seeded);
6. runs the preflight and checks from outside that the developer endpoint answers 404, the sign-in
   page shows no test-code notice and the last backup is under 36 hours old.

`go-live.sh --check` runs step 6 alone; use it any time, for example after each deploy.

## Staff accounts

Removing demo data never touches staff. Two things to do by hand, once, on the server:

- If the staff account created for staging used a placeholder email, create a real one:
  `docker compose exec -e ADMIN_PASSWORD='...' api node dist/cli/admin.js create --email you@jorena.app --name "Your name"`
  (it prints the authenticator secret once; scan it into an authenticator app). The preflight fails
  while addresses such as `@example.com` or `@staging.*` remain.
- Every staff account must have an authenticator (the preflight checks this).

## What was tested and what was not

Tested automatically: config refusals (`config.test.ts`); the demo-data removal, including that
other organizations, staff and the append-only history rules survive (`purge-demo.test.ts`);
the preflight against clean and dirty databases (`preflight.test.ts`); the env-file editing used by
the script (`infra/production/test-envfile.sh`); the compose `init` logic for both modes; the
backup and restore cycle (`infra/backup/test-backup-restore.sh`).

**Not run:** `go-live.sh` itself and the Docker-mode backup, because the development sandbox has
no Docker and there is no production server yet. The first run on the real server must be watched,
and it is the reason step 1 takes a backup and step 4 saves the old settings.

## Open decisions

- **Deploys:** the server still updates itself from the `claude/inspect-repo-environment-c0iptd`
  branch every 5 minutes, so every push reaches production. Before real customers, deploy from a
  release branch or tag that is moved deliberately.
- **Monitoring:** nothing alerts you if the site is down; a free uptime check (UptimeRobot,
  Better Stack) on the home page and `/readyz` is a cheap start.
