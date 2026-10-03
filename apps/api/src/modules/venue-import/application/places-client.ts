import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  toWeeklyWindows,
  type GooglePeriod,
  type WeeklyWindowOut,
} from '../domain/opening-hours.js';

export interface PlaceDetails {
  placeId: string;
  name: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  location: { lat: number; lng: number } | null;
  weeklyHours: WeeklyWindowOut[] | null;
}

/** Only these fields are requested (and billed): no photos, no reviews. */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours',
  'places.location',
].join(',');
const CACHE_SECONDS = 30 * 24 * 60 * 60;

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { periods?: GooglePeriod[] };
  location?: { latitude?: number; longitude?: number };
}

/**
 * Google Places API (New), optional (GOOGLE_PLACES_API_KEY). One Text Search per import, biased to
 * the pin, with a field mask; results cached for 30 days (by query and by place id); a hard daily
 * cap keeps usage inside Google's free monthly allowance. Any failure returns null so the import
 * falls back to the map link alone.
 */
export class PlacesClient {
  constructor(
    private readonly apiKey: string | null,
    private readonly dailyCap: number,
    private readonly redis: Redis,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return this.apiKey !== null && this.dailyCap > 0;
  }

  async lookup(
    name: string,
    near: { lat: number; lng: number } | null,
  ): Promise<PlaceDetails | null> {
    if (!this.enabled) return null;
    const queryKey = `places:q:${createHash('sha256')
      .update(
        `${name.toLowerCase()}|${near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : ''}`,
      )
      .digest('hex')
      .slice(0, 32)}`;
    try {
      const cachedId = await this.redis.get(queryKey);
      if (cachedId) {
        const cached = await this.redis.get(`places:id:${cachedId}`);
        if (cached) return JSON.parse(cached) as PlaceDetails;
      }
      // Hard daily cap (Amman day), counted before the call.
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });
      const used = await this.redis
        .multi()
        .incr(`places:day:${day}`)
        .expire(`places:day:${day}`, 2 * 86_400)
        .exec();
      if (Number(used?.[0]?.[1]) > this.dailyCap) return null;

      const response = await this.fetchImpl('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey!,
          'x-goog-fieldmask': FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: name,
          languageCode: 'ar',
          regionCode: 'JO',
          maxResultCount: 1,
          ...(near
            ? {
                locationBias: {
                  circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 500 },
                },
              }
            : {}),
        }),
      });
      if (!response.ok) return null;
      const place = ((await response.json()) as { places?: GooglePlace[] }).places?.[0];
      if (!place?.id) return null;
      const hours = toWeeklyWindows(place.regularOpeningHours?.periods);
      const details: PlaceDetails = {
        placeId: place.id,
        name: place.displayName?.text ?? null,
        phone: place.internationalPhoneNumber ?? null,
        website: place.websiteUri ?? null,
        address: place.formattedAddress ?? null,
        location:
          place.location?.latitude !== undefined && place.location.longitude !== undefined
            ? { lat: place.location.latitude, lng: place.location.longitude }
            : null,
        weeklyHours: hours.length ? hours : null,
      };
      await this.redis
        .multi()
        .set(queryKey, details.placeId, 'EX', CACHE_SECONDS)
        .set(`places:id:${details.placeId}`, JSON.stringify(details), 'EX', CACHE_SECONDS)
        .exec();
      return details;
    } catch {
      return null;
    }
  }
}
