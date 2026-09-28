/**
 * DEVELOPMENT / STAGING ONLY: generated illustrations used as demo venue photos (the repository
 * contains no real photos). Each kind has day, night and angled variants.
 */

const W = 1600;
const H = 1000;

type Kind = 'grass' | 'glass' | 'clay' | 'pool';
type Variant = 'day' | 'night' | 'angle';

function lights(night: boolean): string {
  if (!night) return '';
  const spots = [
    [120, 90],
    [W - 120, 90],
    [120, H - 90],
    [W - 120, H - 90],
  ];
  return spots
    .map(
      ([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="520" fill="url(#glow)"/><circle cx="${x}" cy="${y}" r="16" fill="#fffbe6"/>`,
    )
    .join('');
}

function grass(night: boolean): string {
  const stripes = Array.from(
    { length: 10 },
    (_, i) =>
      `<rect x="${200 + i * 120}" y="140" width="120" height="720" fill="${i % 2 ? '#2f8f3a' : '#379e43'}"/>`,
  ).join('');
  return `
    <rect width="${W}" height="${H}" fill="#1f4d2a"/>
    ${stripes}
    <g fill="none" stroke="#f4f8f2" stroke-width="7" opacity="0.92">
      <rect x="200" y="140" width="1200" height="720"/>
      <line x1="800" y1="140" x2="800" y2="860"/>
      <circle cx="800" cy="500" r="95"/>
      <rect x="200" y="330" width="150" height="340"/>
      <rect x="1250" y="330" width="150" height="340"/>
      <rect x="170" y="440" width="30" height="120"/>
      <rect x="1400" y="440" width="30" height="120"/>
    </g>
    <circle cx="800" cy="500" r="8" fill="#f4f8f2"/>
    <circle cx="930" cy="560" r="16" fill="#ffffff" stroke="#222" stroke-width="3"/>
    ${night ? '' : '<rect width="1600" height="1000" fill="url(#sun)"/>'}`;
}

function glass(): string {
  return `
    <rect width="${W}" height="${H}" fill="#3a3f46"/>
    <rect x="260" y="150" width="1080" height="700" rx="6" fill="#2462b0"/>
    <g fill="none" stroke="#f5f7fb" stroke-width="7">
      <rect x="260" y="150" width="1080" height="700"/>
      <line x1="440" y1="150" x2="440" y2="850"/>
      <line x1="1160" y1="150" x2="1160" y2="850"/>
      <line x1="440" y1="500" x2="1160" y2="500"/>
    </g>
    <line x1="800" y1="130" x2="800" y2="870" stroke="#1b1f24" stroke-width="12"/>
    <line x1="800" y1="130" x2="800" y2="870" stroke="#e9eef5" stroke-width="3" stroke-dasharray="6 10"/>
    <rect x="240" y="130" width="1120" height="740" fill="none" stroke="#bfe3ff" stroke-width="14" opacity="0.45"/>
    <circle cx="610" cy="380" r="13" fill="#e4f73b"/>`;
}

function clay(): string {
  return `
    <rect width="${W}" height="${H}" fill="#2f6b52"/>
    <rect x="170" y="150" width="1260" height="700" fill="#c8643b"/>
    <g fill="none" stroke="#fdf6ee" stroke-width="7">
      <rect x="230" y="200" width="1140" height="600"/>
      <line x1="230" y1="275" x2="1370" y2="275"/>
      <line x1="230" y1="725" x2="1370" y2="725"/>
      <line x1="500" y1="275" x2="500" y2="725"/>
      <line x1="1100" y1="275" x2="1100" y2="725"/>
      <line x1="500" y1="500" x2="1100" y2="500"/>
    </g>
    <line x1="800" y1="170" x2="800" y2="830" stroke="#1d2a24" stroke-width="10"/>
    <circle cx="990" cy="420" r="12" fill="#e4f73b"/>`;
}

function pool(): string {
  const lanes = Array.from(
    { length: 6 },
    (_, i) => `<line x1="${260 + i * 180}" y1="150" x2="${260 + i * 180}" y2="850" stroke="#f4f8f2" stroke-width="6" stroke-dasharray="26 20" opacity="0.85"/>`,
  ).join('');
  return `
    <rect width="${W}" height="${H}" fill="#0b1c26"/>
    <rect x="200" y="150" width="1200" height="700" fill="#1f7fa6"/>
    <rect x="200" y="150" width="1200" height="700" fill="url(#waterHighlight)"/>
    <g fill="none" stroke="#f4f8f2" stroke-width="8">
      <rect x="200" y="150" width="1200" height="700"/>
    </g>
    ${lanes}`;
}

export function demoPhotoSvg(kind: Kind, variant: Variant): string {
  const night = variant === 'night';
  const body =
    kind === 'grass' ? grass(night) : kind === 'glass' ? glass() : kind === 'clay' ? clay() : pool();
  const transform =
    variant === 'angle' ? 'translate(260 120) scale(0.78 0.62) skewX(-14) translate(-80 180)' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow"><stop offset="0" stop-color="#fff6c8" stop-opacity="0.55"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="1" stop-color="#000000" stop-opacity="0.12"/></linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc3e8"/><stop offset="1" stop-color="#e8d9b5"/></linearGradient>
    <linearGradient id="nightsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1426"/><stop offset="1" stop-color="#23324d"/></linearGradient>
    <linearGradient id="waterHighlight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
  </defs>
  ${variant === 'angle' ? `<rect width="${W}" height="${H}" fill="url(#sky)"/><rect y="560" width="${W}" height="440" fill="#5d6b58"/>` : ''}
  <g transform="${transform}">${body}</g>
  ${night ? `<rect width="${W}" height="${H}" fill="#06122a" opacity="0.45"/>${lights(true)}` : ''}
</svg>`;
}

export type DemoPhotoKind = Kind;
export const demoPhotoVariants: readonly Variant[] = ['day', 'night', 'angle'];
