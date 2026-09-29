import { describe, expect, it } from 'vitest';
import {
  pickPhotos,
  stableIndex,
  type PexelsHit,
} from '../../src/modules/stock-photos/domain/manifest.js';

const hit = (id: number, width = 4000, height = 2600): PexelsHit => ({
  id,
  width,
  height,
  url: `https://www.pexels.com/photo/${id}/`,
  photographer: 'P',
  photographer_url: 'https://www.pexels.com/@p',
  src: { original: `https://images.pexels.com/photos/${id}/x.jpeg` },
});

describe('stock photo selection', () => {
  it('keeps relevance order, skips small, portrait, excluded, duplicate and already used photos', () => {
    const hits = [
      hit(1),
      hit(2, 1200, 800),
      hit(3, 2000, 3000),
      hit(4),
      hit(1),
      hit(5),
      hit(6),
      hit(7),
    ];
    const chosen = pickPhotos(hits, 3, {
      exclude: new Set(['pexels-4']),
      taken: new Set(['pexels-5']),
    });
    expect(chosen.map((h) => h.id)).toEqual([1, 6, 7]);
  });

  it('gives each venue a stable photo', () => {
    expect(stableIndex('venue-a', 4)).toBe(stableIndex('venue-a', 4));
    expect(stableIndex('anything', 0)).toBe(0);
    const spread = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => stableIndex(s, 4)));
    expect(spread.size).toBeGreaterThan(1);
  });
});
