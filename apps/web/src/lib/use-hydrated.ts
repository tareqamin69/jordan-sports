'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

/**
 * False during server rendering and hydration, true after. For UI that depends on client-only
 * data (e.g. the signed-in user): rendering the server's version while hydrating avoids a
 * mismatch when that data happens to arrive before a late-hydrating (Suspense) part hydrates.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
