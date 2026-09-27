import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx.js';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-300',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas disabled:text-ink-muted',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  ghost: 'text-brand-800 hover:bg-brand-50 disabled:text-ink-muted',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5',
        variants[variant],
        className,
      )}
    >
      {busy ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
}
