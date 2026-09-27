import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx.js';

const control =
  'w-full rounded-md border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-brand-600 focus:outline-none aria-[invalid=true]:border-danger';

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
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
      <select
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(control, className)}
      >
        {children}
      </select>
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
      <input id={id} type="checkbox" {...rest} className="mt-1 size-4 accent-brand-700" />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
    </div>
  );
}
