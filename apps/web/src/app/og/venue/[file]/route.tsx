import { getVenue } from '@jordan-sports/contracts/web';
import { BRAND_NAME_LATIN } from '@jordan-sports/brand';
import { formatMoney } from '@jordan-sports/money';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isNotFound, serverApi } from '@/lib/server-api';

const fonts = Promise.all([
  readFile(join(process.cwd(), 'src/assets/og/alexandria-latin-800.woff')),
  readFile(join(process.cwd(), 'src/assets/og/ibm-plex-sans-latin-500.woff')),
]);

/**
 * Share image (1200×630) for a venue without photos: `/og/venue/<slug>.png`. Latin text only,
 * because the image renderer cannot shape Arabic yet; the Arabic page title still travels with
 * the link. Pitch markings and the lime ball, as on the home hero (DESIGN.md).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const slug = /^([a-z0-9-]{1,60})\.png$/.exec(file)?.[1];
  if (!slug) return new Response('Not found', { status: 404 });
  let venue;
  try {
    venue = await serverApi(getVenue, { params: { slug } });
  } catch (error) {
    if (isNotFound(error)) return new Response('Not found', { status: 404 });
    throw error;
  }
  const [display, body] = await fonts;
  const name = venue.name.en ?? '';
  const place = [venue.area?.name.en, venue.governorate.name.en].filter(Boolean).join(', ');
  const sports = venue.sports
    .map((s) => s.name.en)
    .filter(Boolean)
    .join(' · ');
  const price = venue.priceFrom ? `From ${formatMoney(venue.priceFrom, 'en')}` : null;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#072a1c',
        color: '#f6f1e7',
        fontFamily: 'Plex',
        position: 'relative',
      }}
    >
      <svg
        width="1200"
        height="630"
        viewBox="0 0 1200 630"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <g fill="none" stroke="rgba(246,241,231,0.14)" strokeWidth="3">
          <rect x="40" y="40" width="1120" height="550" rx="8" />
          <line x1="600" y1="40" x2="600" y2="590" />
          <circle cx="600" cy="315" r="96" />
          <rect x="1010" y="165" width="150" height="300" />
          <rect x="40" y="165" width="150" height="300" />
        </g>
        <circle cx="880" cy="210" r="16" fill="#e7f06a" />
      </svg>
      <div style={{ display: 'flex', fontFamily: 'Alexandria', fontSize: 40, color: '#e7f06a' }}>
        {BRAND_NAME_LATIN}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 900 }}>
        {name ? (
          <div style={{ display: 'flex', fontFamily: 'Alexandria', fontSize: 76, lineHeight: 1.1 }}>
            {name}
          </div>
        ) : null}
        <div style={{ display: 'flex', fontSize: 32, color: 'rgba(246,241,231,0.8)' }}>
          {[place, sports].filter(Boolean).join('  ·  ')}
        </div>
        {price ? (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              marginTop: 8,
              padding: '12px 26px',
              borderRadius: 999,
              background: '#f6f1e7',
              color: '#0f4d34',
              fontSize: 30,
            }}
          >
            {price}
          </div>
        ) : null}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Alexandria', data: display, weight: 800, style: 'normal' },
        { name: 'Plex', data: body, weight: 500, style: 'normal' },
      ],
      headers: { 'cache-control': 'public, max-age=3600' },
    },
  );
}
