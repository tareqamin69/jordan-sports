# Uptime monitoring (UptimeRobot, free plan)

UptimeRobot checks the site every 5 minutes from the internet and emails (or sends to its app) when
it stops answering. The free plan covers what we need: 50 monitors, 5-minute checks.

## Set up (owner, about 10 minutes)

1. Sign up at uptimerobot.com with the email that should get the alerts, and turn on two-factor
   sign-in in the account settings.
2. **Add New Monitor** four times:

| Friendly name | Monitor type | URL | Why |
|---|---|---|---|
| Jorena website | HTTP(s) | `https://jorena.app/ar` | players' home page |
| Jorena API ready | HTTP(s) | `https://jorena.app/api/readyz` | answers 503 when the API, its database, Redis or a migration is not ready (a page can load while the API is down) |
| Jorena staff console | HTTP(s) | `https://admin.jorena.app/ar/sign-in` | the admin panel |
| Jorena SSL | the website monitor's **SSL expiry** option (Advanced settings) | – | warns 30 days before the certificate expires |

   Until the domain is switched on, use the current staging addresses instead.
3. Interval 5 minutes; alert contacts: your email, plus the UptimeRobot mobile app for push
   notifications.
4. Optional: **Status pages → Add**: a public page (e.g. `status.jorena.app`) listing the website and
   API monitors, for venues to check during an outage.

## Also worth adding

- The backup's dead-man's switch (docs/backups.md, `BACKUP_PING_URL`): UptimeRobot "Heartbeat"
  monitors are paid; healthchecks.io offers the same for free.
- When an alert arrives: check `https://<site>/_staging/update.log` (staging) or the server's
  `/var/log/jordan-sports/update.log`; a failing deploy is the most common cause.
