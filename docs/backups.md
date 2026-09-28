# Backups and restore

A backup runs every day at about 03:15 UTC. It contains the whole database and the uploaded
photos, is **encrypted on the server** with a public key, and is uploaded to storage **outside the
server**. The private key that opens backups is never on the server, so neither the server nor the
storage provider can read the history.

| Piece | Where |
|---|---|
| Scripts | `infra/backup/backup.sh`, `restore.sh`, `install.sh`, `lib.sh` |
| Config | `/opt/jordan-sports/backup.env` on the server (template: `infra/backup/backup.env.example`) |
| Timer | `jordan-sports-backup.timer` (installed by `update.sh` once `backup.env` exists) |
| Log / last success | `/var/log/jordan-sports/backup.log`, `backup.last-success` |
| Test | `infra/backup/test-backup-restore.sh` |

## One-time setup

1. **Make the key pair on your own computer** (not on the server):
   `age-keygen -o jorena-backup-key.txt`. It prints the **public key** (`age1...`).
   Keep `jorena-backup-key.txt` in two safe places (password manager plus a printed copy). If it is
   lost, no backup can be opened.
2. Create storage outside the server's provider (Storage Box, Backblaze B2, any S3 bucket) with a
   user that can upload and list; ideally it cannot delete other than through the retention below.
3. On the server, as root: `rclone config` (name the remote `offsite`, config saved to
   `/opt/jordan-sports/rclone.conf`), then create `/opt/jordan-sports/backup.env` from the template
   with the public key and `chmod 600` it. Optionally create a free check at healthchecks.io and put
   its URL in `BACKUP_PING_URL`.
4. Install the tools and the timer: `/opt/jordan-sports/app/infra/backup/install.sh` (the updater
   also does it after every deploy). Then run one now to see it work:
   `systemctl start jordan-sports-backup.service`, and read `backup.log`.

## What a backup does

Dump the database, archive the photos, encrypt both, refuse to continue if the dump is suspiciously
small, upload to `BACKUP_REMOTE/<timestamp>/` with a hash file, then have rclone re-compare what is
stored off-server with what was made. Only after that succeeds does it prune: it keeps everything
younger than `BACKUP_KEEP_DAYS` (30) and always the newest `BACKUP_KEEP_MIN` (7), so a run of
failures can never empty the history.

A backup that fails exits with an error (see the log) and no success marker; the dead-man's switch
alerts you when the daily ping stops.

## Restore drill (do this before launch, then every few months)

On any machine with the scripts, `age`, `rclone` and access to the storage, and your private key:

```bash
infra/backup/restore.sh --identity jorena-backup-key.txt --from offsite:jorena-backups \
  --target-db jorena_restored --media-dir /tmp/restored-media
```

It downloads the newest backup (or `--stamp 20260928T031500Z`), checks the hashes, opens it with
your key, restores into a **new** database, unpacks the photos and prints
`RESTORE OK: database=... tables=44 migrations=15`. It refuses to restore over the live database,
over an existing one (unless `--drop`), or from a damaged file, and leaves nothing half-made if the
key is wrong.

`infra/backup/test-backup-restore.sh` runs the whole cycle with a throwaway key against a local
PostgreSQL and compares every table's row count and every photo with the source (it is how the
scripts were tested; needs `pg_dump`, `pg_restore`, `psql`, `age`, `rclone`).

## Putting a restored database into service (disaster)

The scripts never overwrite the live database, on purpose. To recover a lost or damaged server:

1. Create a new server (same steps as `docs/staging.md`), let it start empty.
2. `restore.sh` into a new database (as above), with `--media-dir` set to the media volume path.
3. Stop `api`, `worker`, `web`, `admin`; in `psql`: `ALTER DATABASE jordan_sports RENAME TO
   jordan_sports_old; ALTER DATABASE jorena_restored RENAME TO jordan_sports;`; start them again.
4. Sign in and check recent bookings before opening to the public.

Expect to lose at most the changes since the last daily backup.

## Not covered

- Backups of the server itself, secrets (`staging.env`) or the DNS settings: keep those in your
  password manager.
- A real drill against the real storage has not been done yet (there is no storage account); the
  scripts are tested against a local folder as the off-server storage.
- The Docker mode (`PG_MODE=docker`, what runs on the server) could not be run in the development
  sandbox (no Docker there). It only differs in how `pg_dump`/`pg_restore`/`tar` are reached, but
  the first run on the server must be watched (`backup.log`), and the drill above must be done.
