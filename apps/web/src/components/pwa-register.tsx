'use client';

import { useEffect } from 'react';

/** Registers the service worker (production only — a dev-mode SW fights Next's own HMR/caching). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js');
  }, []);
  return null;
}
