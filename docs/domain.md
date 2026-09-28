# Moving to the real domain (jorena.app)

The server already obtains HTTPS certificates automatically (Caddy + Let's Encrypt). Moving from
the temporary `*.sslip.io` address to `jorena.app` needs three things from the owner and one
commit from us. No server login is needed.

## 1. Buy the domain (owner)

- **Name:** `jorena.app`. Check it is still available first.
- **Where:** any registrar that sells `.app`, for example Cloudflare Registrar (sells at cost, no
  markup on renewals), Porkbun or Namecheap. Expect roughly **US$12–20 per year**; compare the
  *renewal* price, not only the first-year offer.
- **Good to know about `.app`:** every `.app` domain works over HTTPS only (browsers enforce it).
  That is fine here, because the server always serves HTTPS.
- Turn on auto-renew and registrar lock (transfer lock). Keep the account on an email you control,
  with two-factor sign-in.

## 2. Point the domain at the server (owner)

In the registrar's DNS settings, add these records (use the server's public IPv4 address, shown in
the Hetzner console; it is also the number inside the current staging address, with dots instead
of dashes):

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` (the bare `jorena.app`) | server IPv4 | 300 (5 minutes) |
| A | `admin` | server IPv4 | 300 |
| A | `www` | server IPv4 | 300 |

- If the server also has an IPv6 address you may add the same three names as `AAAA` records; if
  you're unsure, skip IPv6 entirely (a wrong AAAA record breaks certificate issuance).
- On Cloudflare, set the three records to **DNS only** (grey cloud), not proxied, at least until
  the certificates exist.
- Check that it worked: `nslookup jorena.app` (or a site such as dnschecker.org) shows the server
  IP for `jorena.app`, `admin.jorena.app` and `www.jorena.app`. This usually takes minutes, rarely
  a few hours.

## 3. Tell us, and we switch (one commit)

When the three names resolve to the server, we uncomment the lines in
[`infra/staging/domain.env`](../infra/staging/domain.env) and push. Within about 5–20 minutes:

- `https://jorena.app` serves the website; `https://www.jorena.app` redirects to it.
- `https://admin.jorena.app` serves the staff console.
- Links, share previews, the sitemap and `robots.txt` use the new address.
- The old `sslip.io` address stops working, and everyone signs in once more (sessions are per
  address).

Search engines stay out (`noindex`) until launch; flipping that is one more line in the same file.

## Before real customers use it

The server is still in **staging mode** (`STAGING=true`): sign-in codes are shown on screen, so
anyone with the link can sign in as any phone number, and it carries demo venues. Before inviting
real players or venue owners:

1. connect an SMS provider for sign-in codes and turn staging mode off;
2. remove the demo data;
3. set up database backups.

## How it works (for developers)

- `infra/staging/compose.yml` loads `/opt/jordan-sports/staging.env` (secrets, generated on the
  server) and then `infra/staging/domain.env` (committed, host names only), so the latter wins.
- `infra/staging/Caddyfile` serves `WEB_HOST` and `ADMIN_HOST`, redirects `WEB_REDIRECT_HOSTS` to
  `WEB_HOST`, adds HSTS, and sends `X-Robots-Tag` from `X_ROBOTS_TAG` (default
  `noindex, nofollow`).
- `update.sh` reloads Caddy after each deploy (the Caddyfile is a bind mount, so Compose alone
  would not pick up its changes).
- The web app reads `WEB_BASE_URL` at request time; the pages that use it for absolute URLs are
  rendered per request, because the image is built without it.
