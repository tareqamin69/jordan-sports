import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx.js';

/**
 * A shimmering placeholder block shaped like the content it stands in for. Purely visual: wrap a
 * group of them in `SkeletonGroup`, which announces the loading state once to screen readers.
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  return <span aria-hidden className={cx('skeleton block rounded-lg', className)} style={style} />;
}

/** Lines of text (the last one shorter, like real paragraphs). */
export function SkeletonText({
  lines = 2,
  className,
}: {
  lines?: number;
  className?: string | undefined;
}) {
  return (
    <span aria-hidden className={cx('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="skeleton block h-3.5 rounded-full"
          style={{ width: i === lines - 1 && lines > 1 ? '62%' : '100%' }}
        />
      ))}
    </span>
  );
}

export function SkeletonGroup({
  label,
  className,
  children,
}: {
  /** e.g. "لحظة…" — read once by screen readers, never shown. */
  label: string;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
