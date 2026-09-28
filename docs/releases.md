# Releases: staging vs production

| Server | Follows | When it changes |
|---|---|---|
| Staging | `claude/inspect-repo-environment-c0iptd` | every push (within 5 minutes) |
| Production | `production` | only when the owner moves the `production` branch |

Both servers run the same `infra/staging/update.sh` every 5 minutes. A server follows the branch
named in `/opt/jordan-sports/deploy.env` (`DEPLOY_BRANCH=production`), or the staging branch when
that file does not exist. `go-live.sh` writes it on the production server.

## Creating the `production` branch (once, owner)

Nobody but the owner creates or moves this branch. On GitHub: open the repository → **Branches** →
**New branch** → name `production`, source `claude/inspect-repo-environment-c0iptd` (at the commit
you tested on staging).

Recommended: **Settings → Branches → Add rule** for `production`: require a pull request before
merging, so the branch can't be moved by accident.

## Releasing a version (owner)

1. Test it on staging.
2. On GitHub: **Pull requests → New** with base `production` and compare
   `claude/inspect-repo-environment-c0iptd`. The list of commits is exactly what will go live.
3. Merge it. Within 5 minutes production pulls and restarts (migrations run automatically; the
   update log is at `/var/log/jordan-sports/update.log`).

## Rolling back

Open a pull request that reverts the merge (GitHub's **Revert** button on the merged pull request)
and merge it. Database migrations are not undone by a revert; take a backup before any release that
changes the database (the release notes say so), and restore it if needed (docs/backups.md).
