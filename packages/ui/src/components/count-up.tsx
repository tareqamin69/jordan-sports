import type { CSSProperties } from 'react';

/**
 * An integer that counts up from 0 once (CSS only, see `.count-up` in motion.css). Screen readers
 * and text search get the real number; with reduced motion it simply shows it.
 */
export function CountUp({ value, className }: { value: number; className?: string | undefined }) {
  const n = Math.round(value);
  return (
    <span className={className}>
      <span className="sr-only">{n}</span>
      <span aria-hidden className="count-up" style={{ '--to': n } as CSSProperties} />
    </span>
  );
}
