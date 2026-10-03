'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Where the player wants venues sorted from, chosen once and remembered on this device:
 * - `geo`: their position (asked for only after they tap "use my location");
 * - `governorate`: a governorate they picked instead;
 * - `later`: they said "later" (we stop asking, and offer the governorate chips instead).
 *
 * Privacy (see the privacy policy): only the choice is stored, in this browser. The position itself
 * stays in memory for sorting and filtering on the device; it is never sent to or stored by the
 * server.
 */
export type PlacePreference =
  { mode: 'geo' } | { mode: 'governorate'; key: string } | { mode: 'later' };

export type Coords = { lat: number; lng: number };

const KEY = 'jorena-place';
const listeners = new Set<() => void>();
let coords: Coords | null = null;

function read(): PlacePreference | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PlacePreference;
    if (value.mode === 'geo' || value.mode === 'later') return value;
    if (value.mode === 'governorate' && typeof value.key === 'string') return value;
    return null;
  } catch {
    return null;
  }
}

// Snapshot cache so useSyncExternalStore sees a stable object between changes.
let snapshot: PlacePreference | null | undefined;
function getSnapshot(): PlacePreference | null {
  if (snapshot === undefined) snapshot = read();
  return snapshot;
}

function write(value: PlacePreference | null) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or blocked storage: the choice simply lasts for this page view.
  }
  snapshot = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function locate(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { timeout: 10_000, maximumAge: 600_000 },
    );
  });
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: Coords, b: Coords): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

type LocateStatus = 'idle' | 'locating' | 'denied';
let status: LocateStatus = 'idle';
let positionSnapshot: { coords: Coords | null; status: LocateStatus } = { coords: null, status };

function setLocate(next: { coords?: Coords | null; status: LocateStatus }) {
  if (next.coords !== undefined) coords = next.coords;
  status = next.status;
  positionSnapshot = { coords, status };
  for (const listener of listeners) listener();
}

const idleSnapshot = { coords: null, status: 'idle' as LocateStatus };

/** Reads the position (no prompt once permission is granted); a failure falls back to "later". */
async function ensurePosition(): Promise<boolean> {
  if (coords) return true;
  if (status === 'locating') return false;
  setLocate({ status: 'locating' });
  try {
    setLocate({ coords: await locate(), status: 'idle' });
    return true;
  } catch {
    setLocate({ status: 'denied' });
    write({ mode: 'later' });
    return false;
  }
}

/**
 * The remembered place preference plus, in `geo` mode, the current position. With a stored `geo`
 * choice the position is read again on each visit without a prompt (the browser already has the
 * permission); if the permission was withdrawn, the choice falls back to "later".
 */
export function usePlace() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const located = useSyncExternalStore(
    subscribe,
    () => positionSnapshot,
    () => idleSnapshot,
  );

  useEffect(() => {
    if (preference?.mode === 'geo') void ensurePosition();
  }, [preference]);

  /** Only called from a tap on "use my location": this is when the browser asks. */
  const shareLocation = useCallback(async () => {
    const ok = await ensurePosition();
    if (ok) write({ mode: 'geo' });
    return ok;
  }, []);

  const chooseGovernorate = useCallback((key: string) => write({ mode: 'governorate', key }), []);
  const later = useCallback(() => write({ mode: 'later' }), []);
  const reset = useCallback(() => {
    setLocate({ coords: null, status: 'idle' });
    write(null);
  }, []);

  return {
    preference,
    position: preference?.mode === 'geo' ? located.coords : null,
    governorate: preference?.mode === 'governorate' ? preference.key : null,
    status: located.status,
    shareLocation,
    chooseGovernorate,
    later,
    reset,
  };
}
