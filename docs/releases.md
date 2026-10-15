# Releases: development branch vs production

| Server | Follows | When it changes |
|---|---|---|
| Staging | none: deleted 2026-10-15; testing is local and in CI | – |
| Production (from launch) | `production` | only when the owner moves the `production` branch |

The server runs `infra/staging/update.sh` every 5 minutes and follows the branch named in
`/opt/jordan-sports/deploy.env` (`DEPLOY_BRANCH=production`; written by the production bootstrap).
A server without that file would follow the development branch, which is only meant for a
throwaway staging server.

## Creating the `production` branch (once, owner)

Nobody but the owner creates or moves this branch. On GitHub: open the repository → **Branches** →
**New branch** → name `production`, source `claude/inspect-repo-environment-c0iptd` (at the commit
you tested locally and in CI).

Recommended: **Settings → Branches → Add rule** for `production`: require a pull request before
merging, so the branch can't be moved by accident.

## Releasing a version (owner)

1. Test it locally and check CI is green on the commit.
2. On GitHub: **Pull requests → New** with base `production` and compare
   `claude/inspect-repo-environment-c0iptd`. The list of commits is exactly what will go live.
3. Merge it. Within 5 minutes production pulls and restarts (migrations run automatically; the
   update log is at `/var/log/jordan-sports/update.log`).

## Rolling back

Open a pull request that reverts the merge (GitHub's **Revert** button on the merged pull request)
and merge it. Database migrations are not undone by a revert; take a backup before any release that
changes the database (the release notes say so), and restore it if needed (docs/backups.md).
