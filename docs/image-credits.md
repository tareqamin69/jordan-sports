# Illustrative sport photos: sources and credits

Venues without photos of their own, sport tiles and the home hero use **illustrative stock
photos** of each sport's court or field. Venue-uploaded photos always win; a stock photo shown for
a venue carries the label «صورة توضيحية» so players don't take it for the actual venue.

## Source and license

- **Pexels only** ([Pexels License](https://www.pexels.com/license/)): free for commercial use,
  modification allowed, no attribution required (we credit anyway). Unsplash is not used: its API
  terms require hotlinking images from Unsplash's servers, and we self-host every image.
- Queries ask for *empty* courts and fields to avoid recognizable faces and brand logos
  (`infra/stock-photos/sports.json`). Pexels has no face filter, so **review the result once** and
  exclude anything unsuitable (below).
- Photos are downloaded on our server, re-encoded to WebP (at most 2000 px, all metadata removed),
  and served from our API with resized copies (320/640/960/1600 px) and a blur-up preview. Nothing
  is hotlinked.

## Setting it up (once)

The development sandbox has no internet access, so the download runs on the server during deploy:

1. Create a free API key at <https://www.pexels.com/api/> (sign in → "Your API key").
2. Add it to the server env file: `PEXELS_API_KEY=...` in `/opt/jordan-sports/staging.env`
   (never in git or chat).
3. The next deploy's `init` step runs `node dist/cli/stock-photos.js`: it fills every active sport
   with up to 4 photos (`perSport`), keeps what is already downloaded on later deploys, and never
   blocks a deploy (without a key it logs a line and skips; the site then shows the illustrated
   courts as before).

To run it by hand: `cd /opt/jordan-sports/app/infra/staging && sudo docker compose exec api node dist/cli/stock-photos.js`

## Reviewing and replacing a photo

- Every photo is listed with its photographer and source at `/ar/credits` on the site and as JSON at
  `/api/v1/stock/credits`.
- To drop one: add its id (e.g. `pexels-1234567`) to `exclude` in `infra/stock-photos/sports.json`,
  push, then run `node dist/cli/stock-photos.js --refresh` on the server. Excluded files are deleted.

## Credits in the repository

`docs/image-credits.json` is the committed copy of the credits (photo URL, photographer, license,
sport). After the first download, refresh it with:

```
sudo docker compose exec api node dist/cli/stock-photos.js --credits > docs/image-credits.json
```

(or `curl https://<site>/api/v1/stock/credits`) and commit it. It is empty until the server has
downloaded the photos.
