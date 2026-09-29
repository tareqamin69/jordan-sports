'use client';

import { useEffect, useRef } from 'react';

/**
 * For a horizontally scrolling nav (phones): keeps the current item (`aria-current`) in view by
 * scrolling only the list itself — never the page. Re-runs when `key` (e.g. the path) changes.
 */
export function useActiveInView<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const list = ref.current;
    const item = list?.querySelector<HTMLElement>('[aria-current]');
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    const l = list.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.left < l.left || r.right > l.right) {
      list.scrollLeft += r.left - l.left - (l.width - r.width) / 2;
    }
  }, [key]);
  return ref;
}
