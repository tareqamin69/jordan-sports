import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.js';

/** White panel with the 28px card radius. Flat: shadows are for floating elements only. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-card border border-line bg-surface p-6', className)} />
  );
}

export type AlertTone = 'info' | 'success' | 'error' | 'warning';

const tones: Record<AlertTone, string> = {
  info: 'border-line bg-surface text-ink',
  success: 'border-brand-200 bg-brand-50 text-brand-900',
  error: 'border-danger/30 bg-danger/5 text-danger',
  warning: 'border-accent-400/60 bg-accent-300/40 text-ink',
};

export function Alert({
  tone = 'info',
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: AlertTone }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      {...rest}
      className={cx(
        'rounded-field border px-4 py-3 text-sm leading-relaxed',
        tones[tone],
        className,
      )}
    />
  );
}

/** Small clay label shown above a heading. */
export function Eyebrow({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...rest} className={cx('eyebrow block', className)} />;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-1">{eyebrow}</Eyebrow> : null}
        <h1 className="font-display text-[2rem] leading-[1.2] text-ink text-balance sm:text-[2.75rem]">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

/** Serif section heading with an optional trailing link/action on the same baseline. */
export function SectionHeading({
  id,
  title,
  eyebrow,
  action,
  className,
}: {
  id?: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-1">{eyebrow}</Eyebrow> : null}
        <h2 id={id} className="font-display text-[1.75rem] leading-[1.25] text-ink">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0 pb-1 text-sm font-medium">{action}</div> : null}
    </div>
  );
}

export function Badge({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex h-7 items-center rounded-full bg-canvas px-3 text-xs font-medium text-ink',
        className,
      )}
    />
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-2 text-ink-muted">
      <span
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

/** Phone numbers and other LTR tokens inside RTL text. */
export function Ltr({ children }: { children: ReactNode }) {
  return (
    <bdi dir="ltr" className="whitespace-nowrap">
      {children}
    </bdi>
  );
}
