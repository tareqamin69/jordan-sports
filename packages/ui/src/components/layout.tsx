import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.js';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx('rounded-lg border border-line bg-surface p-5 shadow-sm', className)}
    />
  );
}

export type AlertTone = 'info' | 'success' | 'error' | 'warning';

const tones: Record<AlertTone, string> = {
  info: 'border-brand-200 bg-brand-50 text-ink',
  success: 'border-brand-300 bg-brand-50 text-brand-900',
  error: 'border-danger/40 bg-danger/5 text-danger',
  warning: 'border-accent-500 bg-accent-300/40 text-ink',
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
      className={cx('rounded-md border px-4 py-3 text-sm', tones[tone], className)}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex items-center rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-muted',
        className,
      )}
    />
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-ink-muted">
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
