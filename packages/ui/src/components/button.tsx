import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx.js';

export type ButtonVariant =
  'primary' | 'secondary' | 'danger' | 'ghost' | 'ghostDanger' | 'inverse' | 'night';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover disabled:bg-brand-200 disabled:text-brand-800',
  secondary:
    'border border-line bg-surface text-ink hover:border-line-strong hover:bg-canvas disabled:text-ink-muted',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  ghost: 'text-primary hover:bg-brand-50 disabled:text-ink-muted',
  ghostDanger: 'text-danger hover:bg-danger/5 disabled:text-ink-muted',
  inverse: 'bg-canvas text-ink hover:bg-white disabled:opacity-60',
  night: 'bg-night text-canvas hover:bg-black disabled:opacity-60',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-4 text-sm',
  md: 'min-h-12 px-6 text-[15px]',
  lg: 'min-h-14 px-7 text-base',
};

/** Shared class list so links can look exactly like buttons. */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string | undefined } = {}) {
  return cx(
    'inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,border-color,color,transform,opacity] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
    sizes[size],
    variants[variant],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
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
      className={buttonClass({ variant, size, className })}
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
