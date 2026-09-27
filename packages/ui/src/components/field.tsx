import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx.js';

export const fieldControlClass =
  'w-full min-h-12 rounded-field border border-line bg-surface px-4 py-3 text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-ink-muted hover:border-line-strong focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted aria-[invalid=true]:border-danger';

const control = fieldControlClass;

/** Chevron for native selects (the select itself uses `appearance-none`). */
export function SelectChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: ReactNode, error?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export function TextField({ label, hint, error, className, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(control, className)}
      />
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id'
> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export function TextAreaField({ label, hint, error, className, ...rest }: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(control, 'min-h-24', className)}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <select
          id={id}
          {...rest}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cx(control, 'appearance-none pe-11', className)}
        >
          {children}
        </select>
        <SelectChevron />
      </div>
    </FieldShell>
  );
}

export interface CheckboxFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type'
> {
  label: ReactNode;
}

export function CheckboxField({ label, className, ...rest }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className={cx('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        {...rest}
        className="mt-1 size-5 shrink-0 cursor-pointer rounded accent-brand-700"
      />
      <label htmlFor={id} className="cursor-pointer text-sm leading-relaxed text-ink">
        {label}
      </label>
    </div>
  );
}
