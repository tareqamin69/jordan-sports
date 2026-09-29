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

/*
 * Presets shaped like the app's common screens, so every loading state looks like the content it
 * stands in for without each screen drawing its own.
 */

/** A list of rows (thumbnail/icon, two lines, trailing badge) — bookings, users, venues… */
export function ListSkeleton({
  label,
  rows = 4,
  thumb = true,
  className,
}: {
  label: string;
  rows?: number;
  thumb?: boolean;
  className?: string | undefined;
}) {
  return (
    <SkeletonGroup label={label} className={cx('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-card border border-line bg-surface p-4"
        >
          {thumb ? <Skeleton className="size-12 shrink-0 rounded-2xl" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4" style={{ width: `${55 - (i % 3) * 10}%` }} />
            <Skeleton className="h-3" style={{ width: `${35 + (i % 2) * 15}%` }} />
          </div>
          <Skeleton className="h-7 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** KPI / stat tiles (a number over a label). */
export function StatsSkeleton({
  label,
  count = 4,
  className,
}: {
  label: string;
  count?: number;
  className?: string | undefined;
}) {
  return (
    <SkeletonGroup label={label} className={cx('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A form: label + field pairs and a button. */
export function FormSkeleton({
  label,
  fields = 4,
  className,
}: {
  label: string;
  fields?: number;
  className?: string | undefined;
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cx(
        'flex flex-col gap-5 rounded-card border border-line bg-surface p-5',
        className,
      )}
    >
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 rounded-2xl" />
        </div>
      ))}
      <Skeleton className="h-12 w-36 rounded-full" />
    </SkeletonGroup>
  );
}

/** A detail page: title, summary card and a few text lines. */
export function DetailSkeleton({
  label,
  className,
}: {
  label: string;
  className?: string | undefined;
}) {
  return (
    <SkeletonGroup label={label} className={cx('flex flex-col gap-4', className)}>
      <Skeleton className="h-9 w-56" />
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-24" />
            </span>
          ))}
        </div>
        <SkeletonText lines={3} />
      </div>
    </SkeletonGroup>
  );
}

/** A day/week grid (calendar, schedules). */
export function GridSkeleton({
  label,
  columns = 7,
  rows = 6,
  className,
}: {
  label: string;
  columns?: number;
  rows?: number;
  className?: string | undefined;
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cx('grid gap-1.5 rounded-card border border-line bg-surface p-3', className)}
    >
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns * rows }, (_, i) => (
          <Skeleton key={i} className={cx('h-10', i < columns && 'h-6')} />
        ))}
      </div>
    </SkeletonGroup>
  );
}
