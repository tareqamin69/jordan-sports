# Staging (test) deployment

A single small cloud server runs the whole product with demo data so the owner and testers can use
it from any browser or phone. It is **not** production: sign-in codes are shown on screen (no SMS
provider yet), so anyone with the link can sign in as any phone number. Never put real customer
data on staging.

## Shape

| Piece | Where |
|---|---|
| Server | One VM (e.g. Hetzner CX22: 2 vCPU, 4 GB RAM, Ubuntu 24.04) |
| Processes | Docker Compose (`infra/staging/compose.yml`): PostGIS, Redis, `init` (migrations, demo seed, staff account), `api`, `worker`, `web`, `admin`, Caddy |
| HTTPS | Caddy obtains certificates automatically for `<ip-with-dashes>.sslip.io` (web) and `admin.<ip-with-dashes>.sslip.io` (admin). No domain needed |
| Image | Built on the server from `infra/staging/Dockerfile` (one image for every Node process) |
| Updates | `infra/staging/update.sh` runs every 5 minutes (systemd timer `jordan-sports-update.timer`): when the staging branch moved, it pulls and runs `docker compose up -d --build` (migrations and idempotent seeding run in `init`) |
| Secrets | Generated on the server (`/opt/jordan-sports/staging.env`, mode 600): database password, `AUTH_SECRET`. The staff account (email, password, TOTP secret) comes from the cloud-config, written to `/opt/jordan-sports/admin.env` |
| Progress | `https://<web host>/_staging/bootstrap.log` and `/_staging/update.log` (no secrets are logged). A "preparing" page is shown while apps build or restart |

## Configuration specific to staging

- `NODE_ENV=production` with `STAGING=true`: the production safety checks stay on (https origins,
  secure cookies, restricted database role), except that the console OTP channel is allowed. The
  web sign-in screen then shows the code (via the dev-only endpoint).
- `TRUST_PROXY` includes the private Docker ranges so rate limits use the real client IP
  (Caddy → Next.js → API).
- Demo data: `seed-demo` (six venues in Amman with generated photos, hours 08:00–24:00, prices with
  an evening peak). The demo owner is `+962790000001` and manages every demo venue.

## Create the server

1. Fill `infra/staging/cloud-config.template.yaml` (staff email, a long password, a base32 TOTP
   secret of 32+ characters). Never commit the filled copy.
2. Create an Ubuntu 24.04 server with a public IPv4 and paste the filled file into "Cloud config".
3. After 10–20 minutes open `https://<ip-with-dashes>.sslip.io`.

## CI

`.github/workflows/staging-smoke.yml` builds the same image and starts the same stack on every
push (plain-HTTP host names, production settings otherwise), then checks the web, admin, API
readiness, demo data and the on-screen sign-in code.

## Removing it

Delete the server in the cloud console. Nothing else is billed.
